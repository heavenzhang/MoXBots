//! Correlation only. No plaintext, execution queue or message replay lives here.
use super::*;

/// Minted by MetadataStore while its policy transaction remains locked through
/// the relay transition. A client-supplied revision is never this evidence.
#[derive(Clone, Debug)]
pub struct TrustedMountEvidence {
    pub mount_id: String,
    pub device_id: String,
    pub key_generation: u64,
    pub connection_epoch: String,
    pub membership_revision: u64,
    pub enable_revision: u64,
}

#[derive(Clone, Debug)]
pub struct OperationPeers {
    pub source_device_id: String,
    pub target_device_id: String,
    pub mount_id: String,
}

#[derive(Clone)]
pub(super) struct Endpoint {
    pub connection_id: String,
    scope: DeviceScope,
    session: String,
    key: String,
    certificate: String,
    binding: String,
    epoch: String,
}
impl Endpoint {
    fn new(id: &str, c: &Connection) -> Self {
        Self {
            connection_id: id.into(),
            scope: c.device.scope.clone(),
            session: c.device.session_handle.clone(),
            key: c.device.key_fingerprint.clone(),
            certificate: c.device.certificate_fingerprint.clone(),
            binding: c.device.binding_id.clone(),
            epoch: c.connection_epoch.clone(),
        }
    }
    fn matches(&self, c: &Connection) -> bool {
        self.scope == c.device.scope
            && self.session == c.device.session_handle
            && self.key == c.device.key_fingerprint
            && self.certificate == c.device.certificate_fingerprint
            && self.binding == c.device.binding_id
    }
}

pub(super) struct PreparedOperation {
    pub source: Endpoint,
    pub target: Endpoint,
    mount: String,
    channel: String,
    pub expires_ms: i64,
}

pub(super) struct ReturnRoute {
    source: Endpoint,
    target: Endpoint,
    mount: String,
    op_id: String,
    pub(super) attempt_id: String,
    admission_source_epoch: String,
    admission_target_epoch: String,
    permit_id: String,
    membership: u64,
    enabled: u64,
    recoverable: bool,
    pub deadline_ms: Option<i64>,
    permit_until: i64,
}
impl ReturnRoute {
    pub(super) fn has_device(&self, id: &str) -> bool {
        self.source.scope.device_id == id || self.target.scope.device_id == id
    }
}

impl RelayCore {
    /// Non-authorizing lookup used only to select both live AuthStore gates.
    /// It is re-evaluated under the runtime lock before applying the control.
    pub fn operation_peers(
        &self,
        sender: &str,
        value: &Value,
    ) -> Result<OperationPeers, RelayError> {
        let connection = self.connections.get(sender).ok_or(RelayError::Connection)?;
        let (source, target, mount) = match value["type"].as_str() {
            Some("op.prepare") => {
                let ch = self
                    .channels
                    .get(text(value, "channelId")?)
                    .ok_or(RelayError::Channel)?;
                if ch.state != ChannelState::Ready {
                    return Err(RelayError::Channel);
                }
                let peer = if ch.initiator == sender {
                    &ch.responder
                } else if ch.responder == sender {
                    &ch.initiator
                } else {
                    return Err(RelayError::Unauthorized);
                };
                let target = self.connections.get(peer).ok_or(RelayError::Connection)?;
                return Ok(OperationPeers {
                    source_device_id: connection.device.scope.device_id.clone(),
                    target_device_id: target.device.scope.device_id.clone(),
                    mount_id: text(value, "targetMountId")?.into(),
                });
            }
            Some("permit.acquire") => {
                if let Some(op) = self.operations.get(text(value, "opId")?) {
                    (&op.source, &op.target, &op.mount)
                } else {
                    let route = self
                        .returns
                        .values()
                        .find(|r| r.op_id == value["opId"])
                        .ok_or(RelayError::Unauthorized)?;
                    (&route.source, &route.target, &route.mount)
                }
            }
            Some("route.resume" | "route.rebind") => {
                let route = self
                    .returns
                    .get(text(value, "returnRouteId")?)
                    .ok_or(RelayError::Unauthorized)?;
                (&route.source, &route.target, &route.mount)
            }
            _ => return Err(RelayError::Control),
        };
        if !source.matches(connection) && !target.matches(connection) {
            return Err(RelayError::Unauthorized);
        }
        Ok(OperationPeers {
            source_device_id: source.scope.device_id.clone(),
            target_device_id: target.scope.device_id.clone(),
            mount_id: mount.clone(),
        })
    }

    fn current_endpoint(&self, endpoint: &Endpoint, now: i64) -> Result<Endpoint, RelayError> {
        let (id, c) = self
            .connections
            .iter()
            .find(|(_, c)| c.device.scope.device_id == endpoint.scope.device_id && c.ready)
            .ok_or(RelayError::Connection)?;
        if !endpoint.matches(c) {
            return Err(RelayError::Unauthorized);
        }
        self.live_connection(id, now)?;
        Ok(Endpoint::new(id, c))
    }

    pub(super) fn operation_control(
        &mut self,
        sender: &str,
        v: &Value,
        mount: TrustedMountEvidence,
        now: i64,
        now_ms: i64,
    ) -> Result<Vec<Effect>, RelayError> {
        let peers = self.operation_peers(sender, v)?;
        if mount.mount_id != peers.mount_id || mount.device_id != peers.target_device_id {
            return Err(RelayError::Unauthorized);
        }
        let target = self
            .connections
            .values()
            .find(|c| {
                c.device.scope.device_id == mount.device_id
                    && c.device.scope.key_generation == mount.key_generation
                    && c.connection_epoch == mount.connection_epoch
                    && c.ready
            })
            .ok_or(RelayError::Connection)?;
        if target.device.membership_revision != mount.membership_revision {
            return Err(RelayError::Unauthorized);
        }
        match text(v, "type")? {
            "op.prepare" => {
                let op_id = text(v, "opId")?;
                if self.operations.contains_key(op_id)
                    || self.completed_ops.contains_key(op_id)
                    || self.returns.values().any(|r| r.op_id == op_id)
                {
                    return Err(RelayError::Replay);
                }
                if self.operations.len() >= budget("pending")
                    || self.operations.len() + self.returns.len() + self.completed_ops.len()
                        >= budget("receipts")
                {
                    return Err(RelayError::Capacity);
                }
                let ch = self
                    .channels
                    .get(text(v, "channelId")?)
                    .ok_or(RelayError::Channel)?;
                let target_id = if ch.initiator == sender {
                    &ch.responder
                } else {
                    &ch.initiator
                };
                let source = Endpoint::new(sender, self.live_connection(sender, now)?);
                let target = Endpoint::new(target_id, self.live_connection(target_id, now)?);
                if !same_principal_network(&source.scope, &target.scope)
                    || target.scope.device_id != mount.device_id
                {
                    return Err(RelayError::Unauthorized);
                }
                let mut response = self.scoped(sender, v, "op.prepared")?;
                response["opId"] = op_id.into();
                response["targetMountId"] = mount.mount_id.clone().into();
                response["target"] =
                    serde_json::to_value(&target.scope).map_err(|_| RelayError::Unavailable)?;
                response["targetConnectionEpoch"] = target.epoch.clone().into();
                let effect = control_effect(sender, response)?;
                self.operations.insert(
                    op_id.into(),
                    PreparedOperation {
                        source,
                        target,
                        mount: mount.mount_id,
                        channel: text(v, "channelId")?.into(),
                        expires_ms: now_ms.saturating_add(210_000),
                    },
                );
                Ok(vec![effect])
            }
            "permit.acquire" => {
                let op_id = text(v, "opId")?;
                if v["targetMountId"] != mount.mount_id
                    || v["expectedMembershipRevision"] != mount.membership_revision
                    || v["expectedEnableRevision"] != mount.enable_revision
                {
                    return Err(RelayError::Unauthorized);
                }
                if let Some((route_id, route)) = self.returns.iter().find(|(_, r)| r.op_id == op_id)
                {
                    let source = self.current_endpoint(&route.source, now)?;
                    let target = self.current_endpoint(&route.target, now)?;
                    if route.target.connection_id != sender
                        || route.attempt_id != text(v, "attemptId")?
                        || route.permit_until <= now_ms
                        || route.membership != mount.membership_revision
                        || route.enabled != mount.enable_revision
                        || route.deadline_ms.is_some()
                        || source.epoch != route.admission_source_epoch
                        || target.epoch != route.admission_target_epoch
                    {
                        return Err(RelayError::Replay);
                    }
                    return Ok(vec![self.permit_effect(sender, v, route_id, route, now_ms)?]);
                }
                let op = self.operations.get(op_id).ok_or(RelayError::Unauthorized)?;
                if op.target.connection_id != sender
                    || op.expires_ms <= now_ms
                    || !self.channels.contains_key(&op.channel)
                {
                    return Err(RelayError::Unauthorized);
                }
                let source = self.current_endpoint(&op.source, now)?;
                let target = self.current_endpoint(&op.target, now)?;
                // Original admission cannot migrate to another socket. Only a
                // previously minted return route can be resumed.
                if source.epoch != op.source.epoch || target.epoch != op.target.epoch {
                    return Err(RelayError::Connection);
                }
                if self.returns.len() >= budget("returns")
                    || self
                        .returns
                        .values()
                        .filter(|r| r.target.scope == target.scope)
                        .count()
                        >= budget("returns") / 2
                {
                    return Err(RelayError::Capacity);
                }
                if self
                    .returns
                    .values()
                    .filter(|r| r.target.scope == target.scope && r.permit_until > now_ms)
                    .count()
                    >= budget("permits")
                {
                    return Err(RelayError::Capacity);
                }
                let recoverable = self.connections[&source.connection_id].return_resume
                    && self.connections[&target.connection_id].return_resume;
                let id = Uuid::new_v4().to_string();
                let route = ReturnRoute {
                    admission_source_epoch: source.epoch.clone(),
                    admission_target_epoch: target.epoch.clone(),
                    source,
                    target,
                    mount: mount.mount_id,
                    op_id: op_id.into(),
                    attempt_id: text(v, "attemptId")?.into(),
                    permit_id: Uuid::new_v4().to_string(),
                    membership: mount.membership_revision,
                    enabled: mount.enable_revision,
                    recoverable,
                    deadline_ms: None,
                    permit_until: now_ms.saturating_add(budget("permitMs") as i64),
                };
                // The source must learn the association before any target may
                // execute and emit a terminal event.
                let opened = self.route_effect(
                    &route.source.connection_id,
                    &id,
                    &route,
                    "route.opened",
                    None,
                )?;
                let permit = self.permit_effect(sender, v, &id, &route, now_ms)?;
                self.operations.remove(op_id);
                self.returns.insert(id, route);
                Ok(vec![opened, permit])
            }
            "route.resume" => {
                let id = text(v, "returnRouteId")?;
                let route = self.returns.get(id).ok_or(RelayError::Unauthorized)?;
                if !route.recoverable
                    || route.deadline_ms.is_some_and(|d| d <= now_ms)
                    || route.membership != mount.membership_revision
                    || route.enabled != mount.enable_revision
                {
                    return Ok(self.close_return(id, "RETURN_UNAVAILABLE"));
                }
                let source = self.current_endpoint(&route.source, now)?;
                let target = self.current_endpoint(&route.target, now)?;
                if !self.connections[&source.connection_id].return_resume
                    || !self.connections[&target.connection_id].return_resume
                {
                    return Ok(self.close_return(id, "RETURN_UNAVAILABLE"));
                }
                let route = self.returns.get_mut(id).ok_or(RelayError::Unavailable)?;
                // Identity/epoch recovery alone is not a usable return channel.
                // Preserve the original outage deadline until the exact fresh
                // TLS channel is authorized by rebind.
                route.source = source;
                route.target = target;
                let route = &self.returns[id];
                Ok(vec![
                    self.route_effect(
                        &route.source.connection_id,
                        id,
                        route,
                        "route.resumed",
                        None,
                    )?,
                    self.route_effect(
                        &route.target.connection_id,
                        id,
                        route,
                        "route.resumed",
                        None,
                    )?,
                ])
            }
            "route.rebind" => {
                let id = text(v, "returnRouteId")?;
                let route = self.returns.get(id).ok_or(RelayError::Unauthorized)?;
                if route.target.connection_id != sender
                    || route.deadline_ms.is_some_and(|d| d <= now_ms)
                    || route.membership != mount.membership_revision
                    || route.enabled != mount.enable_revision
                {
                    return Err(RelayError::Unauthorized);
                }
                let source = self.current_endpoint(&route.source, now)?;
                let target = self.current_endpoint(&route.target, now)?;
                if source.epoch != route.source.epoch || target.epoch != route.target.epoch {
                    return Err(RelayError::Connection);
                }
                let ch_id = text(v, "channelId")?;
                let ch = self.channels.get(ch_id).ok_or(RelayError::Channel)?;
                if ch.state != ChannelState::Ready
                    || ![&ch.initiator, &ch.responder].contains(&&source.connection_id)
                    || ![&ch.initiator, &ch.responder].contains(&&target.connection_id)
                {
                    return Err(RelayError::Channel);
                }
                let mut response = self.scoped(sender, v, "route.rebound")?;
                response["returnRouteId"] = id.into();
                response["channelId"] = ch_id.into();
                let effect = control_effect(sender, response)?;
                let mut source_ack = self.scoped(
                    &route.source.connection_id,
                    &json!({"controlId":Uuid::new_v4().to_string()}),
                    "route.rebound",
                )?;
                source_ack["returnRouteId"] = id.into();
                source_ack["channelId"] = ch_id.into();
                let source_ack = control_effect(&route.source.connection_id, source_ack)?;
                self.returns
                    .get_mut(id)
                    .expect("validated route")
                    .deadline_ms = None;
                Ok(vec![source_ack, effect])
            }
            _ => Err(RelayError::Control),
        }
    }

    fn scoped(&self, sender: &str, request: &Value, kind: &str) -> Result<Value, RelayError> {
        let c = self.connections.get(sender).ok_or(RelayError::Connection)?;
        Ok(
            json!({"version":1,"controlId":request["controlId"],"type":kind,"serviceId":self.config.service_id,
            "networkId":self.config.network_id,"bootEpoch":self.boot_epoch,"connectionEpoch":c.connection_epoch}),
        )
    }

    fn permit_effect(
        &self,
        sender: &str,
        request: &Value,
        id: &str,
        r: &ReturnRoute,
        now_ms: i64,
    ) -> Result<Effect, RelayError> {
        let mut v = self.scoped(sender, request, "permit.result")?;
        for (k, value) in [
            ("opId", json!(r.op_id)),
            ("attemptId", json!(r.attempt_id)),
            ("permitId", json!(r.permit_id)),
            ("source", json!(r.source.scope)),
            ("target", json!(r.target.scope)),
            ("sourceConnectionEpoch", json!(r.source.epoch)),
            ("targetConnectionEpoch", json!(r.target.epoch)),
            ("targetMountId", json!(r.mount)),
            ("membershipRevision", json!(r.membership)),
            ("enableRevision", json!(r.enabled)),
            ("freshnessMs", json!((r.permit_until - now_ms).max(0))),
            ("returnRouteId", json!(id)),
        ] {
            v[k] = value;
        }
        if r.recoverable {
            v["recoverable"] = true.into();
        }
        control_effect(sender, v)
    }

    fn route_effect(
        &self,
        recipient: &str,
        id: &str,
        r: &ReturnRoute,
        kind: &str,
        reason: Option<&str>,
    ) -> Result<Effect, RelayError> {
        let mut v = self.scoped(
            recipient,
            &json!({"controlId":Uuid::new_v4().to_string()}),
            kind,
        )?;
        v["returnRouteId"] = id.into();
        match kind {
            "route.opened" => {
                v["opId"] = r.op_id.clone().into();
                v["source"] = json!(r.source.scope);
                v["target"] = json!(r.target.scope);
                v["targetMountId"] = r.mount.clone().into();
                if r.recoverable {
                    v["recoverable"] = true.into();
                }
                v["sourceConnectionEpoch"] = r.source.epoch.clone().into();
                v["targetConnectionEpoch"] = r.target.epoch.clone().into();
            }
            "route.resumed" => {
                v["sourceConnectionEpoch"] = r.source.epoch.clone().into();
                v["targetConnectionEpoch"] = r.target.epoch.clone().into();
            }
            "route.suspended" => {
                v["remainingMs"] = json!(r
                    .deadline_ms
                    .unwrap_or(self.now_ms)
                    .saturating_sub(self.now_ms)
                    .max(0));
            }
            "route.closed" => {
                v["reason"] = reason.unwrap_or("RETURN_UNAVAILABLE").into();
            }
            _ => return Err(RelayError::Control),
        }
        control_effect(recipient, v)
    }

    pub(super) fn release_operation(
        &mut self,
        sender: &str,
        v: &Value,
        now: i64,
    ) -> Result<Vec<Effect>, RelayError> {
        let c = self.live_connection(sender, now)?;
        if v["type"] == "op.release" {
            let id = text(v, "opId")?;
            if let Some(op) = self.operations.get(id) {
                if !op.source.matches(c) {
                    return Err(RelayError::Unauthorized);
                }
                self.operations.remove(id);
            }
            Ok(vec![])
        } else {
            let id = text(v, "returnRouteId")?;
            if let Some(r) = self.returns.get(id) {
                if !r.source.matches(c) && !r.target.matches(c) {
                    return Err(RelayError::Unauthorized);
                }
            }
            Ok(self.close_return(id, text(v, "reason")?))
        }
    }

    pub(super) fn close_return(&mut self, id: &str, reason: &str) -> Vec<Effect> {
        let Some(r) = self.returns.remove(id) else {
            return vec![];
        };
        self.completed_ops.insert(
            r.op_id.clone(),
            self.now_ms.saturating_add(budget("returnReceiptMs") as i64),
        );
        [&r.source, &r.target]
            .into_iter()
            .filter_map(|e| {
                let (recipient, _) = self.connections.iter().find(|(_, c)| e.matches(c))?;
                self.route_effect(recipient, id, &r, "route.closed", Some(reason))
                    .ok()
            })
            .collect()
    }

    pub(super) fn suspend_returns(&mut self, sender: &str, reason: &str) -> Vec<Effect> {
        let affected: Vec<_> = self
            .returns
            .iter()
            .filter(|(_, r)| r.source.connection_id == sender || r.target.connection_id == sender)
            .map(|(id, _)| id.clone())
            .collect();
        let mut effects = vec![];
        for id in affected {
            if !self.returns[&id].recoverable
                || !matches!(reason, "connection-disconnected" | "connection-replaced")
            {
                effects.extend(self.close_return(&id, "RETURN_UNAVAILABLE"));
                continue;
            }
            let r = self.returns.get_mut(&id).expect("listed route");
            r.deadline_ms.get_or_insert(
                self.now_ms
                    .saturating_add(budget("returnRecoveryMs") as i64),
            );
            let r = &self.returns[&id];
            for e in [&r.source, &r.target] {
                if e.connection_id != sender && self.connections.contains_key(&e.connection_id) {
                    if let Ok(effect) =
                        self.route_effect(&e.connection_id, &id, r, "route.suspended", None)
                    {
                        effects.push(effect);
                    }
                }
            }
        }
        effects
    }
}

fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str, RelayError> {
    v[key].as_str().ok_or(RelayError::Control)
}
