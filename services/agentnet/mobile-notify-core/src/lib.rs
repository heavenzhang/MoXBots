//! Bounded registration and event-ID-only notification hints for mobile clients.
//!
//! This crate is a storage/contract owner. It does not establish authority:
//! service adapters must freshly validate AuthStore, DeviceStore, and Host
//! connection ownership before constructing the scope values accepted here.

use rusqlite::{Connection, OpenFlags, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fmt,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroizing;

const DATABASE_NAME: &str = "mobile-notify.sqlite3";
const MAX_TOKEN_BYTES: usize = 4096;
const MAX_ENDPOINTS_ACCOUNT: i64 = 10;
const MAX_ENDPOINTS_DEVICE: i64 = 3;
const MAX_ACTIVE_EVENTS_ACCOUNT: i64 = 128;
const MAX_OUTSTANDING_DELIVERIES_ACCOUNT: i64 = 2048;
const MAX_CLAIMS_PER_CALL: usize = 20;
const MAX_ATTEMPTS: i64 = 5;
const MAX_LEASE_SECONDS: i64 = 300;
const MAX_EVENT_TTL_SECONDS: i64 = 86_400;
const DEDUPE_RETENTION_SECONDS: i64 = 7 * 86_400;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum NotifyError {
    #[error("notification storage unavailable")]
    Storage,
    #[error("notification storage path is unsafe")]
    UnsafePath,
    #[error("notification input is invalid")]
    InvalidInput,
    #[error("notification authority is stale or mismatched")]
    Unauthorized,
    #[error("notification capacity exceeded")]
    Capacity,
    #[error("notification event conflicts with an existing source event")]
    Conflict,
    #[error("notification event is unavailable")]
    NotFound,
    #[error("notification claim is no longer current")]
    ClaimExpired,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
    ApnsSandbox,
    ApnsProduction,
    Fcm,
}

impl Provider {
    fn as_str(self) -> &'static str {
        match self {
            Self::ApnsSandbox => "apns-sandbox",
            Self::ApnsProduction => "apns-production",
            Self::Fcm => "fcm",
        }
    }

    fn parse(value: &str) -> Result<Self, NotifyError> {
        match value {
            "apns-sandbox" => Ok(Self::ApnsSandbox),
            "apns-production" => Ok(Self::ApnsProduction),
            "fcm" => Ok(Self::Fcm),
            _ => Err(NotifyError::Storage),
        }
    }
}

impl fmt::Debug for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Secret provider token. It is deliberately neither serializable nor
/// debuggable. Callers must not log the value returned by `as_str`.
pub struct ProviderToken(Zeroizing<String>);

impl ProviderToken {
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl fmt::Debug for ProviderToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ProviderToken([redacted])")
    }
}

impl<'de> Deserialize<'de> for ProviderToken {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(Self(Zeroizing::new(value)))
    }
}

/// Strict request body for the future authenticated registration route.
/// `scope` is intentionally absent; it is derived from validated service state.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegisterEndpointV1 {
    pub version: u8,
    pub provider: Provider,
    token: ProviderToken,
}

impl fmt::Debug for RegisterEndpointV1 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RegisterEndpointV1")
            .field("version", &self.version)
            .field("provider", &self.provider)
            .field("token", &"[redacted]")
            .finish()
    }
}

impl RegisterEndpointV1 {
    pub fn new(provider: Provider, token: impl Into<String>) -> Result<Self, NotifyError> {
        let value = Self {
            version: 1,
            provider,
            token: ProviderToken(Zeroizing::new(token.into())),
        };
        value.validate()?;
        Ok(value)
    }

    fn validate(&self) -> Result<(), NotifyError> {
        let token = self.token.as_str();
        if self.version != 1
            || token.is_empty()
            || token.len() > MAX_TOKEN_BYTES
            || token.chars().any(char::is_control)
        {
            return Err(NotifyError::InvalidInput);
        }
        Ok(())
    }
}

/// Account and device scope passed only by a service adapter after live
/// AuthStore/DeviceStore verification. This type is not deserializable, but it
/// is not an unforgeable capability; constructors remain caller responsibility.
#[derive(Clone, PartialEq, Eq)]
pub struct Authority {
    principal_id: String,
    network_id: String,
    device_id: String,
    identity_binding_id: String,
    key_generation: u64,
}

impl fmt::Debug for Authority {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Authority")
            .field("principal_id", &self.principal_id)
            .field("network_id", &self.network_id)
            .field("device_id", &self.device_id)
            .field("identity_binding_id", &self.identity_binding_id)
            .field("key_generation", &self.key_generation)
            .finish()
    }
}

impl Authority {
    /// Build from the current authenticated principal/session and exact device
    /// record. This crate checks shape only; it cannot verify those inputs.
    pub fn from_validated_service_state(
        principal_id: impl Into<String>,
        network_id: impl Into<String>,
        device_id: impl Into<String>,
        identity_binding_id: impl Into<String>,
        key_generation: u64,
    ) -> Result<Self, NotifyError> {
        let value = Self {
            principal_id: principal_id.into(),
            network_id: network_id.into(),
            device_id: device_id.into(),
            identity_binding_id: identity_binding_id.into(),
            key_generation,
        };
        value.validate()?;
        Ok(value)
    }

    fn validate(&self) -> Result<(), NotifyError> {
        if !canonical_uuid(&self.principal_id)
            || !canonical_uuid(&self.network_id)
            || !canonical_uuid(&self.device_id)
            || !canonical_uuid(&self.identity_binding_id)
            || self.key_generation == 0
            || self.key_generation > i64::MAX as u64
        {
            return Err(NotifyError::InvalidInput);
        }
        Ok(())
    }
}

/// Non-secret endpoint scope returned to internal service code so it can
/// revalidate the exact mobile device before sending or redeeming a hint.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EndpointCandidate {
    endpoint_id: String,
    authority: Authority,
    provider: Provider,
}

impl EndpointCandidate {
    pub fn endpoint_id(&self) -> &str {
        &self.endpoint_id
    }

    pub fn authority(&self) -> &Authority {
        &self.authority
    }

    pub fn provider(&self) -> Provider {
        self.provider
    }
}

/// Freshly revalidated endpoint context supplied by trusted service code.
/// The crate does not establish freshness; callers must revalidate immediately
/// before each claim/send/redeem operation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FreshEndpoint {
    endpoint_id: String,
    authority: Authority,
}

impl FreshEndpoint {
    pub fn from_validated_service_state(
        endpoint_id: impl Into<String>,
        authority: Authority,
    ) -> Result<Self, NotifyError> {
        let endpoint_id = endpoint_id.into();
        if !canonical_uuid(&endpoint_id) {
            return Err(NotifyError::InvalidInput);
        }
        authority.validate()?;
        Ok(Self {
            endpoint_id,
            authority,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EndpointId(String);

impl EndpointId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Strict Host-origin hint v1. The target device comes from the authenticated
/// Host authority, not from this request. The source event ID is only a scoped
/// deduplication key and carries no permission.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostHintV1 {
    pub version: u8,
    pub kind: HintKind,
    #[serde(rename = "sourceEventId")]
    pub source_event_id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

impl fmt::Debug for HostHintV1 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("HostHintV1")
            .field("version", &self.version)
            .field("kind", &self.kind)
            .field("source_event_id", &self.source_event_id)
            .field("session_id", &"[private]")
            .finish()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HintKind {
    AttentionRequired,
}

impl HostHintV1 {
    pub fn new(
        source_event_id: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Result<Self, NotifyError> {
        let value = Self {
            version: 1,
            kind: HintKind::AttentionRequired,
            source_event_id: source_event_id.into(),
            session_id: session_id.into(),
        };
        value.validate()?;
        Ok(value)
    }

    fn validate(&self) -> Result<(), NotifyError> {
        if self.version != 1
            || self.kind != HintKind::AttentionRequired
            || !canonical_uuid(&self.source_event_id)
            || !valid_session_id(&self.session_id)
        {
            return Err(NotifyError::InvalidInput);
        }
        Ok(())
    }
}

/// Provider data payload. It intentionally has exactly one field and no
/// session, target, title, body, answer, or approval details.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushEnvelope {
    event_id: String,
}

impl PushEnvelope {
    pub fn event_id(&self) -> &str {
        &self.event_id
    }
}

/// Private reference returned only by an authenticated, freshly-authorized
/// redemption. The caller must refresh the current targets and Session snapshot
/// before presenting any actionable UI.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionPointer {
    pub target_id: String,
    pub session_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeliveryOutcome {
    Accepted,
    Unknown,
    RetryableFailure,
    PermanentFailure,
}

/// A short-lived provider delivery claim. Its token is accessible only for the
/// provider adapter and is redacted from Debug output.
pub struct DeliveryClaim {
    event_id: String,
    endpoint_id: String,
    lease_id: String,
    provider: Provider,
    token: ProviderToken,
    lease_until: i64,
}

impl DeliveryClaim {
    pub fn envelope(&self) -> PushEnvelope {
        PushEnvelope {
            event_id: self.event_id.clone(),
        }
    }

    pub fn provider(&self) -> Provider {
        self.provider
    }

    pub fn token(&self) -> &str {
        self.token.as_str()
    }

    pub fn lease_until(&self) -> i64 {
        self.lease_until
    }
}

impl fmt::Debug for DeliveryClaim {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DeliveryClaim")
            .field("event_id", &self.event_id)
            .field("endpoint_id", &self.endpoint_id)
            .field("lease_id", &self.lease_id)
            .field("provider", &self.provider)
            .field("token", &"[redacted]")
            .field("lease_until", &self.lease_until)
            .finish()
    }
}

pub struct Store {
    connection: Mutex<Connection>,
    state_dir: PathBuf,
}

impl Store {
    pub fn open(state_dir: impl AsRef<Path>) -> Result<Self, NotifyError> {
        let state_dir = validate_state_dir(state_dir.as_ref())?;
        let database = state_dir.join(DATABASE_NAME);
        create_private_database_file(&database)?;
        let connection = Connection::open_with_flags(
            &database,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NOFOLLOW
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )
        .map_err(|_| NotifyError::Storage)?;
        validate_database_file(&database)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|_| NotifyError::Storage)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(|_| NotifyError::Storage)?;
        connection
            .pragma_update(None, "synchronous", "FULL")
            .map_err(|_| NotifyError::Storage)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys=ON;
                 CREATE TABLE IF NOT EXISTS endpoints (
                   endpoint_id TEXT PRIMARY KEY,
                   principal_id TEXT NOT NULL,
                   network_id TEXT NOT NULL,
                   device_id TEXT NOT NULL,
                   identity_binding_id TEXT NOT NULL,
                   key_generation INTEGER NOT NULL CHECK(key_generation > 0),
                   provider TEXT NOT NULL CHECK(provider IN ('apns-sandbox','apns-production','fcm')),
                   token_hash BLOB NOT NULL,
                   token TEXT NOT NULL,
                   created_at INTEGER NOT NULL,
                   revoked_at INTEGER,
                   UNIQUE(provider, token_hash)
                 );
                 CREATE INDEX IF NOT EXISTS endpoints_account_active
                   ON endpoints(principal_id, network_id, revoked_at);
                 CREATE INDEX IF NOT EXISTS endpoints_device_active
                   ON endpoints(principal_id, network_id, device_id, revoked_at);
                 CREATE TABLE IF NOT EXISTS hint_events (
                   event_id TEXT PRIMARY KEY,
                   principal_id TEXT NOT NULL,
                   network_id TEXT NOT NULL,
                   source_device_id TEXT NOT NULL,
                   source_binding_id TEXT NOT NULL,
                   source_generation INTEGER NOT NULL CHECK(source_generation > 0),
                   source_event_id TEXT NOT NULL,
                   content_digest BLOB NOT NULL,
                   target_id TEXT NOT NULL,
                   session_id TEXT NOT NULL,
                   kind TEXT NOT NULL CHECK(kind='attention-required'),
                   created_at INTEGER NOT NULL,
                   expires_at INTEGER NOT NULL,
                   state TEXT NOT NULL CHECK(state IN ('active','expired','revoked')),
                   UNIQUE(principal_id, network_id, source_device_id, source_binding_id, source_generation, source_event_id)
                 );
                 CREATE INDEX IF NOT EXISTS hint_events_account_active
                   ON hint_events(principal_id, network_id, state, expires_at);
                 CREATE TABLE IF NOT EXISTS deliveries (
                   event_id TEXT NOT NULL REFERENCES hint_events(event_id) ON DELETE CASCADE,
                   endpoint_id TEXT NOT NULL REFERENCES endpoints(endpoint_id) ON DELETE CASCADE,
                   state TEXT NOT NULL CHECK(state IN ('pending','leased','sent','unknown','failed','expired','revoked')),
                   attempts INTEGER NOT NULL CHECK(attempts >= 0),
                   next_attempt_at INTEGER NOT NULL,
                   lease_id TEXT,
                   lease_until INTEGER,
                   PRIMARY KEY(event_id, endpoint_id)
                 );
                 CREATE INDEX IF NOT EXISTS deliveries_due
                   ON deliveries(endpoint_id, state, next_attempt_at, lease_until);
                 PRAGMA user_version=1;",
            )
            .map_err(|_| NotifyError::Storage)?;
        Ok(Self {
            connection: Mutex::new(connection),
            state_dir,
        })
    }

    pub fn state_dir(&self) -> &Path {
        &self.state_dir
    }

    /// Idempotently register a provider token for the current device binding.
    /// A globally duplicate provider token is moved atomically to the current
    /// authenticated owner, revoking any old pending deliveries first.
    pub fn register_endpoint(
        &self,
        authority: &Authority,
        request: RegisterEndpointV1,
        now: i64,
    ) -> Result<EndpointId, NotifyError> {
        authority.validate()?;
        request.validate()?;
        validate_time(now)?;
        let token = request.token.as_str();
        let token_hash = token_digest(request.provider, token);
        let mut connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| NotifyError::Storage)?;
        prune(&tx, now)?;
        retire_stale_endpoints(&tx, authority, now)?;

        let existing: Option<(String, String, String, String, i64, Option<i64>)> = tx
            .query_row(
                "SELECT endpoint_id,principal_id,network_id,device_id, key_generation,revoked_at
                 FROM endpoints WHERE provider=?1 AND token_hash=?2",
                params![request.provider.as_str(), token_hash.as_slice()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| NotifyError::Storage)?;

        let endpoint_id = if let Some((id, principal, network, device, generation, revoked_at)) =
            existing
        {
            let same_owner = principal == authority.principal_id
                && network == authority.network_id
                && device == authority.device_id
                && generation == authority.key_generation as i64
                && revoked_at.is_none();
            if !same_owner {
                revoke_deliveries_for_endpoint(&tx, &id)?;
                tx.execute(
                    "UPDATE endpoints SET principal_id=?2,network_id=?3,device_id=?4,
                       identity_binding_id=?5,key_generation=?6,token=?7,created_at=?8,revoked_at=NULL
                     WHERE endpoint_id=?1",
                    params![
                        id,
                        authority.principal_id,
                        authority.network_id,
                        authority.device_id,
                        authority.identity_binding_id,
                        authority.key_generation as i64,
                        token,
                        now
                    ],
                )
                .map_err(|_| NotifyError::Storage)?;
            }
            id
        } else {
            let account_count =
                count_active_endpoints(&tx, &authority.principal_id, &authority.network_id, None)?;
            let device_count = count_active_endpoints(
                &tx,
                &authority.principal_id,
                &authority.network_id,
                Some(&authority.device_id),
            )?;
            if account_count >= MAX_ENDPOINTS_ACCOUNT || device_count >= MAX_ENDPOINTS_DEVICE {
                return Err(NotifyError::Capacity);
            }
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO endpoints(endpoint_id,principal_id,network_id,device_id,identity_binding_id,
                   key_generation,provider,token_hash,token,created_at,revoked_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,NULL)",
                params![
                    id,
                    authority.principal_id,
                    authority.network_id,
                    authority.device_id,
                    authority.identity_binding_id,
                    authority.key_generation as i64,
                    request.provider.as_str(),
                    token_hash.as_slice(),
                    token,
                    now
                ],
            )
            .map_err(|_| NotifyError::Storage)?;
            id
        };
        tx.commit().map_err(|_| NotifyError::Storage)?;
        Ok(EndpointId(endpoint_id))
    }

    /// Non-secret internal list used so service code can freshly revalidate
    /// each endpoint against AuthStore and DeviceStore before claiming.
    pub fn endpoint_candidates(
        &self,
        principal_id: &str,
        network_id: &str,
    ) -> Result<Vec<EndpointCandidate>, NotifyError> {
        if !canonical_uuid(principal_id) || !canonical_uuid(network_id) {
            return Err(NotifyError::InvalidInput);
        }
        let connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let mut statement = connection
            .prepare(
                "SELECT endpoint_id,device_id,identity_binding_id,key_generation,provider
                 FROM endpoints WHERE principal_id=?1 AND network_id=?2 AND revoked_at IS NULL
                 ORDER BY created_at,endpoint_id LIMIT ?3",
            )
            .map_err(|_| NotifyError::Storage)?;
        let rows = statement
            .query_map(
                params![principal_id, network_id, MAX_ENDPOINTS_ACCOUNT],
                |row| {
                    let generation: i64 = row.get(3)?;
                    let provider: String = row.get(4)?;
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        generation,
                        provider,
                    ))
                },
            )
            .map_err(|_| NotifyError::Storage)?;
        let mut result = Vec::new();
        for row in rows {
            let (endpoint_id, device_id, binding_id, generation, provider) =
                row.map_err(|_| NotifyError::Storage)?;
            let authority = Authority::from_validated_service_state(
                principal_id,
                network_id,
                device_id,
                binding_id,
                u64::try_from(generation).map_err(|_| NotifyError::Storage)?,
            )?;
            result.push(EndpointCandidate {
                endpoint_id,
                authority,
                provider: Provider::parse(&provider)?,
            });
        }
        Ok(result)
    }

    /// Revoke the exact registration binding. Logout should call this before
    /// revoking its current AuthStore session when it owns that endpoint.
    pub fn revoke_endpoint(
        &self,
        authority: &Authority,
        endpoint_id: &EndpointId,
        now: i64,
    ) -> Result<(), NotifyError> {
        authority.validate()?;
        validate_time(now)?;
        let connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .unchecked_transaction()
            .map_err(|_| NotifyError::Storage)?;
        let changed = tx
            .execute(
                "UPDATE endpoints SET revoked_at=?2 WHERE endpoint_id=?1 AND principal_id=?3
                   AND network_id=?4 AND device_id=?5 AND identity_binding_id=?6
                   AND key_generation=?7 AND revoked_at IS NULL",
                params![
                    endpoint_id.0,
                    now,
                    authority.principal_id,
                    authority.network_id,
                    authority.device_id,
                    authority.identity_binding_id,
                    authority.key_generation as i64
                ],
            )
            .map_err(|_| NotifyError::Storage)?;
        if changed == 0 {
            return Err(NotifyError::NotFound);
        }
        revoke_deliveries_for_endpoint(&tx, &endpoint_id.0)?;
        tx.commit().map_err(|_| NotifyError::Storage)
    }

    /// Retire registrations for older/replaced identity bindings on the same
    /// device. Caller must pass the freshly validated current DeviceStore row.
    pub fn retire_stale_device_bindings(
        &self,
        current: &Authority,
        now: i64,
    ) -> Result<usize, NotifyError> {
        current.validate()?;
        validate_time(now)?;
        let mut connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| NotifyError::Storage)?;
        let ids = stale_endpoint_ids(&tx, current)?;
        for id in &ids {
            tx.execute(
                "UPDATE endpoints SET revoked_at=?2 WHERE endpoint_id=?1 AND revoked_at IS NULL",
                params![id, now],
            )
            .map_err(|_| NotifyError::Storage)?;
            revoke_deliveries_for_endpoint(&tx, id)?;
        }
        tx.commit().map_err(|_| NotifyError::Storage)?;
        Ok(ids.len())
    }

    /// Persist a Host hint and fan it out to currently registered endpoints in
    /// the same principal/network. Service code must have freshly verified the
    /// Host connection epoch and the Host's ownership of this Session first.
    pub fn enqueue_hint(
        &self,
        host: &Authority,
        connection_epoch: &str,
        hint: &HostHintV1,
        now: i64,
        ttl_seconds: i64,
    ) -> Result<PushEnvelope, NotifyError> {
        host.validate()?;
        hint.validate()?;
        validate_time(now)?;
        if !canonical_uuid(connection_epoch) || !(1..=MAX_EVENT_TTL_SECONDS).contains(&ttl_seconds)
        {
            return Err(NotifyError::InvalidInput);
        }
        let expires_at = now
            .checked_add(ttl_seconds)
            .ok_or(NotifyError::InvalidInput)?;
        let target_id = host.device_id.clone();
        let content_digest = hint_digest(&target_id, &hint.session_id, hint.kind);

        let mut connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| NotifyError::Storage)?;
        prune(&tx, now)?;

        let existing: Option<(String, Vec<u8>)> = tx
            .query_row(
                "SELECT event_id,content_digest FROM hint_events
                 WHERE principal_id=?1 AND network_id=?2 AND source_device_id=?3
                   AND source_binding_id=?4 AND source_generation=?5 AND source_event_id=?6",
                params![
                    host.principal_id,
                    host.network_id,
                    host.device_id,
                    host.identity_binding_id,
                    host.key_generation as i64,
                    hint.source_event_id
                ],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| NotifyError::Storage)?;
        if let Some((event_id, prior_digest)) = existing {
            if prior_digest.as_slice() != content_digest {
                return Err(NotifyError::Conflict);
            }
            tx.commit().map_err(|_| NotifyError::Storage)?;
            return Ok(PushEnvelope { event_id });
        }

        let active_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM hint_events WHERE principal_id=?1 AND network_id=?2
                   AND state='active' AND expires_at>?3",
                params![host.principal_id, host.network_id, now],
                |row| row.get(0),
            )
            .map_err(|_| NotifyError::Storage)?;
        if active_count >= MAX_ACTIVE_EVENTS_ACCOUNT {
            return Err(NotifyError::Capacity);
        }
        let outstanding: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM deliveries d JOIN hint_events h ON h.event_id=d.event_id
                 WHERE h.principal_id=?1 AND h.network_id=?2 AND h.state='active'
                   AND d.state IN ('pending','leased','unknown') AND h.expires_at>?3",
                params![host.principal_id, host.network_id, now],
                |row| row.get(0),
            )
            .map_err(|_| NotifyError::Storage)?;
        let endpoint_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM endpoints WHERE principal_id=?1 AND network_id=?2 AND revoked_at IS NULL",
                params![host.principal_id, host.network_id],
                |row| row.get(0),
            )
            .map_err(|_| NotifyError::Storage)?;
        if outstanding.saturating_add(endpoint_count) > MAX_OUTSTANDING_DELIVERIES_ACCOUNT {
            return Err(NotifyError::Capacity);
        }

        let event_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO hint_events(event_id,principal_id,network_id,source_device_id,source_binding_id,
               source_generation,source_event_id,content_digest,target_id,session_id,kind,created_at,expires_at,state)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?4,?9,'attention-required',?10,?11,'active')",
            params![
                event_id,
                host.principal_id,
                host.network_id,
                host.device_id,
                host.identity_binding_id,
                host.key_generation as i64,
                hint.source_event_id,
                content_digest.as_slice(),
                hint.session_id,
                now,
                expires_at
            ],
        )
        .map_err(|_| NotifyError::Storage)?;
        tx.execute(
            "INSERT INTO deliveries(event_id,endpoint_id,state,attempts,next_attempt_at,lease_id,lease_until)
             SELECT ?1,endpoint_id,'pending',0,?2,NULL,NULL FROM endpoints
             WHERE principal_id=?3 AND network_id=?4 AND revoked_at IS NULL",
            params![event_id, now, host.principal_id, host.network_id],
        )
        .map_err(|_| NotifyError::Storage)?;
        tx.commit().map_err(|_| NotifyError::Storage)?;
        Ok(PushEnvelope { event_id })
    }

    /// Claim bounded due deliveries for one freshly revalidated endpoint.
    /// Callers must revalidate the same authority immediately before provider IO.
    pub fn claim_due(
        &self,
        endpoint: &FreshEndpoint,
        now: i64,
        limit: usize,
    ) -> Result<Vec<DeliveryClaim>, NotifyError> {
        endpoint.authority.validate()?;
        validate_time(now)?;
        if !(1..=MAX_CLAIMS_PER_CALL).contains(&limit) {
            return Err(NotifyError::InvalidInput);
        }
        let mut connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| NotifyError::Storage)?;
        prune(&tx, now)?;
        require_endpoint(&tx, endpoint)?;
        let ids = {
            let mut statement = tx
                .prepare(
                    "SELECT d.event_id FROM deliveries d JOIN hint_events h ON h.event_id=d.event_id
                     WHERE d.endpoint_id=?1 AND h.state='active' AND h.expires_at>?2
                       AND d.attempts<?3 AND d.next_attempt_at<=?2
                       AND (d.state IN ('pending','unknown') OR (d.state='leased' AND d.lease_until<=?2))
                     ORDER BY d.next_attempt_at,d.event_id LIMIT ?4",
                )
                .map_err(|_| NotifyError::Storage)?;
            let rows = statement
                .query_map(
                    params![endpoint.endpoint_id, now, MAX_ATTEMPTS, limit as i64],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|_| NotifyError::Storage)?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|_| NotifyError::Storage)?
        };

        let mut claims = Vec::with_capacity(ids.len());
        for event_id in ids {
            let lease_id = Uuid::new_v4().to_string();
            let lease_until = now
                .checked_add(MAX_LEASE_SECONDS)
                .ok_or(NotifyError::InvalidInput)?;
            let updated = tx
                .execute(
                    "UPDATE deliveries SET state='leased',attempts=attempts+1,lease_id=?3,lease_until=?4
                     WHERE event_id=?1 AND endpoint_id=?2 AND attempts<?5
                       AND (state IN ('pending','unknown') OR (state='leased' AND lease_until<=?6))",
                    params![event_id, endpoint.endpoint_id, lease_id, lease_until, MAX_ATTEMPTS, now],
                )
                .map_err(|_| NotifyError::Storage)?;
            if updated != 1 {
                continue;
            }
            let (provider, token): (String, String) = tx
                .query_row(
                    "SELECT e.provider,e.token FROM endpoints e WHERE e.endpoint_id=?1 AND e.revoked_at IS NULL",
                    params![endpoint.endpoint_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| NotifyError::Storage)?;
            claims.push(DeliveryClaim {
                event_id,
                endpoint_id: endpoint.endpoint_id.clone(),
                lease_id,
                provider: Provider::parse(&provider)?,
                token: ProviderToken(Zeroizing::new(token)),
                lease_until,
            });
        }
        tx.commit().map_err(|_| NotifyError::Storage)?;
        Ok(claims)
    }

    /// Settle a provider delivery result. `Unknown` is retryable and remains
    /// only a generic hint; it never creates or authorizes a Session action.
    pub fn settle_delivery(
        &self,
        endpoint: &FreshEndpoint,
        claim: &DeliveryClaim,
        outcome: DeliveryOutcome,
        now: i64,
    ) -> Result<(), NotifyError> {
        endpoint.authority.validate()?;
        validate_time(now)?;
        if claim.endpoint_id != endpoint.endpoint_id {
            return Err(NotifyError::Unauthorized);
        }
        let connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .unchecked_transaction()
            .map_err(|_| NotifyError::Storage)?;
        require_endpoint(&tx, endpoint)?;
        let row: Option<(i64, i64)> = tx
            .query_row(
                "SELECT attempts,lease_until FROM deliveries WHERE event_id=?1 AND endpoint_id=?2
                   AND state='leased' AND lease_id=?3",
                params![claim.event_id, claim.endpoint_id, claim.lease_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| NotifyError::Storage)?;
        let Some((attempts, lease_until)) = row else {
            return Err(NotifyError::ClaimExpired);
        };
        if now >= lease_until {
            return Err(NotifyError::ClaimExpired);
        }
        let (state, next_attempt) = match outcome {
            DeliveryOutcome::Accepted => ("sent", now),
            DeliveryOutcome::PermanentFailure => ("failed", now),
            DeliveryOutcome::Unknown | DeliveryOutcome::RetryableFailure => {
                if attempts >= MAX_ATTEMPTS {
                    ("failed", now)
                } else {
                    let delay = 5_i64.saturating_mul(1_i64 << attempts.min(6)).min(300);
                    ("unknown", now.saturating_add(delay))
                }
            }
        };
        tx.execute(
            "UPDATE deliveries SET state=?4,next_attempt_at=?5,lease_id=NULL,lease_until=NULL
             WHERE event_id=?1 AND endpoint_id=?2 AND lease_id=?3",
            params![
                claim.event_id,
                claim.endpoint_id,
                claim.lease_id,
                state,
                next_attempt
            ],
        )
        .map_err(|_| NotifyError::Storage)?;
        tx.commit().map_err(|_| NotifyError::Storage)
    }

    /// Resolve an event only for the exact fresh endpoint scope that received
    /// it. This returns a private pointer, not approval data or an action.
    pub fn redeem_hint(
        &self,
        endpoint: &FreshEndpoint,
        event_id: &str,
        now: i64,
    ) -> Result<SessionPointer, NotifyError> {
        endpoint.authority.validate()?;
        validate_time(now)?;
        if !canonical_uuid(event_id) {
            return Err(NotifyError::InvalidInput);
        }
        let mut connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| NotifyError::Storage)?;
        prune(&tx, now)?;
        require_endpoint(&tx, endpoint)?;
        let pointer: Option<(String, String)> = tx
            .query_row(
                "SELECT h.target_id,h.session_id FROM hint_events h JOIN deliveries d ON d.event_id=h.event_id
                 WHERE h.event_id=?1 AND d.endpoint_id=?2 AND h.principal_id=?3 AND h.network_id=?4
                   AND h.state='active' AND h.expires_at>?5 AND d.state IN ('pending','leased','sent','unknown')",
                params![event_id, endpoint.endpoint_id, endpoint.authority.principal_id, endpoint.authority.network_id, now],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| NotifyError::Storage)?;
        tx.commit().map_err(|_| NotifyError::Storage)?;
        pointer
            .map(|(target_id, session_id)| SessionPointer {
                target_id,
                session_id,
            })
            .ok_or(NotifyError::NotFound)
    }

    /// Explicit service-driven invalidation for an authenticated account/device
    /// retirement. The current identity binding must still be freshly verified.
    pub fn revoke_device_endpoints(
        &self,
        authority: &Authority,
        now: i64,
    ) -> Result<usize, NotifyError> {
        authority.validate()?;
        validate_time(now)?;
        let mut connection = self.connection.lock().map_err(|_| NotifyError::Storage)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| NotifyError::Storage)?;
        let ids = {
            let mut statement = tx
                .prepare(
                    "SELECT endpoint_id FROM endpoints WHERE principal_id=?1 AND network_id=?2 AND device_id=?3
                       AND identity_binding_id=?4 AND key_generation=?5 AND revoked_at IS NULL",
                )
                .map_err(|_| NotifyError::Storage)?;
            let rows = statement
                .query_map(
                    params![
                        authority.principal_id,
                        authority.network_id,
                        authority.device_id,
                        authority.identity_binding_id,
                        authority.key_generation as i64
                    ],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|_| NotifyError::Storage)?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|_| NotifyError::Storage)?
        };
        for id in &ids {
            tx.execute(
                "UPDATE endpoints SET revoked_at=?2 WHERE endpoint_id=?1 AND revoked_at IS NULL",
                params![id, now],
            )
            .map_err(|_| NotifyError::Storage)?;
            revoke_deliveries_for_endpoint(&tx, id)?;
        }
        tx.commit().map_err(|_| NotifyError::Storage)?;
        Ok(ids.len())
    }
}

fn require_endpoint(
    tx: &rusqlite::Transaction<'_>,
    endpoint: &FreshEndpoint,
) -> Result<(), NotifyError> {
    let exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM endpoints WHERE endpoint_id=?1 AND principal_id=?2 AND network_id=?3
               AND device_id=?4 AND identity_binding_id=?5 AND key_generation=?6 AND revoked_at IS NULL)",
            params![
                endpoint.endpoint_id,
                endpoint.authority.principal_id,
                endpoint.authority.network_id,
                endpoint.authority.device_id,
                endpoint.authority.identity_binding_id,
                endpoint.authority.key_generation as i64
            ],
            |row| row.get(0),
        )
        .map_err(|_| NotifyError::Storage)?;
    if exists {
        Ok(())
    } else {
        Err(NotifyError::Unauthorized)
    }
}

fn count_active_endpoints(
    tx: &rusqlite::Transaction<'_>,
    principal_id: &str,
    network_id: &str,
    device_id: Option<&str>,
) -> Result<i64, NotifyError> {
    let count: i64 = if let Some(device_id) = device_id {
        tx.query_row(
            "SELECT COUNT(*) FROM endpoints WHERE principal_id=?1 AND network_id=?2 AND device_id=?3 AND revoked_at IS NULL",
            params![principal_id, network_id, device_id],
            |row| row.get(0),
        )
    } else {
        tx.query_row(
            "SELECT COUNT(*) FROM endpoints WHERE principal_id=?1 AND network_id=?2 AND revoked_at IS NULL",
            params![principal_id, network_id],
            |row| row.get(0),
        )
    }
    .map_err(|_| NotifyError::Storage)?;
    Ok(count)
}

fn stale_endpoint_ids(
    tx: &rusqlite::Transaction<'_>,
    current: &Authority,
) -> Result<Vec<String>, NotifyError> {
    let mut statement = tx
        .prepare(
            "SELECT endpoint_id FROM endpoints WHERE principal_id=?1 AND network_id=?2 AND device_id=?3
               AND revoked_at IS NULL AND (identity_binding_id<>?4 OR key_generation<>?5)",
        )
        .map_err(|_| NotifyError::Storage)?;
    let rows = statement
        .query_map(
            params![
                current.principal_id,
                current.network_id,
                current.device_id,
                current.identity_binding_id,
                current.key_generation as i64
            ],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| NotifyError::Storage)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| NotifyError::Storage)
}

fn retire_stale_endpoints(
    tx: &rusqlite::Transaction<'_>,
    current: &Authority,
    now: i64,
) -> Result<(), NotifyError> {
    for id in stale_endpoint_ids(tx, current)? {
        tx.execute(
            "UPDATE endpoints SET revoked_at=?2 WHERE endpoint_id=?1 AND revoked_at IS NULL",
            params![id, now],
        )
        .map_err(|_| NotifyError::Storage)?;
        revoke_deliveries_for_endpoint(tx, &id)?;
    }
    Ok(())
}

fn revoke_deliveries_for_endpoint(
    tx: &rusqlite::Transaction<'_>,
    endpoint_id: &str,
) -> Result<(), NotifyError> {
    tx.execute(
        "UPDATE deliveries SET state='revoked',lease_id=NULL,lease_until=NULL
         WHERE endpoint_id=?1 AND state IN ('pending','leased','unknown')",
        params![endpoint_id],
    )
    .map_err(|_| NotifyError::Storage)?;
    Ok(())
}

fn prune(tx: &rusqlite::Transaction<'_>, now: i64) -> Result<(), NotifyError> {
    tx.execute(
        "UPDATE hint_events SET state='expired' WHERE state='active' AND expires_at<=?1",
        params![now],
    )
    .map_err(|_| NotifyError::Storage)?;
    tx.execute(
        "UPDATE deliveries SET state='expired',lease_id=NULL,lease_until=NULL
         WHERE state IN ('pending','leased','unknown') AND event_id IN
           (SELECT event_id FROM hint_events WHERE state='expired')",
        [],
    )
    .map_err(|_| NotifyError::Storage)?;
    let cutoff = now.saturating_sub(DEDUPE_RETENTION_SECONDS);
    tx.execute(
        "DELETE FROM hint_events WHERE created_at<?1 AND state IN ('expired','revoked')",
        params![cutoff],
    )
    .map_err(|_| NotifyError::Storage)?;
    Ok(())
}

fn validate_state_dir(path: &Path) -> Result<PathBuf, NotifyError> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| NotifyError::UnsafePath)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(NotifyError::UnsafePath);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        if metadata.uid() != nix::unistd::Uid::current().as_raw()
            || metadata.permissions().mode() & 0o777 != 0o700
        {
            return Err(NotifyError::UnsafePath);
        }
    }
    path.canonicalize().map_err(|_| NotifyError::UnsafePath)
}

#[cfg(unix)]
fn create_private_database_file(path: &Path) -> Result<(), NotifyError> {
    use std::os::unix::fs::OpenOptionsExt;
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
    {
        Ok(file) => file.sync_all().map_err(|_| NotifyError::Storage),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            validate_database_file(path)
        }
        Err(_) => Err(NotifyError::UnsafePath),
    }
}

#[cfg(not(unix))]
fn create_private_database_file(path: &Path) -> Result<(), NotifyError> {
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(file) => file.sync_all().map_err(|_| NotifyError::Storage),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            validate_database_file(path)
        }
        Err(_) => Err(NotifyError::UnsafePath),
    }
}

#[cfg(unix)]
fn validate_database_file(path: &Path) -> Result<(), NotifyError> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let metadata = std::fs::symlink_metadata(path).map_err(|_| NotifyError::UnsafePath)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.uid() != nix::unistd::Uid::current().as_raw()
        || metadata.nlink() != 1
        || metadata.permissions().mode() & 0o777 != 0o600
    {
        return Err(NotifyError::UnsafePath);
    }
    Ok(())
}

#[cfg(not(unix))]
fn validate_database_file(path: &Path) -> Result<(), NotifyError> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| NotifyError::UnsafePath)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(NotifyError::UnsafePath);
    }
    Ok(())
}

fn canonical_uuid(value: &str) -> bool {
    Uuid::parse_str(value).is_ok_and(|parsed| parsed.to_string() == value)
}

fn valid_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 99
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn validate_time(now: i64) -> Result<(), NotifyError> {
    if now < 0 {
        Err(NotifyError::InvalidInput)
    } else {
        Ok(())
    }
}

fn token_digest(provider: Provider, token: &str) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(provider.as_str().as_bytes());
    digest.update([0]);
    digest.update(token.as_bytes());
    digest.finalize().into()
}

fn hint_digest(target_id: &str, session_id: &str, kind: HintKind) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(b"moxbots-agentnet-mobile-hint-v1\0");
    digest.update(match kind {
        HintKind::AttentionRequired => b"attention-required".as_slice(),
    });
    digest.update([0]);
    digest.update(target_id.as_bytes());
    digest.update([0]);
    digest.update(session_id.as_bytes());
    digest.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt};

    const PRINCIPAL: &str = "11111111-1111-4111-8111-111111111111";
    const NETWORK: &str = "22222222-2222-4222-8222-222222222222";
    const DEVICE: &str = "33333333-3333-4333-8333-333333333333";
    const BINDING: &str = "44444444-4444-4444-8444-444444444444";
    const OTHER_DEVICE: &str = "55555555-5555-4555-8555-555555555555";
    const OTHER_BINDING: &str = "66666666-6666-4666-8666-666666666666";

    fn authority(device: &str, binding: &str, generation: u64) -> Authority {
        Authority::from_validated_service_state(PRINCIPAL, NETWORK, device, binding, generation)
            .unwrap()
    }

    fn fresh(endpoint_id: &EndpointId, authority: Authority) -> FreshEndpoint {
        FreshEndpoint::from_validated_service_state(endpoint_id.as_str(), authority).unwrap()
    }

    fn open() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
        let store = Store::open(dir.path()).unwrap();
        (dir, store)
    }

    fn register(store: &Store, auth: &Authority, token: &str, now: i64) -> EndpointId {
        store
            .register_endpoint(
                auth,
                RegisterEndpointV1::new(Provider::Fcm, token).unwrap(),
                now,
            )
            .unwrap()
    }

    fn hint(source_event_id: &str, session_id: &str) -> HostHintV1 {
        HostHintV1::new(source_event_id, session_id).unwrap()
    }

    #[test]
    fn registration_contract_is_strict_and_redacts_tokens() {
        let token = "opaque-device-token-do-not-log";
        let request: RegisterEndpointV1 = serde_json::from_str(&format!(
            r#"{{"version":1,"provider":"fcm","token":"{token}"}}"#
        ))
        .unwrap();
        assert!(!format!("{request:?}").contains(token));
        assert!(
            serde_json::from_str::<RegisterEndpointV1>(&format!(
                r#"{{"version":1,"provider":"fcm","token":"{token}","deviceId":"{DEVICE}"}}"#
            ))
            .is_err()
        );
        assert!(
            serde_json::from_str::<RegisterEndpointV1>(
                r#"{"version":2,"provider":"fcm","token":"token"}"#
            )
            .unwrap()
            .validate()
            .is_err()
        );
        assert!(RegisterEndpointV1::new(Provider::Fcm, "bad\ntoken").is_err());
        assert!(RegisterEndpointV1::new(Provider::Fcm, "x".repeat(MAX_TOKEN_BYTES + 1)).is_err());
    }

    #[test]
    fn endpoint_registration_is_idempotent_scoped_and_generation_bound() {
        let (_dir, store) = open();
        let first = authority(DEVICE, BINDING, 1);
        let original = register(&store, &first, "token-one", 10);
        let repeated = register(&store, &first, "token-one", 11);
        assert_eq!(original, repeated);
        assert_eq!(
            store.endpoint_candidates(PRINCIPAL, NETWORK).unwrap().len(),
            1
        );

        let rotated = authority(DEVICE, OTHER_BINDING, 2);
        let replacement = register(&store, &rotated, "token-two", 12);
        let candidates = store.endpoint_candidates(PRINCIPAL, NETWORK).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].endpoint_id(), replacement.as_str());
        assert_eq!(candidates[0].authority(), &rotated);
        assert_ne!(original, replacement);
    }

    #[test]
    fn provider_token_rebinding_revokes_old_owner_delivery() {
        let (_dir, store) = open();
        let old = authority(DEVICE, BINDING, 1);
        let endpoint = register(&store, &old, "shared-token", 10);
        let event = store
            .enqueue_hint(
                &old,
                "77777777-7777-4777-8777-777777777777",
                &hint("88888888-8888-4888-8888-888888888888", "session-a"),
                11,
                100,
            )
            .unwrap();

        let new_owner = Authority::from_validated_service_state(
            "99999999-9999-4999-8999-999999999999",
            NETWORK,
            DEVICE,
            BINDING,
            1,
        )
        .unwrap();
        let moved = register(&store, &new_owner, "shared-token", 12);
        assert_eq!(moved, endpoint);
        assert!(matches!(
            store.redeem_hint(&fresh(&endpoint, old.clone()), event.event_id(), 13),
            Err(NotifyError::Unauthorized)
        ));
        assert!(
            store
                .endpoint_candidates(PRINCIPAL, NETWORK)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            store
                .endpoint_candidates(&new_owner.principal_id, NETWORK)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn account_and_device_quotas_are_enforced() {
        let (_dir, store) = open();
        for index in 0..MAX_ENDPOINTS_DEVICE {
            register(
                &store,
                &authority(DEVICE, BINDING, 1),
                &format!("token-{index}"),
                10 + index,
            );
        }
        assert!(matches!(
            store.register_endpoint(
                &authority(DEVICE, BINDING, 1),
                RegisterEndpointV1::new(Provider::Fcm, "too-many").unwrap(),
                20
            ),
            Err(NotifyError::Capacity)
        ));
        for index in 0..(MAX_ENDPOINTS_ACCOUNT - MAX_ENDPOINTS_DEVICE) {
            let device_id = format!("aaaaaaaa-aaaa-4aaa-8aaa-{index:012}");
            let binding_id = format!("bbbbbbbb-bbbb-4bbb-8bbb-{index:012}");
            register(
                &store,
                &authority(&device_id, &binding_id, 1),
                &format!("other-{index}"),
                30 + index,
            );
        }
        assert!(matches!(
            store.register_endpoint(
                &authority(OTHER_DEVICE, OTHER_BINDING, 1),
                RegisterEndpointV1::new(Provider::Fcm, "account-overflow").unwrap(),
                99
            ),
            Err(NotifyError::Capacity)
        ));
    }

    #[test]
    fn hint_deduplicates_source_event_and_push_envelope_has_only_event_id() {
        let (_dir, store) = open();
        let auth = authority(DEVICE, BINDING, 1);
        let endpoint = register(&store, &auth, "token-one", 10);
        let source = "88888888-8888-4888-8888-888888888888";
        let epoch = "77777777-7777-4777-8777-777777777777";
        let first = store
            .enqueue_hint(&auth, epoch, &hint(source, "session-a"), 11, 100)
            .unwrap();
        let repeated = store
            .enqueue_hint(&auth, epoch, &hint(source, "session-a"), 12, 100)
            .unwrap();
        assert_eq!(first, repeated);
        assert!(matches!(
            store.enqueue_hint(&auth, epoch, &hint(source, "session-b"), 12, 100),
            Err(NotifyError::Conflict)
        ));
        let fresh = fresh(&endpoint, auth);
        let claim = store.claim_due(&fresh, 13, 1).unwrap().remove(0);
        assert_eq!(claim.token(), "token-one");
        assert!(!format!("{claim:?}").contains("token-one"));
        let envelope = serde_json::to_value(claim.envelope()).unwrap();
        assert_eq!(envelope, serde_json::json!({"eventId": first.event_id()}));
        assert!(!envelope.to_string().contains("session-a"));
    }

    #[test]
    fn claim_lease_recovery_and_redemption_require_exact_fresh_endpoint() {
        let (_dir, store) = open();
        let auth = authority(DEVICE, BINDING, 1);
        let endpoint = register(&store, &auth, "token-one", 10);
        let event = store
            .enqueue_hint(
                &auth,
                "77777777-7777-4777-8777-777777777777",
                &hint("88888888-8888-4888-8888-888888888888", "session-a"),
                11,
                1000,
            )
            .unwrap();
        let recipient = fresh(&endpoint, auth.clone());
        let first = store.claim_due(&recipient, 12, 1).unwrap().remove(0);
        assert!(matches!(
            store.redeem_hint(
                &fresh(&endpoint, authority(OTHER_DEVICE, OTHER_BINDING, 1)),
                event.event_id(),
                13
            ),
            Err(NotifyError::Unauthorized)
        ));
        let recovered = store
            .claim_due(&recipient, first.lease_until(), 1)
            .unwrap()
            .remove(0);
        assert_eq!(recovered.envelope(), first.envelope());
        assert_ne!(recovered.lease_until(), first.lease_until());
        store
            .settle_delivery(
                &recipient,
                &recovered,
                DeliveryOutcome::Unknown,
                first.lease_until() + 1,
            )
            .unwrap();
        // The provider outcome is unknown; the same event retries after bounded backoff.
        let retry = store
            .claim_due(&recipient, first.lease_until() + 20, 1)
            .unwrap();
        assert!(retry.is_empty());
        let retry = store
            .claim_due(&recipient, first.lease_until() + 21, 1)
            .unwrap();
        assert_eq!(retry.len(), 1);
        assert_eq!(retry[0].envelope(), first.envelope());
        let pointer = store
            .redeem_hint(&recipient, event.event_id(), first.lease_until() + 21)
            .unwrap();
        assert_eq!(pointer.target_id, DEVICE);
        assert_eq!(pointer.session_id, "session-a");
    }

    #[test]
    fn expiry_revocation_and_stale_binding_stop_claim_and_redemption() {
        let (_dir, store) = open();
        let auth = authority(DEVICE, BINDING, 1);
        let endpoint = register(&store, &auth, "token-one", 10);
        let event = store
            .enqueue_hint(
                &auth,
                "77777777-7777-4777-8777-777777777777",
                &hint("88888888-8888-4888-8888-888888888888", "session-a"),
                11,
                1,
            )
            .unwrap();
        let fresh = fresh(&endpoint, auth.clone());
        assert!(store.claim_due(&fresh, 12, 1).unwrap().is_empty());
        assert!(matches!(
            store.redeem_hint(&fresh, event.event_id(), 12),
            Err(NotifyError::NotFound)
        ));

        let event2 = store
            .enqueue_hint(
                &auth,
                "77777777-7777-4777-8777-777777777777",
                &hint("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "session-b"),
                20,
                100,
            )
            .unwrap();
        store
            .retire_stale_device_bindings(&authority(DEVICE, OTHER_BINDING, 2), 21)
            .unwrap();
        assert!(matches!(
            store.claim_due(&fresh, 22, 1),
            Err(NotifyError::Unauthorized)
        ));
        assert!(matches!(
            store.redeem_hint(&fresh, event2.event_id(), 22),
            Err(NotifyError::Unauthorized)
        ));
    }

    #[test]
    fn storage_file_has_private_permissions_and_input_bounds_hold() {
        let (dir, store) = open();
        let metadata = fs::metadata(dir.path().join(DATABASE_NAME)).unwrap();
        assert_eq!(metadata.permissions().mode() & 0o777, 0o600);
        assert!(
            store
                .enqueue_hint(
                    &authority(DEVICE, BINDING, 1),
                    "bad-epoch",
                    &hint("88888888-8888-4888-8888-888888888888", "session"),
                    1,
                    10
                )
                .is_err()
        );
        assert!(HostHintV1::new("not-a-uuid", "session").is_err());
        assert!(HostHintV1::new("88888888-8888-4888-8888-888888888888", "bad/session").is_err());
    }
}
