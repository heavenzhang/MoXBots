//! One owned management request on the existing authenticated actor socket.
//! Route snapshots are not grants. The Host independently authorizes dispatch.
use super::{
    channel::ManagementEvent,
    connection::{send, send_control},
    identity::NetworkIdentity,
    pairs::{Offer, Pairs},
    transport::{DeviceAddress, NetworkSocket, NetworkTransport},
    NetworkError,
};
use futures_util::{SinkExt, StreamExt};
use myagents_agent_network_protocol::{
    decode_tls_frame, ClientMessage, ConnectionScope, DeviceScope, ServerEnvelope, ServerMessage,
};
use myagents_host_management_protocol::{
    CanonicalUuid, Frame, ManagementMessage, ManagementMethod, RequestParams, ResponseResult,
    NAMESPACE, VERSION,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashSet, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio_tungstenite::tungstenite::Message;

/// Frames received while one explicit management request owns the socket.
/// Byte leases remain attached until the original actor dispatches each frame.
/// The queue outlives success, channel errors and management timeouts.
pub(crate) struct DeferredMessages {
    memory: super::memory::MemoryBudget,
    messages: VecDeque<(Message, super::memory::Allocation)>,
    bytes: usize,
    active_channel: Option<ActiveManagementChannel>,
    fatal_overflow: bool,
    controls: VecDeque<ManagementControl>,
}
struct ManagementControl {
    id: String,
    channel: String,
    scope: ConnectionScope,
    open: bool,
    _lease: super::memory::Allocation,
}
#[derive(Clone)]
struct ActiveManagementChannel {
    channel: String,
    open_attempted: bool,
    offered_by_peer: bool,
}
impl DeferredMessages {
    pub(crate) fn new(memory: super::memory::MemoryBudget) -> Self {
        Self {
            memory,
            messages: VecDeque::new(),
            bytes: 0,
            active_channel: None,
            fatal_overflow: false,
            controls: VecDeque::new(),
        }
    }
    fn push(&mut self, message: Message) -> Result<(), NetworkError> {
        let size = message
            .len()
            .checked_add(std::mem::size_of::<Message>())
            .ok_or_else(|| NetworkError::new("RESOURCE_EXHAUSTED"))?;
        if self.messages.len() >= 256
            || size
                > myagents_agent_network_protocol::budget("socketQueueBytes")
                    .saturating_sub(self.bytes)
        {
            self.fatal_overflow = true;
            return Err(NetworkError::new("HOST_MANAGEMENT_DEFERRED_CAPACITY"));
        }
        let lease = match self.memory.reserve(size) {
            Ok(lease) => lease,
            Err(error) => {
                self.fatal_overflow = true;
                return Err(error);
            }
        };
        if self.messages.try_reserve(1).is_err() {
            self.fatal_overflow = true;
            return Err(NetworkError::new("RESOURCE_EXHAUSTED"));
        }
        self.bytes += size;
        self.messages.push_back((message, lease));
        Ok(())
    }
    fn record_control(
        &mut self,
        id: String,
        channel: &str,
        scope: &ConnectionScope,
        open: bool,
    ) -> Result<(), NetworkError> {
        let bytes = 2 * std::mem::size_of::<ManagementControl>()
            + id.len()
            + channel.len()
            + scope.service_id.len()
            + scope.network_id.len()
            + scope.boot_epoch.len()
            + scope.connection_epoch.len();
        let lease = self.memory.reserve(bytes)?;
        if self.controls.len() >= 1024 {
            self.controls.pop_front();
        }
        self.controls
            .try_reserve(1)
            .map_err(|_| NetworkError::new("RESOURCE_EXHAUSTED"))?;
        self.controls.push_back(ManagementControl {
            id,
            channel: channel.into(),
            scope: scope.clone(),
            open,
            _lease: lease,
        });
        Ok(())
    }
    pub(crate) fn cleanup_control(
        &mut self,
        scope: &ConnectionScope,
        channel: &str,
    ) -> Result<String, NetworkError> {
        let id = uuid::Uuid::new_v4().to_string();
        self.record_control(id.clone(), channel, scope, false)?;
        Ok(id)
    }
    /// Exact IDs are recorded before the socket write can be cancelled. Their
    /// connection/channel scope survives the local controller future; unrelated
    /// errors retain the actor's original fail-closed behavior.
    pub(crate) fn consume_control_error(
        &mut self,
        id: &str,
        code: &str,
        scope: &ConnectionScope,
        pairs: &mut Pairs,
    ) -> Result<bool, NetworkError> {
        let Some(record) = self.controls.iter().find(|record| record.id == id) else {
            return Ok(false);
        };
        if record.scope != *scope {
            return Err(NetworkError::new("CONTROL_SCOPE_MISMATCH"));
        }
        if record.open && code == "CHANNEL_PAIR_EXISTS" {
            pairs.retire_management(&record.channel, false);
        }
        Ok(true)
    }
    pub(crate) fn has_pending(&self) -> bool {
        !self.messages.is_empty()
    }
    pub(crate) fn fatal_overflow(&self) -> bool {
        self.fatal_overflow
    }
    /// The actor calls this after its original queue/deadline timeout cancels
    /// this future, so only the cancelled management channel is retired.
    pub(crate) fn retire_cancelled(&mut self, pairs: &mut Pairs) -> Option<String> {
        let active = self.active_channel.take()?;
        pairs.retire_management(&active.channel, active.open_attempted);
        active.offered_by_peer.then_some(active.channel)
    }
    pub(crate) fn pop(&mut self) -> Option<(Message, super::memory::Allocation)> {
        let (message, lease) = self.messages.pop_front()?;
        self.bytes -= message.len() + std::mem::size_of::<Message>();
        Some((message, lease))
    }
}
fn management_control_id(
    channel: &str,
    scope: &ConnectionScope,
    open: bool,
    controls: &mut HashSet<String>,
    deferred: Option<&mut DeferredMessages>,
) -> Result<String, NetworkError> {
    let id = uuid::Uuid::new_v4().to_string();
    if let Some(deferred) = deferred {
        deferred.record_control(id.clone(), channel, scope, open)?;
    }
    controls.insert(id.clone());
    Ok(id)
}
fn unrelated_control(
    message: &ServerMessage,
    channel: &str,
    control_id: &str,
    request_controls: &HashSet<String>,
) -> bool {
    match message {
        ServerMessage::ChannelOffer { channel_id, .. }
        | ServerMessage::ChannelAccepted { channel_id, .. }
        | ServerMessage::ChannelReady { channel_id, .. }
        | ServerMessage::ChannelClosed { channel_id, .. }
        | ServerMessage::Credit { channel_id, .. } => channel_id != channel,
        ServerMessage::Error { .. } => !request_controls.contains(control_id),
        ServerMessage::Hello { .. } => false,
        _ => true,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ManagementRequest {
    pub connection_id: String,
    pub auth_generation: u64,
    pub principal_id: String,
    pub network_id: String,
    pub device_id: String,
    /// First inspection discovers the signed target. Every later read/write
    /// stays bound to that target, including the original receipt lookup.
    #[serde(default)]
    pub target_scope: Option<DeviceScope>,
    pub method: ManagementMethod,
    pub params: RequestParams,
}
impl ManagementRequest {
    pub(crate) fn mutation(&self) -> bool {
        if let RequestParams::RemoteSession(p) = &self.params {
            return self.method == ManagementMethod::RemoteSession && p.remote_session.mutation();
        }
        matches!(
            self.method,
            ManagementMethod::ConfigSet
                | ManagementMethod::CredentialSet
                | ManagementMethod::ResourcesCreate
                | ManagementMethod::ConfigProviderSet
                | ManagementMethod::CredentialProviderSet
                | ManagementMethod::ResourcesRegister
        )
    }
    pub(crate) fn message(&self, id: CanonicalUuid) -> Result<ManagementMessage, NetworkError> {
        if !matches!(
            self.method,
            ManagementMethod::HostSnapshot | ManagementMethod::HostCapabilities
        ) && !matches!(&self.params, RequestParams::RemoteSession(p) if self.method == ManagementMethod::RemoteSession && matches!(p.remote_session,myagents_host_management_protocol::RemoteSessionRequest::Capabilities{..}))
            && self.target_scope.is_none()
        {
            return Err(NetworkError::new("HOST_MANAGEMENT_TARGET_REQUIRED"));
        }
        let message = ManagementMessage::Request {
            request_id: id,
            method: self.method,
            params: self.params.clone(),
        };
        Frame {
            namespace: NAMESPACE.into(),
            version: VERSION,
            sender_sequence: 1,
            channel_id: id,
            message: message.clone(),
        }
        .validate()
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"))?;
        Ok(message)
    }
}

fn matches_target(request: &ManagementRequest, current: &DeviceScope) -> Result<(), NetworkError> {
    if request
        .target_scope
        .as_ref()
        .is_some_and(|expected| expected != current)
    {
        return Err(NetworkError::new("HOST_MANAGEMENT_TARGET_CHANGED"));
    }
    Ok(())
}
#[derive(Serialize)]
pub(crate) struct ManagementResponse {
    pub scope: DeviceScope,
    pub result: ResponseResult,
    #[serde(skip)]
    _allocation: super::memory::Allocation,
}

pub(crate) fn lost(mutation: bool, sent: bool) -> NetworkError {
    NetworkError::new(if mutation && sent {
        "HOST_MANAGEMENT_UNCONFIRMED"
    } else {
        "HOST_MANAGEMENT_NOT_COMPLETED"
    })
}
fn matches_offer(
    offer: &Offer,
    address: &DeviceAddress,
    local: &DeviceScope,
    epoch: &str,
) -> Result<(), NetworkError> {
    offer.validate_scope(local, epoch)?;
    let (peer, peer_epoch, binding) = if offer.initiator == *local {
        (
            &offer.responder,
            &offer.responder_epoch,
            &offer.responder_binding,
        )
    } else {
        (
            &offer.initiator,
            &offer.initiator_epoch,
            &offer.initiator_binding,
        )
    };
    if peer != &address.scope
        || peer_epoch != &address.connection_epoch
        || binding.as_deref() != Some(address.signed_binding.as_str())
    {
        return Err(NetworkError::new("HOST_MANAGEMENT_TARGET_CHANGED"));
    }
    Ok(())
}
fn mutation_matches(value: &impl serde::Serialize, id: CanonicalUuid) -> bool {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.get("mutationId").cloned())
        == serde_json::to_value(id).ok()
}
/// This code is emitted only after a READY, single read-only probe is retired.
pub(crate) fn isolated_unsupported_probe(
    request: &ManagementRequest,
    error: &NetworkError,
) -> bool {
    request.method == ManagementMethod::HostCapabilities
        && error.code == "HOST_MANAGEMENT_EXTENSIONS_UNAVAILABLE"
}
fn response_matches(request: &ManagementRequest, result: &ResponseResult) -> bool {
    use myagents_host_management_protocol::{Owner, ProviderConfigReceipt, ResourceReceipt};
    match (request.method, &request.params, result) {
        (
            ManagementMethod::RemoteSession,
            RequestParams::RemoteSession(p),
            ResponseResult::RemoteSession { data },
        ) => return p.remote_session.matches_result(data),
        (
            ManagementMethod::HostCapabilities,
            RequestParams::Snapshot(_),
            ResponseResult::Capabilities(_),
        ) => return true,
        (
            ManagementMethod::HostInspect,
            RequestParams::Snapshot(_),
            ResponseResult::ExtendedSnapshot(s),
        ) => return s.host_id.as_uuid().to_string() == request.device_id,
        (
            ManagementMethod::ResourcesDirectoryList,
            RequestParams::ResourcesDirectoryList(p),
            ResponseResult::DirectoryList(d),
        ) => return p.root_id == d.root_id && p.relative_path == d.relative_path,
        (
            ManagementMethod::ConfigProviderSet,
            RequestParams::ConfigProviderSet(p),
            ResponseResult::ProviderConfigReceipt(r),
        ) => {
            return match r {
                ProviderConfigReceipt::Persisted {
                    mutation_id,
                    settings,
                    ..
                } => *mutation_id == p.mutation_id && settings.provider_id == p.provider.id,
                ProviderConfigReceipt::Conflict { mutation_id, .. } => {
                    *mutation_id == p.mutation_id
                }
                ProviderConfigReceipt::NotFound { .. } => false,
            }
        }
        (
            ManagementMethod::CredentialProviderSet,
            RequestParams::CredentialSet(p),
            ResponseResult::ProviderCredentialReceipt(r),
        ) => return mutation_matches(r, p.mutation_id),
        (
            ManagementMethod::ReceiptProviderGet,
            RequestParams::ReceiptProviderGet(p),
            ResponseResult::ProviderCredentialReceipt(r),
        ) if p.owner == Owner::Credentials => return mutation_matches(r, p.mutation_id),
        (
            ManagementMethod::ReceiptProviderGet,
            RequestParams::ReceiptProviderGet(p),
            ResponseResult::ProviderConfigReceipt(r),
        ) if p.owner == Owner::Config => {
            return match r {
                ProviderConfigReceipt::Persisted {
                    mutation_id,
                    settings,
                    ..
                } => *mutation_id == p.mutation_id && settings.provider_id == p.provider_id,
                ProviderConfigReceipt::Conflict { mutation_id, .. }
                | ProviderConfigReceipt::NotFound { mutation_id } => *mutation_id == p.mutation_id,
            }
        }
        (
            ManagementMethod::ReceiptProviderGet,
            RequestParams::ReceiptProviderGet(p),
            ResponseResult::ReceiptNotFound { mutation_id, owner },
        ) => return p.mutation_id == *mutation_id && p.owner == *owner,
        (
            ManagementMethod::ResourcesRegister,
            RequestParams::ResourcesRegister(p),
            ResponseResult::ResourceReceipt(r),
        ) => {
            return !matches!(r, ResourceReceipt::NotFound { .. })
                && mutation_matches(r, p.mutation_id)
        }
        (_, _, ResponseResult::Error { .. }) => return true,
        (
            ManagementMethod::RemoteSession
            | ManagementMethod::HostCapabilities
            | ManagementMethod::HostInspect
            | ManagementMethod::ConfigProviderSet
            | ManagementMethod::CredentialProviderSet
            | ManagementMethod::ReceiptProviderGet
            | ManagementMethod::ResourcesDirectoryList
            | ManagementMethod::ResourcesRegister,
            _,
            _,
        ) => return false,
        _ => {}
    }
    match (&request.params, result) {
        (_, ResponseResult::Error { .. }) => true,
        (RequestParams::Snapshot(_), ResponseResult::Snapshot(snapshot)) => {
            snapshot.host_id.as_uuid().to_string() == request.device_id
        }
        (
            RequestParams::ConfigSet(_),
            ResponseResult::ConfigReceipt(
                myagents_host_management_protocol::ConfigReceipt::NotFound { .. },
            ),
        ) => false,
        (RequestParams::ConfigSet(p), ResponseResult::ConfigReceipt(r)) => {
            serde_json::to_value(r)
                .ok()
                .and_then(|v| v.get("mutationId").cloned())
                == serde_json::to_value(p.mutation_id).ok()
        }
        (
            RequestParams::ResourcesCreate(_),
            ResponseResult::ResourceReceipt(
                myagents_host_management_protocol::ResourceReceipt::NotFound { .. },
            ),
        ) => false,
        (RequestParams::ResourcesCreate(p), ResponseResult::ResourceReceipt(r)) => {
            serde_json::to_value(r)
                .ok()
                .and_then(|v| v.get("mutationId").cloned())
                == serde_json::to_value(p.mutation_id).ok()
        }
        (RequestParams::CredentialSet(p), ResponseResult::CredentialReceipt(r)) => {
            serde_json::to_value(r)
                .ok()
                .and_then(|v| v.get("mutationId").cloned())
                == serde_json::to_value(p.mutation_id).ok()
        }
        (RequestParams::ReceiptGet(p), ResponseResult::CredentialReceipt(r))
            if p.owner == myagents_host_management_protocol::Owner::Credentials =>
        {
            serde_json::to_value(r)
                .ok()
                .and_then(|v| v.get("mutationId").cloned())
                == serde_json::to_value(p.mutation_id).ok()
        }
        (RequestParams::ReceiptGet(p), ResponseResult::ReceiptNotFound { mutation_id, owner }) => {
            p.mutation_id == *mutation_id && p.owner == *owner
        }
        (RequestParams::ReceiptGet(p), ResponseResult::ConfigReceipt(r))
            if p.owner == myagents_host_management_protocol::Owner::Config =>
        {
            serde_json::to_value(r)
                .ok()
                .and_then(|v| v.get("mutationId").cloned())
                == serde_json::to_value(p.mutation_id).ok()
        }
        (RequestParams::ReceiptGet(p), ResponseResult::ResourceReceipt(r))
            if p.owner == myagents_host_management_protocol::Owner::Resources =>
        {
            serde_json::to_value(r)
                .ok()
                .and_then(|v| v.get("mutationId").cloned())
                == serde_json::to_value(p.mutation_id).ok()
        }
        _ => false,
    }
}
fn consume(
    events: Vec<ManagementEvent>,
    request: &ManagementRequest,
    id: CanonicalUuid,
    sent: bool,
) -> Result<(bool, Option<ResponseResult>), NetworkError> {
    let mut ready = false;
    let mut response = None;
    for event in events {
        match event {
            ManagementEvent::Ready if !sent && !ready => ready = true,
            ManagementEvent::Response { request_id, result }
                if sent
                    && request_id == id
                    && response.is_none()
                    && response_matches(request, &result) =>
            {
                response = Some(result)
            }
            _ => return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID")),
        }
    }
    Ok((ready, response))
}

fn queue_request(
    pairs: &mut Pairs,
    target: &str,
    message: ManagementMessage,
    queued: &mut bool,
) -> Result<(), NetworkError> {
    pairs.send_management(target, message)?;
    *queued = true;
    Ok(())
}
async fn handoff_frame<S: futures_util::Sink<Message> + Unpin>(
    socket: &mut S,
    frame: Vec<u8>,
    target: &str,
    queued: bool,
    sent: &AtomicBool,
) -> Result<(), NetworkError> {
    mark_frame_handoff(&frame, target, queued, sent)?;
    socket
        .send(Message::Binary(frame))
        .await
        .map_err(|_| NetworkError::new("NETWORK_CONNECTION_CLOSED"))
}
fn mark_frame_handoff(
    frame: &[u8],
    target: &str,
    request_queued: bool,
    sent: &AtomicBool,
) -> Result<(), NetworkError> {
    let (channel, _) =
        decode_tls_frame(frame).map_err(|_| NetworkError::new("TLS_FRAME_INVALID"))?;
    if request_queued && channel == target {
        sent.store(true, Ordering::Release);
    }
    Ok(())
}
async fn flush_frames(
    socket: &mut NetworkSocket,
    pairs: &mut Pairs,
    target: &str,
    request_queued: bool,
    sent: &AtomicBool,
    frames: &mut usize,
) -> Result<(), NetworkError> {
    while let Some(frame) = pairs.next_frame()? {
        *frames += 1;
        if *frames > 256 {
            return Err(NetworkError::new("HOST_MANAGEMENT_CAPACITY"));
        }
        // Only the request-bearing ciphertext's transport handoff is uncertain.
        // A send failure can be partial, so mark immediately before awaiting it.
        handoff_frame(socket, frame, target, request_queued, sent).await?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn execute(
    socket: &mut NetworkSocket,
    transport: &NetworkTransport,
    identity: &NetworkIdentity,
    local: &DeviceScope,
    scope: &ConnectionScope,
    pairs: &mut Pairs,
    request: &ManagementRequest,
    sent: Arc<AtomicBool>,
) -> Result<ManagementResponse, NetworkError> {
    execute_inner(
        socket, transport, identity, local, scope, pairs, request, sent, None,
    )
    .await
}
#[allow(clippy::too_many_arguments)]
pub(crate) async fn execute_multiplexed(
    socket: &mut NetworkSocket,
    transport: &NetworkTransport,
    identity: &NetworkIdentity,
    local: &DeviceScope,
    scope: &ConnectionScope,
    pairs: &mut Pairs,
    request: &ManagementRequest,
    sent: Arc<AtomicBool>,
    deferred: &mut DeferredMessages,
) -> Result<ManagementResponse, NetworkError> {
    execute_inner(
        socket,
        transport,
        identity,
        local,
        scope,
        pairs,
        request,
        sent,
        Some(deferred),
    )
    .await
}
#[allow(clippy::too_many_arguments)]
async fn execute_inner(
    socket: &mut NetworkSocket,
    transport: &NetworkTransport,
    identity: &NetworkIdentity,
    local: &DeviceScope,
    scope: &ConnectionScope,
    pairs: &mut Pairs,
    request: &ManagementRequest,
    sent: Arc<AtomicBool>,
    mut deferred: Option<&mut DeferredMessages>,
) -> Result<ManagementResponse, NetworkError> {
    if !identity.account.is_management_only()
        || request.connection_id != identity.account.binding_id()
        || request.principal_id != local.principal_id
        || request.network_id != local.network_id
    {
        return Err(NetworkError::new("ACCOUNT_BINDING_CHANGED"));
    }
    let channel = uuid::Uuid::new_v4().to_string();
    let request_id = CanonicalUuid::new(uuid::Uuid::new_v4());
    let message = request.message(request_id)?;
    pairs.reserve_management_retirement(&channel, scope, local)?;
    if let Some(deferred) = deferred.as_mut() {
        deferred.active_channel = Some(ActiveManagementChannel {
            channel: channel.clone(),
            open_attempted: false,
            offered_by_peer: false,
        });
    }
    let mut known_to_peer = false;
    let mut offered_by_peer = false;
    let mut unsupported_close = false;
    let mut peer_closed = false;
    let operation = async {
        identity.account.ensure_current()?;
        let identity = identity.clone().ensure_peer().await?;
        let address = transport
            .device_address(&identity.token, local, &request.device_id)
            .await?;
        matches_target(request, &address.scope)?;
        if deferred.is_some() && pairs.has_peer_channel(&address.scope) {
            return Err(NetworkError::new("HOST_MANAGEMENT_TARGET_BUSY"));
        }
        let mut request_controls = HashSet::new();
        let mut verifier = identity.verifier.clone();
        let peer = verifier.peer(&address.signed_binding).await?;
        if peer.service_id != address.scope.service_id
            || peer.environment != address.scope.environment
            || peer.principal_id != address.scope.principal_id
            || peer.device_id != address.scope.device_id
            || peer.key_generation != address.scope.key_generation
        {
            return Err(NetworkError::new("HOST_ADDRESS_INVALID"));
        }
        identity.account.ensure_current()?;
        let open_control = management_control_id(
            &channel,
            scope,
            true,
            &mut request_controls,
            deferred.as_deref_mut(),
        )?;
        known_to_peer = true;
        if let Some(deferred) = deferred.as_mut() {
            deferred.active_channel = Some(ActiveManagementChannel {
                channel: channel.clone(),
                open_attempted: true,
                offered_by_peer: false,
            });
        }
        send_control(
            socket,
            open_control.clone(),
            ClientMessage::Open {
                scope: scope.clone(),
                channel_id: channel.clone(),
                target_device_id: address.scope.device_id.clone(),
                target_key_generation: address.scope.key_generation,
                target_connection_epoch: address.connection_epoch.clone(),
                target_binding: Some(address.signed_binding.clone()),
            },
        )
        .await?;
        let mut offer = None;
        let mut controls = 0usize;
        let mut frames = 0usize;
        let mut events = Vec::new();
        let mut request_queued = false;
        let mut decoded_allocation = None;
        loop {
            identity.account.ensure_current()?;
            if identity.access.exp <= jsonwebtoken::get_current_timestamp() {
                return Err(NetworkError::new("NETWORK_TOKEN_EXPIRED"));
            }
            let (ready, result) = consume(
                std::mem::take(&mut events),
                request,
                request_id,
                sent.load(Ordering::Acquire),
            )?;
            if let Some(result) = result {
                return Ok(ManagementResponse {
                    scope: address.scope.clone(),
                    result,
                    _allocation: decoded_allocation
                        .take()
                        .ok_or_else(|| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?,
                });
            }
            drop(decoded_allocation.take());
            if ready {
                let current = transport
                    .device_address(&identity.token, local, &request.device_id)
                    .await?;
                if current != address {
                    return Err(NetworkError::new("HOST_MANAGEMENT_TARGET_CHANGED"));
                }
                identity.account.ensure_current()?;
                // Flush remaining handshake output before queueing any request bytes.
                flush_frames(socket, pairs, &channel, false, &sent, &mut frames).await?;
                queue_request(pairs, &channel, message.clone(), &mut request_queued)?;
            }
            for id in pairs.announce_ready() {
                if id == channel {
                    let control = management_control_id(
                        &channel,
                        scope,
                        false,
                        &mut request_controls,
                        deferred.as_deref_mut(),
                    )?;
                    send_control(
                        socket,
                        control,
                        ClientMessage::ChannelReady {
                            scope: scope.clone(),
                            channel_id: id,
                        },
                    )
                    .await?;
                } else {
                    send(
                        socket,
                        ClientMessage::ChannelReady {
                            scope: scope.clone(),
                            channel_id: id,
                        },
                    )
                    .await?;
                }
            }
            flush_frames(socket, pairs, &channel, request_queued, &sent, &mut frames).await?;
            match socket.next().await {
                Some(Ok(Message::Ping(bytes))) => socket
                    .send(Message::Pong(bytes))
                    .await
                    .map_err(|_| NetworkError::new("NETWORK_CONNECTION_CLOSED"))?,
                Some(Ok(Message::Pong(_))) => {}
                Some(Ok(Message::Text(text))) if text == "ma-network-pong" => {}
                Some(Ok(Message::Text(text))) => {
                    controls += 1;
                    if controls > 256 {
                        if let Some(deferred) = deferred.as_mut() {
                            deferred.fatal_overflow = true;
                        }
                        return Err(NetworkError::new("HOST_MANAGEMENT_CAPACITY"));
                    }
                    let envelope = ServerEnvelope::parse(text.as_bytes())
                        .map_err(|_| NetworkError::new("CONTROL_INVALID"))?;
                    if envelope.message.scope().is_some_and(|s| s != scope) {
                        return Err(NetworkError::new("CONTROL_SCOPE_MISMATCH"));
                    }
                    if let Some(deferred) = deferred.as_mut() {
                        if unrelated_control(
                            &envelope.message,
                            &channel,
                            &envelope.control_id,
                            &request_controls,
                        ) {
                            deferred.push(Message::Text(text))?;
                            continue;
                        }
                    }
                    super::owned_profile::control(&envelope.message)?;
                    if pairs.consume_retired_management(
                        &envelope.message,
                        scope,
                        local,
                        &scope.connection_epoch,
                    )? {
                        continue;
                    }
                    match envelope.message {
                        ServerMessage::ChannelOffer {
                            channel_id,
                            initiator,
                            responder,
                            initiator_connection_epoch,
                            responder_connection_epoch,
                            initiator_binding,
                            responder_binding,
                            ..
                        } => {
                            if channel_id != channel {
                                pairs.reserve_management_retirement(&channel_id, scope, local)?;
                                pairs.retire_management(&channel_id, true);
                                send(
                                    socket,
                                    ClientMessage::Close {
                                        scope: scope.clone(),
                                        channel_id,
                                        reason: "TARGET_UNAVAILABLE".into(),
                                    },
                                )
                                .await?;
                                continue;
                            }
                            if offer.is_some() {
                                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
                            }
                            let next = Offer {
                                channel_id: channel.clone(),
                                initiator,
                                responder,
                                initiator_epoch: initiator_connection_epoch,
                                responder_epoch: responder_connection_epoch,
                                initiator_binding,
                                responder_binding,
                            };
                            matches_offer(&next, &address, local, &scope.connection_epoch)?;
                            offered_by_peer = true;
                            if let Some(deferred) = deferred.as_mut() {
                                deferred.active_channel = Some(ActiveManagementChannel {
                                    channel: channel.clone(),
                                    open_attempted: true,
                                    offered_by_peer: true,
                                });
                            }
                            pairs.reserve_management_controller(&channel)?;
                            let signed_binding = identity
                                .peer
                                .as_ref()
                                .ok_or_else(|| NetworkError::new("NETWORK_CERTIFICATE_INVALID"))?
                                .signed_binding
                                .clone();
                            offer = Some(next);
                            let control = management_control_id(
                                &channel,
                                scope,
                                false,
                                &mut request_controls,
                                deferred.as_deref_mut(),
                            )?;
                            send_control(
                                socket,
                                control,
                                ClientMessage::Accept {
                                    scope: scope.clone(),
                                    channel_id: channel.clone(),
                                    signed_binding,
                                },
                            )
                            .await?;
                        }
                        ServerMessage::ChannelAccepted {
                            channel_id,
                            initiator_binding,
                            responder_binding,
                            ..
                        } if channel_id == channel => {
                            let mut next = offer
                                .take()
                                .ok_or_else(|| NetworkError::new("CHANNEL_OFFER_MISSING"))?;
                            next.initiator_binding = Some(initiator_binding);
                            next.responder_binding = Some(responder_binding);
                            matches_offer(&next, &address, local, &scope.connection_epoch)?;
                            pairs.accepted(&channel)?;
                            pairs.install(
                                next.verify(&identity, local, &scope.connection_epoch)
                                    .await?,
                                local,
                                &scope.connection_epoch,
                            )?;
                            let (next, allocation) = pairs.feed_management(&channel, &[])?;
                            events = next;
                            decoded_allocation = Some(allocation);
                        }
                        ServerMessage::ChannelReady { channel_id, .. } if channel_id == channel => {
                            pairs.ready(&channel)?;
                            let (next, allocation) = pairs.feed_management(&channel, &[])?;
                            events = next;
                            decoded_allocation = Some(allocation);
                        }
                        ServerMessage::Credit {
                            channel_id,
                            sequence,
                            received_bytes,
                            ..
                        } if channel_id == channel => {
                            pairs.credit(&channel, sequence, received_bytes)?
                        }
                        ServerMessage::ChannelClosed {
                            channel_id, reason, ..
                        } if channel_id == channel => {
                            peer_closed = true;
                            unsupported_close = request.method
                                == ManagementMethod::HostCapabilities
                                && sent.load(Ordering::Acquire)
                                && reason == "peer-closed";
                            pairs.note_management_closed(&channel);
                            return Err(NetworkError::new("HOST_MANAGEMENT_CHANNEL_CLOSED"));
                        }
                        ServerMessage::Changed { .. } => {
                            return Err(NetworkError::new("HOST_MANAGEMENT_POLICY_CHANGED"))
                        }
                        ServerMessage::Error { code, .. } => {
                            if envelope.control_id == open_control && code == "CHANNEL_PAIR_EXISTS"
                            {
                                mark_open_rejected(
                                    &mut known_to_peer,
                                    &mut offered_by_peer,
                                    deferred.as_deref_mut(),
                                );
                            }
                            return Err(NetworkError::cloud(&code, 400));
                        }
                        _ => return Err(NetworkError::new("CONTROL_UNEXPECTED")),
                    }
                }
                Some(Ok(Message::Binary(bytes))) => {
                    let (id, payload) = decode_tls_frame(&bytes)
                        .map_err(|_| NetworkError::new("TLS_FRAME_INVALID"))?;
                    if id != channel {
                        if let Some(deferred) = deferred.as_mut() {
                            deferred.push(Message::Binary(bytes))?;
                            continue;
                        }
                        return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
                    }
                    let (next, allocation) = pairs.feed_management(&channel, payload)?;
                    events = next;
                    decoded_allocation = Some(allocation);
                    let (sequence, received_bytes) = pairs.release_credit(&channel, bytes.len())?;
                    send(
                        socket,
                        ClientMessage::Credit {
                            scope: scope.clone(),
                            channel_id: channel.clone(),
                            sequence,
                            received_bytes,
                        },
                    )
                    .await?;
                }
                _ => return Err(NetworkError::new("NETWORK_CONNECTION_CLOSED")),
            }
        }
    };
    let result = tokio::time::timeout(Duration::from_secs(30), operation)
        .await
        .unwrap_or_else(|_| Err(NetworkError::new("HOST_MANAGEMENT_TIMEOUT")));
    pairs.retire_management(&channel, known_to_peer);
    if let Some(deferred) = deferred.as_mut() {
        deferred.active_channel = None;
    }
    // Preserve other channels' writer failures for the owning actor. This
    // request retires only its own exact channel and transport uncertainty.
    if deferred.is_none() {
        let _ = pairs.take_failures();
    }
    // A transport attempt does not prove that this random channel exists.
    // Only an exact validated Offer qualifies Close; pre-Open failures and
    // explicit Open rejection leave existing Agent channels untouched.
    let close_id = if offered_by_peer && !peer_closed {
        if let Some(deferred) = deferred.as_mut() {
            deferred.cleanup_control(scope, &channel).ok()
        } else {
            Some(uuid::Uuid::new_v4().to_string())
        }
    } else {
        None
    };
    let cleanup_confirmed = close_confirmed_channel(
        offered_by_peer && close_id.is_some(),
        peer_closed,
        || async {
            send_control(
                socket,
                close_id.ok_or_else(|| NetworkError::new("HOST_MANAGEMENT_CHANNEL_UNCONFIRMED"))?,
                ClientMessage::Close {
                    scope: scope.clone(),
                    channel_id: channel.clone(),
                    reason: "READ_COMPLETED".into(),
                },
            )
            .await
            .map(|_| ())
        },
    )
    .await;
    let unsupported_result = matches!(&result, Ok(ManagementResponse { result: ResponseResult::Error { code }, .. }) if matches!(code.as_str(), "INVALID_REQUEST" | "METHOD_UNSUPPORTED"));
    if request.method == ManagementMethod::HostCapabilities
        && sent.load(Ordering::Acquire)
        && (unsupported_close || unsupported_result)
        && cleanup_confirmed
        && pairs.management_retired_ready(&channel)
        && identity.account.ensure_current().is_ok()
    {
        return Err(NetworkError::new("HOST_MANAGEMENT_EXTENSIONS_UNAVAILABLE"));
    }
    result.map_err(|error| {
        if request.mutation() && sent.load(Ordering::Acquire) {
            lost(true, true)
        } else {
            error
        }
    })
}

fn mark_open_rejected(
    known_to_peer: &mut bool,
    offered_by_peer: &mut bool,
    deferred: Option<&mut DeferredMessages>,
) {
    // This correlated response guarantees that no channel was created. Unlike
    // an uncertain timeout it needs no active tombstone or future Close.
    *known_to_peer = false;
    *offered_by_peer = false;
    if let Some(deferred) = deferred {
        if let Some(active) = deferred.active_channel.as_mut() {
            active.open_attempted = false;
            active.offered_by_peer = false;
        }
    }
}

async fn close_confirmed_channel<F, Fut>(offered_by_peer: bool, peer_closed: bool, close: F) -> bool
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<(), NetworkError>>,
{
    if peer_closed {
        return true;
    }
    if !offered_by_peer {
        return false;
    }
    matches!(
        tokio::time::timeout(Duration::from_secs(1), close()).await,
        Ok(Ok(()))
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_capability_negotiates_then_every_operation_binds_target() {
        let mut r = request();
        r.method = ManagementMethod::RemoteSession;
        r.params =
            RequestParams::RemoteSession(myagents_host_management_protocol::RemoteSessionParams {
                remote_session:
                    myagents_host_management_protocol::RemoteSessionRequest::Capabilities {
                        agent_id: "agent-1".into(),
                    },
            });
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        assert!(r.message(id).is_ok());
        assert!(!r.mutation());
        r.params =
            RequestParams::RemoteSession(myagents_host_management_protocol::RemoteSessionParams {
                remote_session: myagents_host_management_protocol::RemoteSessionRequest::Start {
                    agent_id: "agent-1".into(),
                    operation_id: id,
                    text: "hello".into(),
                },
            });
        assert!(r.mutation());
        assert_eq!(
            r.message(id).unwrap_err().code,
            "HOST_MANAGEMENT_TARGET_REQUIRED"
        );
    }
    #[test]
    fn unknown_write_is_not_account_change() {
        assert_eq!(lost(true, true).code, "HOST_MANAGEMENT_UNCONFIRMED");
        assert_eq!(lost(true, false).code, "HOST_MANAGEMENT_NOT_COMPLETED");
        assert_eq!(lost(false, true).code, "HOST_MANAGEMENT_NOT_COMPLETED");
    }
    fn request() -> ManagementRequest {
        ManagementRequest {
            connection_id: "owned:test".into(),
            auth_generation: 1,
            principal_id: "p".into(),
            network_id: "n".into(),
            device_id: uuid::Uuid::new_v4().to_string(),
            target_scope: None,
            method: ManagementMethod::HostSnapshot,
            params: RequestParams::Snapshot(myagents_host_management_protocol::SnapshotParams {}),
        }
    }
    #[test]
    fn writes_require_the_inspected_target_and_reject_its_replacement() {
        let mut r = request();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        assert!(r.message(id).is_ok()); // First inspection can discover identity.
        r.method = ManagementMethod::ConfigSet;
        r.params = RequestParams::ConfigSet(myagents_host_management_protocol::ConfigSetParams {
            expected_revision: 0,
            provider_id: "moonshot-coding".into(),
            model: "kimi-for-coding".into(),
            workspace: None,
            execution_authorized: false,
            mutation_id: id,
        });
        assert_eq!(
            r.message(id).err().unwrap().code,
            "HOST_MANAGEMENT_TARGET_REQUIRED"
        );
        let current = DeviceScope {
            service_id: "s".into(),
            environment: "e".into(),
            network_id: r.network_id.clone(),
            principal_id: r.principal_id.clone(),
            device_id: r.device_id.clone(),
            key_generation: 1,
        };
        r.target_scope = Some(current.clone());
        assert!(r.message(id).is_ok());
        assert!(matches_target(&r, &current).is_ok());
        let mut replacement = current.clone();
        replacement.key_generation += 1;
        assert_eq!(
            matches_target(&r, &replacement).err().unwrap().code,
            "HOST_MANAGEMENT_TARGET_CHANGED"
        );
        replacement = current;
        replacement.service_id = "other-service".into();
        assert!(matches_target(&r, &replacement).is_err());
    }
    #[test]
    fn ready_is_consumed_without_another_tls_frame() {
        let r = request();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        assert!(
            consume(vec![ManagementEvent::Ready], &r, id, false)
                .unwrap()
                .0
        );
        assert!(consume(vec![ManagementEvent::Ready], &r, id, true).is_err());
    }
    #[test]
    fn response_must_match_request_id_and_sent_boundary() {
        let r = request();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        let event = || ManagementEvent::Response {
            request_id: id,
            result: ResponseResult::Error {
                code: "HOST_UNAVAILABLE".into(),
            },
        };
        assert!(consume(vec![event()], &r, id, false).is_err());
        assert!(consume(
            vec![event()],
            &r,
            CanonicalUuid::new(uuid::Uuid::new_v4()),
            true
        )
        .is_err());
        assert!(consume(vec![event()], &r, id, true).unwrap().1.is_some());
        assert!(consume(vec![event(), event()], &r, id, true).is_err());
    }
    #[test]
    fn receipt_response_checks_owner_and_original_mutation() {
        let mut r = request();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        r.method = ManagementMethod::ReceiptGet;
        r.params = RequestParams::ReceiptGet(myagents_host_management_protocol::ReceiptGetParams {
            mutation_id: id,
            owner: myagents_host_management_protocol::Owner::Config,
        });
        assert!(response_matches(
            &r,
            &ResponseResult::ReceiptNotFound {
                mutation_id: id,
                owner: myagents_host_management_protocol::Owner::Config
            }
        ));
        assert!(!response_matches(
            &r,
            &ResponseResult::ReceiptNotFound {
                mutation_id: id,
                owner: myagents_host_management_protocol::Owner::Resources
            }
        ));
        assert!(!response_matches(
            &r,
            &ResponseResult::ReceiptNotFound {
                mutation_id: CanonicalUuid::new(uuid::Uuid::new_v4()),
                owner: myagents_host_management_protocol::Owner::Config
            }
        ));
    }
    #[test]
    fn credential_write_and_receipt_are_bound_to_original_mutation_and_owner() {
        use myagents_host_management_protocol::{
            ConfigEffect, CredentialReceipt, CredentialSetParams, Owner,
        };
        let mut r = request();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        r.method = ManagementMethod::CredentialSet;
        r.target_scope = Some(DeviceScope {
            service_id: "s".into(),
            environment: "e".into(),
            network_id: r.network_id.clone(),
            principal_id: r.principal_id.clone(),
            device_id: r.device_id.clone(),
            key_generation: 1,
        });
        r.params = RequestParams::CredentialSet(CredentialSetParams {
            expected_revision: 0,
            provider_id: "moonshot-coding".into(),
            credential: "isolated-fixture-only".into(),
            mutation_id: id,
        });
        assert!(r.mutation());
        assert!(r.message(CanonicalUuid::new(uuid::Uuid::new_v4())).is_ok());
        let valid = ResponseResult::CredentialReceipt(CredentialReceipt::Persisted {
            mutation_id: id,
            revision: 1,
            effect: ConfigEffect::NewSession,
        });
        assert!(response_matches(&r, &valid));
        assert!(!response_matches(
            &r,
            &ResponseResult::CredentialReceipt(CredentialReceipt::Conflict {
                mutation_id: CanonicalUuid::new(uuid::Uuid::new_v4()),
                revision: 1,
                effect: ConfigEffect::None
            })
        ));
        assert!(!response_matches(
            &r,
            &ResponseResult::ConfigReceipt(
                myagents_host_management_protocol::ConfigReceipt::NotFound { mutation_id: id }
            )
        ));
        assert!(!response_matches(
            &r,
            &ResponseResult::ReceiptNotFound {
                mutation_id: id,
                owner: Owner::Credentials
            }
        ));
        r.method = ManagementMethod::ReceiptGet;
        r.params = RequestParams::ReceiptGet(myagents_host_management_protocol::ReceiptGetParams {
            mutation_id: id,
            owner: Owner::Credentials,
        });
        assert!(!r.mutation());
        assert!(response_matches(&r, &valid));
        assert!(response_matches(
            &r,
            &ResponseResult::ReceiptNotFound {
                mutation_id: id,
                owner: Owner::Credentials
            }
        ));
        r.params = RequestParams::ReceiptGet(myagents_host_management_protocol::ReceiptGetParams {
            mutation_id: id,
            owner: Owner::Config,
        });
        assert!(!response_matches(&r, &valid));
        r.params = RequestParams::ReceiptGet(myagents_host_management_protocol::ReceiptGetParams {
            mutation_id: CanonicalUuid::new(uuid::Uuid::new_v4()),
            owner: Owner::Credentials,
        });
        assert!(!response_matches(&r, &valid));
    }
    #[test]
    fn actor_recovery_is_exclusive_to_the_retired_capability_probe_signal() {
        let mut r = request();
        r.method = ManagementMethod::HostCapabilities;
        assert!(isolated_unsupported_probe(
            &r,
            &NetworkError::new("HOST_MANAGEMENT_EXTENSIONS_UNAVAILABLE")
        ));
        for code in [
            "ACCOUNT_BINDING_CHANGED",
            "HOST_MANAGEMENT_TIMEOUT",
            "HOST_MANAGEMENT_CHANNEL_CLOSED",
            "CONTROL_SCOPE_MISMATCH",
            "HOST_MANAGEMENT_RESPONSE_INVALID",
        ] {
            assert!(!isolated_unsupported_probe(&r, &NetworkError::new(code)));
        }
        r.method = ManagementMethod::HostSnapshot;
        assert!(!isolated_unsupported_probe(
            &r,
            &NetworkError::new("HOST_MANAGEMENT_EXTENSIONS_UNAVAILABLE")
        ));
        r.method = ManagementMethod::ConfigProviderSet;
        assert!(r.mutation());
        assert!(!isolated_unsupported_probe(
            &r,
            &NetworkError::new("HOST_MANAGEMENT_EXTENSIONS_UNAVAILABLE")
        ));
    }

    #[test]
    fn request_method_and_params_remain_closed() {
        let mut r = request();
        r.method = ManagementMethod::ConfigSet;
        assert!(r.message(CanonicalUuid::new(uuid::Uuid::new_v4())).is_err());
    }
}

#[cfg(test)]
mod offer_tests {
    use super::*;
    #[test]
    fn offer_must_match_actual_address_not_just_same_account() {
        let local = DeviceScope {
            service_id: "test.service".into(),
            environment: "development".into(),
            network_id: "n".into(),
            principal_id: "p".into(),
            device_id: "00000000-0000-0000-0000-000000000001".into(),
            key_generation: 1,
        };
        let target = DeviceScope {
            device_id: "00000000-0000-0000-0000-000000000002".into(),
            ..local.clone()
        };
        let address = DeviceAddress {
            version: 1,
            scope: target.clone(),
            connection_epoch: "target-epoch".into(),
            membership_revision: 1,
            signed_binding: "signed-target".into(),
        };
        let mut offer = Offer {
            channel_id: uuid::Uuid::new_v4().to_string(),
            initiator: local.clone(),
            responder: target,
            initiator_epoch: "local-epoch".into(),
            responder_epoch: address.connection_epoch.clone(),
            initiator_binding: Some("signed-local".into()),
            responder_binding: Some(address.signed_binding.clone()),
        };
        assert!(matches_offer(&offer, &address, &local, "local-epoch").is_ok());
        offer.responder_epoch = "replacement".into();
        assert!(matches_offer(&offer, &address, &local, "local-epoch").is_err());
        offer.responder_epoch = address.connection_epoch.clone();
        offer.responder_binding = Some("other-binding".into());
        assert!(matches_offer(&offer, &address, &local, "local-epoch").is_err());
        offer.responder_binding = Some(address.signed_binding.clone());
        offer.responder.key_generation = 2;
        assert!(matches_offer(&offer, &address, &local, "local-epoch").is_err());
    }
}

#[cfg(test)]
mod handoff_tests {
    use super::super::pairs::tests::{
        exchange_management, installed_management_pair, management_budget,
    };
    use super::*;
    fn message() -> ManagementMessage {
        ManagementMessage::Request {
            request_id: CanonicalUuid::new(uuid::Uuid::new_v4()),
            method: ManagementMethod::ConfigSet,
            params: RequestParams::ConfigSet(myagents_host_management_protocol::ConfigSetParams {
                expected_revision: 0,
                provider_id: "moonshot-coding".into(),
                model: "k3".into(),
                workspace: None,
                execution_authorized: false,
                mutation_id: CanonicalUuid::new(uuid::Uuid::new_v4()),
            }),
        }
    }
    fn budget_failure(post_write: bool) {
        let (mut host, mut controller, _, _, channel) = installed_management_pair();
        exchange_management(&mut host, &mut controller, &channel);
        assert!(host.peer(&channel).is_ok());
        assert!(controller.peer(&channel).is_ok());
        assert!(controller.next_frame().unwrap().is_none());
        let message = message();
        let encoding = (super::super::memory::measure(&message).unwrap().0 + 256) * 3
            + myagents_agent_network_protocol::budget("channelQueueBytes");
        let held_bytes = myagents_agent_network_protocol::budget("connectorBytes")
            - controller.buffered_bytes()
            - if post_write { encoding + 1 } else { 1 };
        let budget = management_budget(&controller);
        let held = budget.reserve(held_bytes).unwrap();
        let sent = AtomicBool::new(false);
        let mut queued = false;
        let error = queue_request(&mut controller, &channel, message, &mut queued).unwrap_err();
        assert_eq!(error.code, "CONNECTOR_CAPACITY");
        assert!(!queued);
        let mut attempts = 0;
        while let Some(frame) = controller.next_frame().unwrap() {
            mark_frame_handoff(&frame, &channel, queued, &sent).unwrap();
            attempts += 1;
        }
        assert_eq!(attempts, 0);
        assert!(!sent.load(Ordering::Acquire));
        assert_eq!(
            lost(true, sent.load(Ordering::Acquire)).code,
            "HOST_MANAGEMENT_NOT_COMPLETED"
        );
        assert!(!controller.has_channel(&channel));
        drop(held);
    }
    #[test]
    fn actual_pairs_preflight_failure_is_not_a_transport_handoff() {
        budget_failure(false);
    }
    #[test]
    fn actual_pairs_post_tls_accounting_failure_is_not_a_transport_handoff() {
        budget_failure(true);
    }

    struct PendingFlush {
        attempts: usize,
    }
    impl futures_util::Sink<Message> for PendingFlush {
        type Error = ();
        fn poll_ready(
            self: std::pin::Pin<&mut Self>,
            _: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), ()>> {
            std::task::Poll::Ready(Ok(()))
        }
        fn start_send(mut self: std::pin::Pin<&mut Self>, _: Message) -> Result<(), ()> {
            self.attempts += 1;
            Ok(())
        }
        fn poll_flush(
            self: std::pin::Pin<&mut Self>,
            _: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), ()>> {
            std::task::Poll::Pending
        }
        fn poll_close(
            self: std::pin::Pin<&mut Self>,
            _: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), ()>> {
            std::task::Poll::Ready(Ok(()))
        }
    }
    #[tokio::test]
    async fn actual_request_frame_partial_transport_attempt_is_unconfirmed() {
        let (mut host, mut controller, _, _, channel) = installed_management_pair();
        exchange_management(&mut host, &mut controller, &channel);
        let mut queued = false;
        queue_request(&mut controller, &channel, message(), &mut queued).unwrap();
        let frame = controller.next_frame().unwrap().unwrap();
        let sent = AtomicBool::new(false);
        mark_frame_handoff(&frame, &channel, false, &sent).unwrap();
        assert!(!sent.load(Ordering::Acquire));
        mark_frame_handoff(&frame, &uuid::Uuid::new_v4().to_string(), true, &sent).unwrap();
        assert!(!sent.load(Ordering::Acquire));
        let mut transport = PendingFlush { attempts: 0 };
        assert!(tokio::time::timeout(
            Duration::from_millis(10),
            handoff_frame(&mut transport, frame, &channel, queued, &sent)
        )
        .await
        .is_err());
        assert_eq!(transport.attempts, 1);
        assert!(sent.load(Ordering::Acquire));
        assert_eq!(
            lost(true, sent.load(Ordering::Acquire)).code,
            "HOST_MANAGEMENT_UNCONFIRMED"
        );
    }
    #[test]
    fn deferred_frames_keep_fifo_byte_leases_and_original_tls_identity_after_management_cancel() {
        use myagents_agent_network_protocol::{
            budget, BusinessObject, ReturnAck, ReturnSettlement,
        };
        let memory = super::super::memory::MemoryBudget::default();
        let mut deferred = DeferredMessages::new(memory.clone());
        let (mut source, mut target, mut ss, mut st) = super::super::channel::tests::ready_pair();
        source
            .send(
                BusinessObject::Ack(ReturnAck {
                    version: 1,
                    sender_sequence: 1,
                    op_id: uuid::Uuid::new_v4().to_string(),
                    return_route_id: uuid::Uuid::new_v4().to_string(),
                    event_id: uuid::Uuid::new_v4().to_string(),
                    settlement: ReturnSettlement::Delivered,
                }),
                &mut ss,
            )
            .unwrap();
        deferred
            .push(Message::Text("original route control".into()))
            .unwrap();
        let mut frames = 0;
        while let Some(frame) = source.drain_frame().unwrap() {
            deferred.push(Message::Binary(frame)).unwrap();
            frames += 1;
        }
        assert!(frames > 0);
        let held = memory
            .reserve(budget("connectorBytes") - deferred.bytes)
            .unwrap();
        assert!(memory.reserve(1).is_err());
        let mut pairs = Pairs::new_owned(super::super::memory::MemoryBudget::default());
        let management_id = uuid::Uuid::new_v4().to_string();
        let local = target.peer().clone();
        let scope = ConnectionScope {
            service_id: local.service_id.clone(),
            network_id: local.network_id.clone(),
            boot_epoch: uuid::Uuid::new_v4().to_string(),
            connection_epoch: uuid::Uuid::new_v4().to_string(),
        };
        pairs
            .reserve_management_retirement(&management_id, &scope, &local)
            .unwrap();
        pairs.reserve_management_controller(&management_id).unwrap();
        deferred.active_channel = Some(ActiveManagementChannel {
            channel: management_id.clone(),
            open_attempted: true,
            offered_by_peer: true,
        });
        assert_eq!(deferred.retire_cancelled(&mut pairs), Some(management_id));
        assert!(deferred.has_pending());
        let (message, lease) = deferred.pop().unwrap();
        assert_eq!(message, Message::Text("original route control".into()));
        assert!(memory.reserve(1).is_err());
        drop(lease);
        let mut delivered = 0;
        while let Some((message, _lease)) = deferred.pop() {
            let Message::Binary(frame) = message else {
                panic!("wrong deferred order")
            };
            let (channel, payload) = decode_tls_frame(&frame).unwrap();
            assert_eq!(channel, target.id);
            delivered += target.feed(payload, &mut st).unwrap().len();
        }
        assert_eq!(delivered, 1);
        assert!(target.ready());
        assert!(!deferred.has_pending());
        drop(held);
        assert!(memory.reserve(budget("connectorBytes")).is_ok());
    }

    #[test]
    fn deferred_queue_is_bounded_and_controls_are_correlated_to_exact_management_request() {
        let mut deferred = DeferredMessages::new(super::super::memory::MemoryBudget::default());
        for _ in 0..256 {
            deferred.push(Message::Text("queued".into())).unwrap();
        }
        assert_eq!(
            deferred
                .push(Message::Text("overflow".into()))
                .unwrap_err()
                .code,
            "HOST_MANAGEMENT_DEFERRED_CAPACITY"
        );
        assert!(deferred.fatal_overflow());
        for _ in 0..256 {
            assert!(deferred.pop().is_some());
        }
        assert!(deferred.pop().is_none());
        let controls = HashSet::from(["management-open".to_owned()]);
        let error = ServerMessage::Error {
            code: "BUSY".into(),
            retryable: false,
        };
        assert!(!unrelated_control(
            &error,
            "channel",
            "management-open",
            &controls
        ));
        assert!(unrelated_control(
            &error,
            "channel",
            "agent-permit",
            &controls
        ));
        let scope = ConnectionScope {
            service_id: "s".into(),
            network_id: "n".into(),
            boot_epoch: "b".into(),
            connection_epoch: "e".into(),
        };
        assert!(unrelated_control(
            &ServerMessage::RouteClosed {
                scope: scope.clone(),
                return_route_id: "route".into(),
                reason: "done".into()
            },
            "channel",
            "control",
            &controls
        ));
        assert!(unrelated_control(
            &ServerMessage::ChannelClosed {
                scope: scope.clone(),
                channel_id: "other-agent-channel".into(),
                reason: "done".into()
            },
            "channel",
            "control",
            &controls
        ));
        assert!(!unrelated_control(
            &ServerMessage::ChannelClosed {
                scope,
                channel_id: "channel".into(),
                reason: "done".into()
            },
            "channel",
            "control",
            &controls
        ));
    }
    #[tokio::test]
    async fn preopen_busy_and_unconfirmed_cleanup_never_send_close_or_interrupt_agent_tls_on_real_socket(
    ) {
        use myagents_agent_network_protocol::{BusinessObject, ReturnAck, ReturnSettlement};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (mut source, mut target, mut ss, mut st) = super::super::channel::tests::ready_pair();
        let local = target.peer().clone();
        let mut pairs = Pairs::new_owned(super::super::memory::MemoryBudget::default());
        pairs.reserve("pending-agent-offer").unwrap();
        assert!(
            pairs.has_peer_channel(&local),
            "pending Agent verification must block management before Open"
        );
        let mut tls_frames = Vec::new();
        for _ in 0..3 {
            source
                .send(
                    BusinessObject::Ack(ReturnAck {
                        version: 1,
                        sender_sequence: 1,
                        op_id: uuid::Uuid::new_v4().to_string(),
                        return_route_id: uuid::Uuid::new_v4().to_string(),
                        event_id: uuid::Uuid::new_v4().to_string(),
                        settlement: ReturnSettlement::Delivered,
                    }),
                    &mut ss,
                )
                .unwrap();
            let mut batch = Vec::new();
            while let Some(frame) = source.drain_frame().unwrap() {
                batch.push(frame);
            }
            tls_frames.push(batch);
        }
        let server = async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            for (index, batch) in tls_frames.into_iter().enumerate() {
                let message = socket.next().await.unwrap().unwrap();
                // Any stray ClientMessage::Close would be a JSON text frame
                // before this marker and would fail this real-socket assertion.
                assert_eq!(message, Message::Text(format!("agent-path-{index}")));
                for frame in batch {
                    socket.send(Message::Binary(frame)).await.unwrap();
                }
            }
        };
        let client = async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let (mut socket, _) =
                tokio_tungstenite::client_async(format!("ws://{address}/relay"), stream)
                    .await
                    .unwrap();
            let scope = ConnectionScope {
                service_id: local.service_id.clone(),
                network_id: local.network_id.clone(),
                boot_epoch: uuid::Uuid::new_v4().to_string(),
                connection_epoch: uuid::Uuid::new_v4().to_string(),
            };
            let mut deferred = DeferredMessages::new(super::super::memory::MemoryBudget::default());
            for index in 0..3 {
                let mut controls = HashSet::new();
                let id = management_control_id(
                    "cancelled-management-channel",
                    &scope,
                    true,
                    &mut controls,
                    Some(&mut deferred),
                )
                .unwrap();
                assert!(deferred
                    .consume_control_error(&id, "CHANNEL_PAIR_EXISTS", &scope, &mut pairs)
                    .unwrap());
                assert!(deferred
                    .consume_control_error(&id, "CHANNEL_PAIR_EXISTS", &scope, &mut pairs)
                    .unwrap());
                // Covers pre-Open busy/address validation, Open handoff without an
                // Offer, and explicit Open rejection: none proves a channel exists.
                let confirmed = close_confirmed_channel(false, false, || async {
                    socket
                        .send(Message::Text("unexpected-channel-close".into()))
                        .await
                        .map_err(|_| NetworkError::new("NETWORK_CONNECTION_CLOSED"))
                })
                .await;
                assert!(!confirmed);
                socket
                    .send(Message::Text(format!("agent-path-{index}")))
                    .await
                    .unwrap();
                let message = tokio::time::timeout(Duration::from_secs(2), socket.next())
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
                let Message::Binary(frame) = message else {
                    panic!("expected existing Agent TLS result")
                };
                let (id, payload) = decode_tls_frame(&frame).unwrap();
                assert_eq!(id, target.id);
                let objects = target.feed(payload, &mut st).unwrap();
                assert_eq!(objects.len(), 1);
                assert!(target.ready());
            }
        };
        tokio::join!(server, client);
    }

    #[tokio::test]
    async fn cleanup_closes_only_a_server_confirmed_offer_and_cancel_keeps_unconfirmed_tombstone() {
        let writes = std::sync::atomic::AtomicUsize::new(0);
        assert!(
            !close_confirmed_channel(false, false, || async {
                writes.fetch_add(1, Ordering::AcqRel);
                Ok(())
            })
            .await
        );
        assert!(
            close_confirmed_channel(false, true, || async {
                writes.fetch_add(1, Ordering::AcqRel);
                Ok(())
            })
            .await
        );
        assert_eq!(writes.load(Ordering::Acquire), 0);
        assert!(
            close_confirmed_channel(true, false, || async {
                writes.fetch_add(1, Ordering::AcqRel);
                Ok(())
            })
            .await
        );
        assert_eq!(writes.load(Ordering::Acquire), 1);
        let memory = super::super::memory::MemoryBudget::default();
        let mut deferred = DeferredMessages::new(memory);
        let (mut host, _controller, local, _peer, id) =
            super::super::pairs::tests::installed_management_pair();
        deferred.active_channel = Some(ActiveManagementChannel {
            channel: id.clone(),
            open_attempted: true,
            offered_by_peer: false,
        });
        assert_eq!(deferred.retire_cancelled(&mut host), None);
        assert!(!host.has_channel(&id));
        let _ = local;
    }
    #[test]
    fn repeated_explicit_open_rejections_release_reservations_and_never_consume_active_budget() {
        let (_host, _controller, local, _peer, _id) =
            super::super::pairs::tests::installed_management_pair();
        let scope = ConnectionScope {
            service_id: local.service_id.clone(),
            network_id: local.network_id.clone(),
            boot_epoch: uuid::Uuid::new_v4().to_string(),
            connection_epoch: uuid::Uuid::new_v4().to_string(),
        };
        let mut pairs = Pairs::new_owned(super::super::memory::MemoryBudget::default());
        let mut deferred = DeferredMessages::new(super::super::memory::MemoryBudget::default());
        for _ in 0..512 {
            let id = uuid::Uuid::new_v4().to_string();
            pairs
                .reserve_management_retirement(&id, &scope, &local)
                .unwrap();
            let mut known = true;
            let mut offered = false;
            deferred.active_channel = Some(ActiveManagementChannel {
                channel: id.clone(),
                open_attempted: true,
                offered_by_peer: false,
            });
            mark_open_rejected(&mut known, &mut offered, Some(&mut deferred));
            assert!(!known && !offered);
            pairs.retire_management(&id, known);
            assert_eq!(deferred.retire_cancelled(&mut pairs), None);
        }
    }
    #[test]
    fn cancelled_control_ids_are_owned_before_write_and_late_errors_are_exact_scoped_and_idempotent(
    ) {
        let (_host, _controller, local, _peer, _id) =
            super::super::pairs::tests::installed_management_pair();
        let scope = ConnectionScope {
            service_id: local.service_id.clone(),
            network_id: local.network_id.clone(),
            boot_epoch: uuid::Uuid::new_v4().to_string(),
            connection_epoch: uuid::Uuid::new_v4().to_string(),
        };
        let mut pairs = Pairs::new_owned(super::super::memory::MemoryBudget::default());
        let mut deferred = DeferredMessages::new(super::super::memory::MemoryBudget::default());
        for open in [true, false] {
            let channel = uuid::Uuid::new_v4().to_string();
            pairs
                .reserve_management_retirement(&channel, &scope, &local)
                .unwrap();
            let mut controls = HashSet::new();
            let id =
                management_control_id(&channel, &scope, open, &mut controls, Some(&mut deferred))
                    .unwrap();
            assert!(controls.contains(&id));
            // There has been no awaited write. Even if the next write is
            // cancelled after partial handoff, the original actor owns this ID.
            assert!(deferred.controls.iter().any(|record| record.id == id));
            deferred.active_channel = Some(ActiveManagementChannel {
                channel: channel.clone(),
                open_attempted: true,
                offered_by_peer: false,
            });
            assert_eq!(deferred.retire_cancelled(&mut pairs), None);
            assert!(deferred
                .consume_control_error(&id, "CHANNEL_PAIR_EXISTS", &scope, &mut pairs)
                .unwrap());
            assert!(deferred
                .consume_control_error(&id, "CHANNEL_PAIR_EXISTS", &scope, &mut pairs)
                .unwrap());
            assert!(!deferred
                .consume_control_error(
                    "another-agent-permit",
                    "CHANNEL_PAIR_EXISTS",
                    &scope,
                    &mut pairs
                )
                .unwrap());
            let mut foreign = scope.clone();
            foreign.connection_epoch = uuid::Uuid::new_v4().to_string();
            assert_eq!(
                deferred
                    .consume_control_error(&id, "CHANNEL_PAIR_EXISTS", &foreign, &mut pairs)
                    .unwrap_err()
                    .code,
                "CONTROL_SCOPE_MISMATCH"
            );
            if !open {
                pairs.retire_management(&channel, false);
            }
        }
        for _ in 0..1100 {
            let mut controls = HashSet::new();
            management_control_id("channel", &scope, false, &mut controls, Some(&mut deferred))
                .unwrap();
        }
        assert_eq!(deferred.controls.len(), 1024);
    }
}
