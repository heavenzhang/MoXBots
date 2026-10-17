//! Portable native controller. Rust owns TLS, scoped authority and uncertain effects.
//! The native OS owner supplies authenticated trust, credentials, encrypted persistence
//! and HTTPS/WSS; JavaScript receives only projected remote-session results.
mod agent_network;
mod ffi;
pub use ffi::*;
// Name adapter required by the shared JOSE verifier; no desktop/cloud dependency.
mod space_cloud {
    pub(crate) mod agent_network {
        pub(crate) enum AccountOperation {
            Jwks,
        }
    }
}

use agent_network::{
    account::NetworkAccountSession,
    channel::{Channel, ManagementEvent, PairSequences},
    crypto,
    jwt::AccountVerifier,
    NetworkError,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use myagents_agent_network_protocol::{decode_tls_frame, DeviceScope};
use myagents_host_management_protocol::{
    CanonicalUuid, ManagementMessage, ManagementMethod, PeerRole, RemoteSessionParams,
    RemoteSessionRequest, RequestParams, ResponseResult,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use zeroize::Zeroizing;

const MAX_JOURNAL: usize = 128;
const MAX_PENDING: usize = 64;
fn error(code: &'static str) -> NetworkError {
    NetworkError::new(code)
}

/// Constructed ONLY by trusted native provisioning; never deserialize JS payloads here.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeConfig {
    issuer: String,
    local: DeviceScope,
    target: DeviceScope,
    channel_id: String,
    local_epoch: String,
    target_epoch: String,
    jwks: Value,
    bootstrap: String,
    local_signed_peer: String,
    target_signed_peer: String,
    certificate: String,
    /// Native must acquire a fresh authenticated snapshot before constructing.
    trust_expires_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JournalRecord {
    operation_id: CanonicalUuid,
    digest: String,
    request: RemoteSessionRequest,
    target: DeviceScope,
    issuer: String,
}
struct JournalEntry {
    record: JournalRecord,
    emitted: bool,
}
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Intent {
    Prepare {
        request: RemoteSessionRequest,
    },
    Commit {
        operation_id: CanonicalUuid,
        digest: String,
    },
    Request {
        request: RemoteSessionRequest,
    },
    Recover {
        records: Vec<JournalRecord>,
    },
    RelayReady {},
    Suspend {},
    Status {},
}

pub struct MobileClient {
    channel: Channel,
    sequences: PairSequences,
    account: NetworkAccountSession,
    target: DeviceScope,
    journal: BTreeMap<String, JournalEntry>,
    pending: BTreeMap<String, RemoteSessionRequest>,
    used: bool,
    network_url: String,
    flow: RelayFlow,
}
// A single-channel projection of the original PairChannels credit policy.
// Keep strict cumulative-byte/sequence checks and the same bounded windows.
#[derive(Default)]
struct RelayFlow {
    sent: u64,
    returned: u64,
    return_sequence: u64,
    received: u64,
    reported: u64,
    release_sequence: u64,
}
impl MobileClient {
    /// Typed native entry point; mutations require durable prepare/commit sequencing.
    pub fn execute(&mut self, intent: Intent) -> Result<Value, String> {
        self.call(intent).map_err(|e| e.code)
    }
    pub fn feed_frame(&mut self, bytes: &[u8]) -> Result<Value, String> {
        if bytes.len() > 256 * 1024 {
            return Err("MOBILE_INPUT_INVALID".into());
        }
        self.feed(bytes).map_err(|e| e.code)
    }
    pub fn drain_frame(&mut self) -> Result<Option<Vec<u8>>, String> {
        self.drain_native().map_err(|e| e.code)
    }
    /// Native authenticated relay control only. A duplicate/out-of-order grant
    /// closes authorization instead of weakening the original credit policy.
    pub fn relay_credit(&mut self, sequence: u64, received_bytes: u64) -> Result<(), String> {
        let result = self.account.ensure_current().and_then(|_| {
            if Some(sequence) != self.flow.return_sequence.checked_add(1)
                || received_bytes <= self.flow.returned
                || received_bytes > self.flow.sent
            {
                return Err(error("CREDIT_INVALID"));
            }
            self.flow.returned = received_bytes;
            self.flow.return_sequence = sequence;
            Ok(())
        });
        if result.is_err() {
            self.account.current.store(false, Ordering::Release);
        }
        result.map_err(|e| e.code)
    }
    /// Native sends the returned cumulative release on the current relay scope.
    pub fn take_received_credit(&mut self) -> Result<Option<(u64, u64)>, String> {
        self.account.ensure_current().map_err(|e| e.code)?;
        if self.flow.reported == self.flow.received {
            return Ok(None);
        }
        self.flow.release_sequence = self
            .flow
            .release_sequence
            .checked_add(1)
            .filter(|n| *n <= myagents_host_management_protocol::MAX_SAFE_SEQUENCE)
            .ok_or_else(|| "CREDIT_OVERFLOW".to_owned())?;
        self.flow.reported = self.flow.received;
        Ok(Some((self.flow.release_sequence, self.flow.received)))
    }
    fn drain_native(&mut self) -> Result<Option<Vec<u8>>, NetworkError> {
        use myagents_agent_network_protocol::budget;
        self.account.ensure_current()?;
        let outstanding = self.flow.sent - self.flow.returned;
        let maximum = (budget("tlsChunkBytes") + 22) as u64;
        if outstanding + maximum
            > budget("socketQueueBytes").min(budget("channelQueueBytes")) as u64
        {
            return Ok(None);
        }
        let frame = self.channel.drain_frame()?;
        if let Some(frame) = &frame {
            self.flow.sent = self
                .flow
                .sent
                .checked_add(frame.len() as u64)
                .filter(|n| *n <= myagents_host_management_protocol::MAX_SAFE_SEQUENCE)
                .ok_or_else(|| error("CREDIT_OVERFLOW"))?;
        }
        Ok(frame)
    }
    pub fn new(config: NativeConfig, pkcs8: Zeroizing<Vec<u8>>) -> Result<Self, String> {
        Self::new_inner(config, pkcs8).map_err(|e| e.code)
    }
    fn new_inner(config: NativeConfig, pkcs8: Zeroizing<Vec<u8>>) -> Result<Self, NetworkError> {
        let issuer = url::Url::parse(&config.issuer).map_err(|_| error("MOBILE_CONFIG_INVALID"))?;
        if issuer.scheme() != "https"
            || issuer.origin().ascii_serialization() != config.issuer
            || config.trust_expires_at > jsonwebtoken::get_current_timestamp() + 300
        {
            return Err(error("MOBILE_CONFIG_INVALID"));
        }
        for id in [
            &config.channel_id,
            &config.local_epoch,
            &config.target_epoch,
        ] {
            CanonicalUuid::parse(id).map_err(|_| error("MOBILE_CONFIG_INVALID"))?;
        }
        let mut account = NetworkAccountSession {
            issuer: config.issuer,
            service_id: config.local.service_id.clone(),
            environment: config.local.environment.clone(),
            principal_id: config.local.principal_id.clone(),
            expires_at: config.trust_expires_at,
            current: Arc::new(AtomicBool::new(true)),
            jwks: config.jwks,
        };
        account.ensure_current()?;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .map_err(|_| error("MOBILE_RUNTIME_UNAVAILABLE"))?;
        let (bootstrap, own, peer) = runtime.block_on(async {
            let mut verifier = AccountVerifier::new(account.clone()).await?;
            Ok::<_, NetworkError>((
                verifier.bootstrap(&config.bootstrap).await?,
                verifier.peer(&config.local_signed_peer).await?,
                verifier.peer(&config.target_signed_peer).await?,
            ))
        })?;
        let key = Arc::new(crypto::DevicePrivateKey::from_native_pkcs8(pkcs8)?);
        if bootstrap.access.device_id != config.local.device_id
            || bootstrap.access.key_generation != config.local.key_generation
            || bootstrap.access.cnf.jkt != key.public_thumbprint()?
            || own.device_id != config.local.device_id
            || own.key_generation != config.local.key_generation
            || peer.device_id != config.target.device_id
            || peer.key_generation != config.target.key_generation
        {
            return Err(error("MOBILE_IDENTITY_MISMATCH"));
        }
        let certificates = crypto::certificate_chain(&config.certificate)?;
        if certificates.len() != 1
            || crypto::certificate_fingerprint(&certificates[0]) != own.certificate_fingerprint
        {
            return Err(error("MOBILE_IDENTITY_MISMATCH"));
        }
        let identity = crypto::TlsIdentity::new(certificates, key)?;
        let roots = crypto::private_roots(&bootstrap.root_certificate)?;
        let channel = Channel::new_management(
            config.channel_id,
            config.local,
            config.target.clone(),
            config.local_epoch,
            config.target_epoch,
            &identity,
            roots,
            &peer,
            PeerRole::Controller,
            true,
        )?;
        account.expires_at = account
            .expires_at
            .min(bootstrap.access.exp)
            .min(own.expires_at)
            .min(peer.expires_at);
        Ok(Self {
            channel,
            sequences: PairSequences::default(),
            account,
            target: config.target,
            journal: BTreeMap::new(),
            pending: BTreeMap::new(),
            used: false,
            network_url: bootstrap.network_url,
            flow: RelayFlow::default(),
        })
    }
    fn digest(
        request: &RemoteSessionRequest,
        target: &DeviceScope,
        issuer: &str,
    ) -> Result<String, NetworkError> {
        let canonical = serde_json::to_vec(&(issuer, target, request))
            .map_err(|_| error("MOBILE_INTENT_INVALID"))?;
        Ok(URL_SAFE_NO_PAD.encode(Sha256::digest(canonical)))
    }
    fn prepare(&mut self, request: RemoteSessionRequest) -> Result<Value, NetworkError> {
        request
            .validate()
            .map_err(|_| error("MOBILE_INTENT_INVALID"))?;
        if !request.mutation() {
            return Err(error("MOBILE_MUTATION_REQUIRED"));
        }
        let operation_id = request
            .operation_id()
            .ok_or_else(|| error("MOBILE_OPERATION_REQUIRED"))?;
        let digest = Self::digest(&request, &self.target, &self.account.issuer)?;
        let id = operation_id.as_uuid().to_string();
        if let Some(prior) = self.journal.get(&id) {
            if prior.record.digest != digest {
                return Err(error("MOBILE_OPERATION_CONFLICT"));
            }
            if prior.emitted {
                return Err(error("MOBILE_RECEIPT_REQUIRED"));
            }
            return Ok(json!({"state":"journal-required", "record":prior.record}));
        }
        if self.journal.len() >= MAX_JOURNAL {
            return Err(error("MOBILE_JOURNAL_LIMIT"));
        }
        let record = JournalRecord {
            operation_id,
            digest,
            request,
            target: self.target.clone(),
            issuer: self.account.issuer.clone(),
        };
        let result = json!({"state":"journal-required", "record":record});
        self.journal.insert(
            id,
            JournalEntry {
                record,
                emitted: false,
            },
        );
        Ok(result)
    }
    fn send(&mut self, request: RemoteSessionRequest) -> Result<Value, NetworkError> {
        request
            .validate()
            .map_err(|_| error("MOBILE_INTENT_INVALID"))?;
        if self.pending.len() >= MAX_PENDING {
            return Err(error("MOBILE_PENDING_LIMIT"));
        }
        let request_id = CanonicalUuid::new(uuid::Uuid::new_v4());
        self.channel.send_management(ManagementMessage::Request {
            request_id,
            method: ManagementMethod::RemoteSession,
            params: RequestParams::RemoteSession(RemoteSessionParams {
                remote_session: request.clone(),
            }),
        })?;
        self.used = true;
        self.pending
            .insert(request_id.as_uuid().to_string(), request);
        Ok(json!({"state":"submitted", "requestId":request_id}))
    }
    fn call(&mut self, intent: Intent) -> Result<Value, NetworkError> {
        if matches!(intent, Intent::Suspend {}) {
            self.account.current.store(false, Ordering::Release);
            self.pending.clear();
            return Ok(json!({"state":"authorization-required"}));
        }
        self.account.ensure_current()?;
        match intent {
            Intent::Prepare { request } => self.prepare(request),
            Intent::Commit {
                operation_id,
                digest,
            } => {
                if !self.channel.ready() {
                    return Err(error("CHANNEL_NOT_READY"));
                }
                let entry = self
                    .journal
                    .get_mut(&operation_id.as_uuid().to_string())
                    .ok_or_else(|| error("MOBILE_JOURNAL_REQUIRED"))?;
                if entry.record.digest != digest {
                    return Err(error("MOBILE_OPERATION_CONFLICT"));
                }
                if entry.emitted {
                    return Err(error("MOBILE_RECEIPT_REQUIRED"));
                }
                // Mark uncertain BEFORE touching transport. A failure must never open a retry.
                entry.emitted = true;
                let request = entry.record.request.clone();
                self.send(request)
            }
            Intent::Request { request } => {
                if request.mutation() {
                    return Err(error("MOBILE_JOURNAL_REQUIRED"));
                }
                self.send(request)
            }
            Intent::Recover { records } => {
                if self.used || !self.journal.is_empty() || records.len() > MAX_JOURNAL {
                    return Err(error("MOBILE_RECOVERY_INVALID"));
                }
                let mut recovered = BTreeMap::new();
                for record in records {
                    record
                        .request
                        .validate()
                        .map_err(|_| error("MOBILE_RECOVERY_INVALID"))?;
                    if !record.request.mutation()
                        || record.request.operation_id() != Some(record.operation_id)
                        || record.target != self.target
                        || record.issuer != self.account.issuer
                        || record.digest
                            != Self::digest(&record.request, &record.target, &record.issuer)?
                        || recovered.contains_key(&record.operation_id.as_uuid().to_string())
                    {
                        return Err(error("MOBILE_RECOVERY_INVALID"));
                    }
                    recovered.insert(
                        record.operation_id.as_uuid().to_string(),
                        JournalEntry {
                            record,
                            emitted: true,
                        },
                    );
                }
                self.journal = recovered;
                Ok(json!({"state":"receipt-required"}))
            }
            Intent::RelayReady {} => {
                self.channel.mark_relay_ready()?;
                Ok(self.status())
            }
            Intent::Status {} => Ok(self.status()),
            Intent::Suspend {} => unreachable!(),
        }
    }
    fn status(&self) -> Value {
        json!({"ready":self.channel.ready(), "cryptoReady":self.channel.crypto_ready(), "networkUrl":self.network_url,
            "unknownOperations":self.journal.iter().filter(|(_,e)| e.emitted).map(|(id,_)|id).collect::<Vec<_>>()})
    }
    fn validate_response(
        request: &RemoteSessionRequest,
        result: &myagents_host_management_protocol::RemoteSessionResult,
    ) -> Result<(), NetworkError> {
        use myagents_host_management_protocol::RemoteSessionResult as ResultData;
        let valid = match (request, result) {
            (_, ResultData::Error { .. }) => true,
            (
                RemoteSessionRequest::Capabilities { agent_id: expected },
                ResultData::Capabilities { agent_id, .. },
            )
            | (
                RemoteSessionRequest::List {
                    agent_id: expected, ..
                },
                ResultData::List { agent_id, .. },
            ) => expected == agent_id,
            (
                RemoteSessionRequest::Get {
                    agent_id: expected,
                    session_id: expected_session,
                    ..
                },
                ResultData::Snapshot {
                    agent_id,
                    session_id,
                    ..
                },
            ) => expected == agent_id && expected_session == session_id,
            (
                request,
                ResultData::Receipt {
                    agent_id,
                    operation_id,
                    session_id,
                    ..
                },
            ) if request.operation_id().is_some() => {
                request.agent_id() == agent_id
                    && request.operation_id() == Some(*operation_id)
                    && request.session_id().is_none_or(|expected| {
                        session_id
                            .as_deref()
                            .is_none_or(|actual| actual == expected)
                    })
            }
            _ => false,
        };
        if valid {
            Ok(())
        } else {
            Err(error("MOBILE_RESPONSE_SCOPE_MISMATCH"))
        }
    }
    fn feed(&mut self, bytes: &[u8]) -> Result<Value, NetworkError> {
        let result = self.feed_inner(bytes);
        if result.is_err() {
            self.account.current.store(false, Ordering::Release);
        }
        result
    }
    fn feed_inner(&mut self, bytes: &[u8]) -> Result<Value, NetworkError> {
        self.account.ensure_current()?;
        let (channel_id, tls) =
            decode_tls_frame(bytes).map_err(|_| error("MOBILE_FRAME_INVALID"))?;
        if channel_id != self.channel.id {
            return Err(error("MOBILE_CHANNEL_MISMATCH"));
        }
        let events = self.channel.feed_management(tls, &mut self.sequences)?;
        let mut out = Vec::new();
        for event in events {
            match event {
                ManagementEvent::Ready => out.push(json!({"kind":"ready"})),
                ManagementEvent::Response { request_id, result } => {
                    let request = self
                        .pending
                        .remove(&request_id.as_uuid().to_string())
                        .ok_or_else(|| error("MOBILE_UNSOLICITED_RESPONSE"))?;
                    match result {
                        ResponseResult::RemoteSession { data } => {
                            data.validate()
                                .map_err(|_| error("MOBILE_RESPONSE_INVALID"))?;
                            Self::validate_response(&request, &data)?;
                            out.push(
                                json!({"kind":"response", "requestId":request_id, "data":data}),
                            );
                        }
                        ResponseResult::Error { code } => {
                            out.push(json!({"kind":"error", "requestId":request_id, "code":code}))
                        }
                        _ => return Err(error("MOBILE_RESPONSE_INVALID")),
                    }
                }
                ManagementEvent::Request { .. } => return Err(error("MOBILE_ROLE_MISMATCH")),
            }
        }
        self.flow.received = self
            .flow
            .received
            .checked_add(bytes.len() as u64)
            .filter(|n| *n <= myagents_host_management_protocol::MAX_SAFE_SEQUENCE)
            .ok_or_else(|| error("CREDIT_OVERFLOW"))?;
        Ok(json!({"events":out, "status":self.status()}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_network::jwt::VerifiedPeer;
    use myagents_agent_network_protocol::PeerBinding;
    use myagents_host_management_protocol::{RemoteReceiptStatus, RemoteSessionResult};
    pub(super) fn scope(n: u8) -> DeviceScope {
        DeviceScope {
            service_id: "00000000-0000-0000-0000-000000000001".into(),
            environment: "development".into(),
            network_id: "00000000-0000-0000-0000-000000000002".into(),
            principal_id: "account".into(),
            device_id: format!("00000000-0000-0000-0000-{n:012}"),
            key_generation: 1,
        }
    }
    fn pair() -> (MobileClient, Channel, PairSequences) {
        let fixture = crypto::tests::Fixture::new();
        let binding = |scope: DeviceScope, identity: &crypto::TlsIdentity, name: &str| {
            VerifiedPeer::fixture(PeerBinding {
                service_id: scope.service_id,
                environment: scope.environment,
                principal_id: scope.principal_id,
                device_id: scope.device_id,
                key_generation: 1,
                identity_binding_id: uuid::Uuid::new_v4().to_string(),
                certificate_fingerprint: crypto::certificate_fingerprint(&identity.certificates[0]),
                san: name.into(),
                certificate: String::new(),
                expires_at: jsonwebtoken::get_current_timestamp() + 3600,
            })
        };
        let id = uuid::Uuid::new_v4().to_string();
        let a_epoch = uuid::Uuid::new_v4().to_string();
        let b_epoch = uuid::Uuid::new_v4().to_string();
        let mut a = Channel::new_management(
            id.clone(),
            scope(3),
            scope(4),
            a_epoch.clone(),
            b_epoch.clone(),
            &fixture.first,
            fixture.roots(),
            &binding(scope(4), &fixture.second, "second.network.invalid"),
            PeerRole::Controller,
            true,
        )
        .unwrap();
        let mut b = Channel::new_management(
            id,
            scope(4),
            scope(3),
            b_epoch,
            a_epoch,
            &fixture.second,
            fixture.roots(),
            &binding(scope(3), &fixture.first, "first.network.invalid"),
            PeerRole::Host,
            false,
        )
        .unwrap();
        let mut sa = PairSequences::default();
        let mut sb = PairSequences::default();
        for _ in 0..30 {
            while let Some(frame) = a.drain_frame().unwrap() {
                b.feed_management(decode_tls_frame(&frame).unwrap().1, &mut sb)
                    .unwrap();
            }
            while let Some(frame) = b.drain_frame().unwrap() {
                a.feed_management(decode_tls_frame(&frame).unwrap().1, &mut sa)
                    .unwrap();
            }
            if a.crypto_ready() {
                a.mark_relay_ready().unwrap();
            }
            if b.crypto_ready() {
                b.mark_relay_ready().unwrap();
            }
            if a.ready() && b.ready() {
                break;
            }
        }
        assert!(a.ready() && b.ready());
        let account = NetworkAccountSession {
            issuer: "https://native-trust.invalid".into(),
            service_id: scope(3).service_id,
            environment: "development".into(),
            principal_id: "account".into(),
            expires_at: jsonwebtoken::get_current_timestamp() + 300,
            current: Arc::new(AtomicBool::new(true)),
            jwks: json!({"keys":[]}),
        };
        (
            MobileClient {
                channel: a,
                sequences: sa,
                account,
                target: scope(4),
                journal: BTreeMap::new(),
                pending: BTreeMap::new(),
                used: false,
                network_url: "https://relay.invalid".into(),
                flow: RelayFlow::default(),
            },
            b,
            sb,
        )
    }
    fn start(operation_id: CanonicalUuid) -> RemoteSessionRequest {
        RemoteSessionRequest::Start {
            agent_id: "agent".into(),
            operation_id,
            text: "hello from native Rust".into(),
        }
    }
    #[test]
    fn encrypted_controller_interoperates_with_existing_host_channel_and_unknown_receipt() {
        let (mut client, mut host, mut host_sequences) = pair();
        let operation_id = CanonicalUuid::new(uuid::Uuid::new_v4());
        assert!(client
            .call(Intent::Request {
                request: start(operation_id)
            })
            .is_err());
        let prepared = client
            .call(Intent::Prepare {
                request: start(operation_id),
            })
            .unwrap();
        assert!(client.channel.drain_frame().unwrap().is_none());
        let record: JournalRecord = serde_json::from_value(prepared["record"].clone()).unwrap();
        let sent = client
            .call(Intent::Commit {
                operation_id,
                digest: record.digest.clone(),
            })
            .unwrap();
        let mut observed = None;
        while let Some(frame) = client.channel.drain_frame().unwrap() {
            assert!(!frame.windows(5).any(|w| w == b"hello"));
            for event in host
                .feed_management(decode_tls_frame(&frame).unwrap().1, &mut host_sequences)
                .unwrap()
            {
                if let ManagementEvent::Request {
                    request_id,
                    method,
                    params,
                } = event
                {
                    assert_eq!(method, ManagementMethod::RemoteSession);
                    assert_eq!(
                        params,
                        RequestParams::RemoteSession(RemoteSessionParams {
                            remote_session: start(operation_id)
                        })
                    );
                    observed = Some(request_id);
                }
            }
        }
        assert_eq!(
            sent["requestId"],
            serde_json::to_value(observed.unwrap()).unwrap()
        );
        assert_eq!(
            client
                .call(Intent::Commit {
                    operation_id,
                    digest: record.digest.clone()
                })
                .unwrap_err()
                .code,
            "MOBILE_RECEIPT_REQUIRED"
        );
        // Authenticated NOT_FOUND is uncertainty; it must not permit effect replay.
        host.send_management(ManagementMessage::Response {
            request_id: observed.unwrap(),
            result: ResponseResult::RemoteSession {
                data: RemoteSessionResult::Receipt {
                    agent_id: "agent".into(),
                    operation_id,
                    session_id: None,
                    status: RemoteReceiptStatus::NotFound,
                    code: None,
                },
            },
        })
        .unwrap();
        let mut received = false;
        while let Some(frame) = host.drain_frame().unwrap() {
            let event = client.feed(&frame).unwrap();
            if !event["events"].as_array().unwrap().is_empty() {
                assert_eq!(event["events"][0]["data"]["status"], "not-found");
                received = true;
            }
        }
        assert!(received);
        let credit = client.take_received_credit().unwrap().unwrap();
        assert_eq!(credit.0, 1);
        assert!(credit.1 > 22);
        assert!(client.take_received_credit().unwrap().is_none());
        assert_eq!(
            client
                .call(Intent::Commit {
                    operation_id,
                    digest: record.digest
                })
                .unwrap_err()
                .code,
            "MOBILE_RECEIPT_REQUIRED"
        );
    }
    #[test]
    fn relay_credit_rejects_duplicates_and_releases_bounded_native_writer() {
        let (mut client, _, _) = pair();
        client
            .call(Intent::Request {
                request: RemoteSessionRequest::List {
                    agent_id: "agent".into(),
                    limit: 1,
                    before: None,
                },
            })
            .unwrap();
        let window = myagents_agent_network_protocol::budget("channelQueueBytes")
            .min(myagents_agent_network_protocol::budget("socketQueueBytes"))
            as u64;
        client.flow.sent = window;
        assert!(client.drain_frame().unwrap().is_none());
        client.relay_credit(1, window).unwrap();
        assert!(client.drain_frame().unwrap().is_some());
        assert_eq!(
            client.relay_credit(1, window).unwrap_err(),
            "CREDIT_INVALID"
        );
        assert!(client.execute(Intent::Status {}).is_err());
        let (mut oversized, _, _) = pair();
        assert_eq!(oversized.relay_credit(1, 1).unwrap_err(), "CREDIT_INVALID");
    }
    #[test]
    fn native_received_credit_is_cumulative_and_reported_once() {
        let (mut client, _, _) = pair();
        assert!(client.take_received_credit().unwrap().is_none());
        client.flow.received = 42;
        assert_eq!(client.take_received_credit().unwrap(), Some((1, 42)));
        assert!(client.take_received_credit().unwrap().is_none());
        client.flow.received = 84;
        assert_eq!(client.take_received_credit().unwrap(), Some((2, 84)));
    }
    #[test]
    fn recovered_unknown_cannot_resend_and_rejects_cross_target_journal() {
        let (mut client, _, _) = pair();
        let operation_id = CanonicalUuid::new(uuid::Uuid::new_v4());
        let prepared = client
            .call(Intent::Prepare {
                request: start(operation_id),
            })
            .unwrap();
        let record: JournalRecord = serde_json::from_value(prepared["record"].clone()).unwrap();
        let (mut restored, _, _) = pair();
        restored
            .call(Intent::Recover {
                records: vec![record.clone()],
            })
            .unwrap();
        assert_eq!(
            restored
                .call(Intent::Commit {
                    operation_id,
                    digest: record.digest.clone()
                })
                .unwrap_err()
                .code,
            "MOBILE_RECEIPT_REQUIRED"
        );
        let (mut other, _, _) = pair();
        other.target.principal_id = "another-account".into();
        assert!(other
            .call(Intent::Recover {
                records: vec![record]
            })
            .is_err());
        assert!(other.journal.is_empty());
    }
    #[test]
    fn operation_digest_conflict_and_suspend_are_fail_closed() {
        let (mut client, _, _) = pair();
        let operation_id = CanonicalUuid::new(uuid::Uuid::new_v4());
        client
            .call(Intent::Prepare {
                request: start(operation_id),
            })
            .unwrap();
        let mut changed = start(operation_id);
        if let RemoteSessionRequest::Start { text, .. } = &mut changed {
            *text = "different effect".into();
        }
        assert_eq!(
            client
                .call(Intent::Prepare { request: changed })
                .unwrap_err()
                .code,
            "MOBILE_OPERATION_CONFLICT"
        );
        client.call(Intent::Suspend {}).unwrap();
        assert_eq!(
            client.call(Intent::Status {}).unwrap_err().code,
            "MOBILE_AUTHORIZATION_REQUIRED"
        );
        assert!(client.drain_frame().is_err());
    }
    #[test]
    fn closed_abi_rejects_secret_intents_invalid_buffers_and_target_frames() {
        for bad in [
            r#"{"kind":"request","request":{"kind":"list","agentId":"a","limit":1,"token":"secret"}}"#,
            r#"{"kind":"raw-http","url":"https://other.invalid"}"#,
            r#"{"kind":"status","secret":"x"}"#,
        ] {
            assert!(serde_json::from_str::<Intent>(bad).is_err());
        }
        unsafe {
            let result = mox_mobile_call(std::ptr::null_mut(), std::ptr::null(), 0);
            assert_eq!(result.status, 1);
            mox_mobile_buffer_free(result);
        }
        let (mut client, _, _) = pair();
        let bad = myagents_agent_network_protocol::encode_tls_frame(
            &uuid::Uuid::new_v4().to_string(),
            b"bogus",
        )
        .unwrap();
        assert_eq!(
            client.feed(&bad).unwrap_err().code,
            "MOBILE_CHANNEL_MISMATCH"
        );
    }
}

#[cfg(test)]
mod provisioning_tests {
    use super::*;
    use jsonwebtoken::{Algorithm, EncodingKey, Header};
    fn provisioned() -> (Value, Zeroizing<Vec<u8>>) {
        let service = "00000000-0000-0000-0000-000000000001";
        let now = jsonwebtoken::get_current_timestamp();
        let authority = rcgen::KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256).unwrap();
        let authority_key = EncodingKey::from_ec_der(&authority.serialize_der());
        let authority_private =
            crypto::DevicePrivateKey::from_native_pkcs8(Zeroizing::new(authority.serialize_der()))
                .unwrap();
        let mut jwk = authority_private.public_jwk().unwrap();
        jwk["alg"] = json!("ES256");
        jwk["use"] = json!("sig");
        jwk["kid"] = json!("native-test");
        let sign = |typ: &str, claims: Value| {
            let mut header = Header::new(Algorithm::ES256);
            header.typ = Some(typ.into());
            header.kid = Some("native-test".into());
            jsonwebtoken::encode(&header, &claims, &authority_key).unwrap()
        };
        let ca_key = rcgen::KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256).unwrap();
        let mut ca_params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
        ca_params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
        ca_params.key_usages = vec![rcgen::KeyUsagePurpose::KeyCertSign];
        let ca = ca_params.self_signed(&ca_key).unwrap();
        let ca_issuer = rcgen::Issuer::new(ca_params, ca_key);
        let make_peer = |n: u8| {
            let key = rcgen::KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256).unwrap();
            let binding_id = uuid::Uuid::new_v4().to_string();
            let san = format!("{binding_id}.devices.{service}.invalid");
            let mut params = rcgen::CertificateParams::new(vec![san.clone()]).unwrap();
            params.key_usages = vec![rcgen::KeyUsagePurpose::DigitalSignature];
            params.extended_key_usages = vec![
                rcgen::ExtendedKeyUsagePurpose::ClientAuth,
                rcgen::ExtendedKeyUsagePurpose::ServerAuth,
            ];
            let cert = params.signed_by(&key, &ca_issuer).unwrap();
            let binding = json!({"serviceId":service,"environment":"development","principalId":"account","deviceId":format!("00000000-0000-0000-0000-{n:012}"),"keyGeneration":1,"identityBindingId":binding_id,"certificateFingerprint":crypto::certificate_fingerprint(cert.der()),"san":san,"certificate":cert.pem(),"expiresAt":now+300});
            let jwt = sign(
                "ma-network-peer+jwt",
                json!({"iss":"https://issuer.invalid","aud":"myagents-agent-peer","sub":"account","iat":now,"nbf":now,"exp":now+300,"jti":uuid::Uuid::new_v4().to_string(),"binding":binding}),
            );
            (jwt, cert.pem(), Zeroizing::new(key.serialize_der()))
        };
        let (local, certificate, key) = make_peer(3);
        let (target, _, _) = make_peer(4);
        let local_key =
            crypto::DevicePrivateKey::from_native_pkcs8(Zeroizing::new(key.to_vec())).unwrap();
        let bootstrap = sign(
            "ma-network-bootstrap+jwt",
            json!({"iss":"https://issuer.invalid","aud":service,"sub":"account","iat":now,"nbf":now,"exp":now+300,"jti":uuid::Uuid::new_v4().to_string(),"environment":"development","deviceId":"00000000-0000-0000-0000-000000000003","keyGeneration":1,"sessionHandle":uuid::Uuid::new_v4().to_string(),"cnf":{"jkt":local_key.public_thumbprint().unwrap()},"networkUrl":"https://relay.invalid","rootCertificate":ca.pem()}),
        );
        (
            json!({"issuer":"https://issuer.invalid","local":serde_json::to_value(super::tests::scope(3)).unwrap(),"target":serde_json::to_value(super::tests::scope(4)).unwrap(),"channelId":uuid::Uuid::new_v4().to_string(),"localEpoch":uuid::Uuid::new_v4().to_string(),"targetEpoch":uuid::Uuid::new_v4().to_string(),"jwks":{"keys":[jwk]},"bootstrap":bootstrap,"localSignedPeer":local,"targetSignedPeer":target,"certificate":certificate,"trustExpiresAt":now+299}),
            key,
        )
    }
    #[test]
    fn native_provisioning_verifies_signed_bootstrap_local_key_and_target_account() {
        let (config, key) = provisioned();
        let client = MobileClient::new(
            serde_json::from_value(config.clone()).unwrap(),
            Zeroizing::new(key.to_vec()),
        )
        .unwrap();
        assert!(!client.channel.ready());
        for path in ["principalId", "serviceId", "deviceId", "keyGeneration"] {
            let mut wrong = config.clone();
            wrong["local"][path] = if path == "keyGeneration" {
                json!(2)
            } else if path == "principalId" {
                json!("another-account")
            } else {
                json!(uuid::Uuid::new_v4().to_string())
            };
            assert!(
                MobileClient::new(
                    serde_json::from_value(wrong).unwrap(),
                    Zeroizing::new(key.to_vec())
                )
                .is_err(),
                "accepted {path}"
            );
        }
        let mut wrong = config.clone();
        wrong["target"]["principalId"] = json!("another-account");
        assert!(MobileClient::new(
            serde_json::from_value(wrong).unwrap(),
            Zeroizing::new(key.to_vec())
        )
        .is_err());
        let mut wrong = config;
        wrong["issuer"] = json!("https://other.invalid");
        assert!(MobileClient::new(serde_json::from_value(wrong).unwrap(), key).is_err());
    }
}
