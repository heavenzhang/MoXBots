//! Internal, authenticated adapter for the mobile notification store.
//!
//! This router is intentionally not mounted by `server.rs`; it is only a
//! locally testable adapter until the service-side publish and provider worker
//! contracts are implemented.

use crate::{AuthError, AuthStore, SessionProjection};
use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State, rejection::BytesRejection},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, post},
};
use myagents_agentnet_device_core::{
    ChallengeOperation, DeviceError, DeviceRecord, DeviceStore, SessionContext,
};
use myagents_agentnet_mobile_notify_core::{
    Authority, FreshEndpoint, HostHintV1, NotifyError, Provider, RegisterEndpointV1,
    SessionPointer, SourceChallengeState, Store, TargetScope,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use zeroize::Zeroizing;

const MAX_BODY_BYTES: usize = 8 * 1024;

#[derive(Clone)]
pub struct MobileNotificationService {
    pub(super) auth: Arc<AuthStore>,
    pub(super) devices: Arc<DeviceStore>,
    pub(super) store: Arc<Store>,
    pub(super) network_id: String,
    supported_providers: Option<HashSet<Provider>>,
}

impl MobileNotificationService {
    pub fn new(
        auth: Arc<AuthStore>,
        devices: Arc<DeviceStore>,
        store: Arc<Store>,
        network_id: impl Into<String>,
    ) -> Self {
        Self {
            auth,
            devices,
            store,
            network_id: network_id.into(),
            supported_providers: None,
        }
    }

    pub(crate) fn with_provider_allowlist(
        mut self,
        providers: impl IntoIterator<Item = Provider>,
    ) -> Self {
        self.supported_providers = Some(providers.into_iter().collect());
        self
    }

    fn supports_provider(&self, provider: Provider) -> bool {
        self.supported_providers
            .as_ref()
            .is_none_or(|supported| supported.contains(&provider))
    }

    fn has_provider(&self) -> bool {
        self.supported_providers
            .as_ref()
            .is_none_or(|supported| !supported.is_empty())
    }

    /// Mounted by the production server only when mobile notification delivery
    /// is explicitly enabled with at least one configured provider.
    pub fn router(&self) -> Router<()> {
        Router::new()
            .route("/api/mobile-notify/v1/endpoints", post(register))
            .route(
                "/api/mobile-notify/v1/endpoints/{endpoint_id}",
                delete(revoke),
            )
            .route(
                "/api/mobile-notify/v1/endpoints/{endpoint_id}/events/{event_id}/redeem",
                post(redeem),
            )
            .route(
                "/api/mobile-notify/v1/source/challenges",
                post(create_source_challenge),
            )
            .route(
                "/api/mobile-notify/v1/source/hints",
                post(publish_source_hint),
            )
            .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
            .layer(axum::middleware::from_fn(no_store))
            .with_state(Arc::new(self.clone()))
    }

    fn with_authority<T>(
        &self,
        headers: &HeaderMap,
        operation: impl FnOnce(&SessionProjection, &Authority) -> Result<T, MobileHttpError>,
    ) -> Result<T, MobileHttpError> {
        let bearer = bearer_token(headers)?;
        self.auth.with_valid_session(&bearer, |session| {
            let authority = self.authority_for(&session)?;
            operation(&session, &authority)
        })
    }

    pub(super) fn authority_for(
        &self,
        session: &SessionProjection,
    ) -> Result<Authority, MobileHttpError> {
        if session.account.network_id != self.network_id {
            return Err(MobileHttpError::unauthorized());
        }
        let context = session_context(session);
        let record = self
            .devices
            .read_state(&context, &session.device_id)
            .map_err(|_| MobileHttpError::unavailable())?
            .ok_or_else(MobileHttpError::unauthorized)?;
        require_exact_owner(session, &record)?;
        let authority = Authority::from_validated_service_state(
            &record.principal_id,
            &record.network_id,
            &record.device_id,
            &record.identity_binding_id,
            record.key_generation,
        )
        .map_err(|_| MobileHttpError::unauthorized())?;
        self.store
            .retire_stale_device_bindings(&authority, unix_seconds()?)
            .map_err(MobileHttpError::notify)?;
        Ok(authority)
    }
}

async fn no_store(request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store, max-age=0"),
    );
    response
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RedeemBody {
    version: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistrationResponse {
    version: u8,
    endpoint_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RedemptionResponse {
    version: u8,
    target_device_id: String,
    agent_id: String,
    session_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceChallengeRequest {
    version: u8,
    #[serde(rename = "sourceEventId")]
    source_event_id: String,
    #[serde(rename = "connectionEpoch")]
    connection_epoch: String,
    #[serde(rename = "agentId")]
    agent_id: String,
    #[serde(rename = "sessionId")]
    session_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceHintRequest {
    version: u8,
    #[serde(rename = "challengeId")]
    challenge_id: String,
    proof: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceChallengeResponse {
    version: u8,
    challenge_id: String,
    nonce: String,
    expires_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceHintResponse {
    version: u8,
    event_id: String,
}

async fn register(
    State(service): State<Arc<MobileNotificationService>>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Result<impl IntoResponse, MobileHttpError> {
    let body = body.map_err(|_| MobileHttpError::bad_request())?;
    if body.len() > MAX_BODY_BYTES {
        return Err(MobileHttpError::bad_request());
    }
    let request: RegisterEndpointV1 =
        serde_json::from_slice(&body).map_err(|_| MobileHttpError::bad_request())?;
    let result = service.with_authority(&headers, |session, authority| {
        if !service.supports_provider(request.provider) {
            return Err(MobileHttpError::provider_unavailable());
        }
        service
            .store
            .register_endpoint_for_session(
                authority,
                &session.session_handle,
                request,
                unix_seconds()?,
            )
            .map_err(MobileHttpError::notify)
    })?;
    Ok((
        StatusCode::CREATED,
        axum::Json(RegistrationResponse {
            version: 1,
            endpoint_id: result.as_str().to_owned(),
        }),
    ))
}

async fn revoke(
    State(service): State<Arc<MobileNotificationService>>,
    Path(endpoint_id): Path<String>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Result<impl IntoResponse, MobileHttpError> {
    let body = body.map_err(|_| MobileHttpError::bad_request())?;
    if !body.is_empty() {
        return Err(MobileHttpError::bad_request());
    }
    let id = myagents_agentnet_mobile_notify_core::EndpointId::parse(endpoint_id)
        .map_err(MobileHttpError::notify)?;
    service.with_authority(&headers, |session, authority| {
        service
            .store
            .revoke_endpoint(authority, &session.session_handle, &id, unix_seconds()?)
            .map_err(MobileHttpError::notify)
    })?;
    Ok(axum::Json(json!({"ok":true,"version":1})))
}

async fn redeem(
    State(service): State<Arc<MobileNotificationService>>,
    Path((endpoint_id, event_id)): Path<(String, String)>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Result<impl IntoResponse, MobileHttpError> {
    let body = body.map_err(|_| MobileHttpError::bad_request())?;
    if body.len() > MAX_BODY_BYTES {
        return Err(MobileHttpError::bad_request());
    }
    let body: RedeemBody =
        serde_json::from_slice(&body).map_err(|_| MobileHttpError::bad_request())?;
    if body.version != 1 {
        return Err(MobileHttpError::bad_request());
    }
    let pointer = service.with_authority(&headers, |session, authority| {
        let fresh = FreshEndpoint::from_validated_service_state(
            endpoint_id,
            authority.clone(),
            session.session_handle.clone(),
        )
        .map_err(MobileHttpError::notify)?;
        service
            .store
            .redeem_hint(&fresh, &event_id, unix_seconds()?)
            .map_err(MobileHttpError::notify)
    })?;
    Ok(axum::Json(redemption(pointer)))
}

async fn create_source_challenge(
    State(service): State<Arc<MobileNotificationService>>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Result<impl IntoResponse, MobileHttpError> {
    let body = body.map_err(|_| MobileHttpError::bad_request())?;
    if body.len() > MAX_BODY_BYTES {
        return Err(MobileHttpError::bad_request());
    }
    let request: SourceChallengeRequest =
        serde_json::from_slice(&body).map_err(|_| MobileHttpError::bad_request())?;
    if request.version != 1 || !service.has_provider() {
        return Err(if request.version != 1 {
            MobileHttpError::bad_request()
        } else {
            MobileHttpError::provider_unavailable()
        });
    }
    let challenge = service.with_authority(&headers, |session, authority| {
        let context = session_context(session);
        let record = service
            .devices
            .read_state(&context, &session.device_id)
            .map_err(|_| MobileHttpError::unavailable())?
            .ok_or_else(MobileHttpError::unauthorized)?;
        require_exact_owner(session, &record)?;
        let observed = Authority::from_validated_service_state(
            &record.principal_id,
            &record.network_id,
            &record.device_id,
            &record.identity_binding_id,
            record.key_generation,
        )
        .map_err(MobileHttpError::notify)?;
        if &observed != authority {
            return Err(MobileHttpError::unauthorized());
        }
        TargetScope::from_validated_host_session(authority, &request.agent_id)
            .map_err(MobileHttpError::notify)?;
        HostHintV1::new(&request.source_event_id, &request.session_id)
            .map_err(MobileHttpError::notify)?;
        service
            .store
            .check_source_challenge_request(
                authority,
                &request.source_event_id,
                &request.connection_epoch,
                &request.agent_id,
                &request.session_id,
                unix_seconds()?,
            )
            .map_err(MobileHttpError::notify)?;
        let challenge = service
            .devices
            .create_challenge(
                &context,
                ChallengeOperation::RecoverQuery,
                record.key_generation,
                &record.key_fingerprint,
            )
            .map_err(MobileHttpError::device)?;
        service
            .store
            .bind_source_challenge(
                authority,
                &session.session_handle,
                &challenge.challenge_id,
                &request.source_event_id,
                &request.connection_epoch,
                &request.agent_id,
                &request.session_id,
                challenge.expires_at,
                unix_seconds()?,
            )
            .map_err(MobileHttpError::notify)?;
        Ok(challenge)
    })?;
    Ok((
        StatusCode::CREATED,
        axum::Json(SourceChallengeResponse {
            version: 1,
            challenge_id: challenge.challenge_id,
            nonce: challenge.nonce,
            expires_at: challenge.expires_at,
        }),
    ))
}

async fn publish_source_hint(
    State(service): State<Arc<MobileNotificationService>>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Result<impl IntoResponse, MobileHttpError> {
    let body = body.map_err(|_| MobileHttpError::bad_request())?;
    if body.len() > MAX_BODY_BYTES {
        return Err(MobileHttpError::bad_request());
    }
    let request: SourceHintRequest =
        serde_json::from_slice(&body).map_err(|_| MobileHttpError::bad_request())?;
    if request.version != 1 || request.proof.len() != 86 || !is_base64url(&request.proof) {
        return Err(MobileHttpError::bad_request());
    }
    if !service.has_provider() {
        return Err(MobileHttpError::provider_unavailable());
    }
    let proof_digest: [u8; 32] = Sha256::digest(request.proof.as_bytes()).into();
    let event_id = service.with_authority(&headers, |session, authority| {
        let now = unix_seconds()?;
        let binding = service
            .store
            .source_challenge_for_scope(
                authority,
                &session.session_handle,
                &request.challenge_id,
                now,
            )
            .map_err(MobileHttpError::notify)?;
        match &binding.state {
            SourceChallengeState::Finalized {
                proof_digest: prior_digest,
                event_id,
            } => {
                if prior_digest == &proof_digest {
                    return Ok(event_id.clone());
                }
                return Err(MobileHttpError::challenge_unconfirmed());
            }
            SourceChallengeState::ConsumedUnconfirmed => {
                return Err(MobileHttpError::challenge_unconfirmed());
            }
            SourceChallengeState::Pending => {}
        }

        let context = session_context(session);
        let record = service
            .devices
            .read_state(&context, &session.device_id)
            .map_err(|_| MobileHttpError::unavailable())?
            .ok_or_else(MobileHttpError::unauthorized)?;
        require_exact_owner(session, &record)?;
        let observed = Authority::from_validated_service_state(
            &record.principal_id,
            &record.network_id,
            &record.device_id,
            &record.identity_binding_id,
            record.key_generation,
        )
        .map_err(MobileHttpError::notify)?;
        if &observed != authority {
            return Err(MobileHttpError::unauthorized());
        }
        let verified = match service.devices.consume_proof(
            &context,
            ChallengeOperation::RecoverQuery,
            record.key_generation,
            &binding.challenge_id,
            &request.proof,
        ) {
            Ok(record) => record,
            Err(error) => {
                if matches!(
                    error,
                    DeviceError::ProofInvalid
                        | DeviceError::ChallengeRejected
                        | DeviceError::ChallengeExpired
                        | DeviceError::GenerationConflict
                ) {
                    let _ = service.store.mark_source_challenge_unconfirmed(
                        authority,
                        &session.session_handle,
                        &binding.challenge_id,
                        unix_seconds()?,
                    );
                    return Err(MobileHttpError::challenge_unconfirmed());
                }
                return Err(MobileHttpError::device(error));
            }
        };
        if verified != record {
            let _ = service.store.mark_source_challenge_unconfirmed(
                authority,
                &session.session_handle,
                &binding.challenge_id,
                unix_seconds()?,
            );
            return Err(MobileHttpError::challenge_unconfirmed());
        }
        let target = TargetScope::from_validated_host_session(authority, &binding.agent_id)
            .map_err(MobileHttpError::notify)?;
        let hint = HostHintV1::new(&binding.source_event_id, &binding.session_id)
            .map_err(MobileHttpError::notify)?;
        let event = service
            .store
            .enqueue_hint(
                authority,
                &target,
                &binding.connection_epoch,
                &hint,
                unix_seconds()?,
                86_400,
            )
            .map_err(MobileHttpError::notify)?;
        service
            .store
            .finalize_source_challenge(
                authority,
                &session.session_handle,
                &binding.challenge_id,
                &proof_digest,
                event.event_id(),
                unix_seconds()?,
            )
            .map_err(MobileHttpError::notify)?;
        Ok(event.event_id().to_owned())
    })?;
    Ok(axum::Json(SourceHintResponse {
        version: 1,
        event_id,
    }))
}

fn is_base64url(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}

fn redemption(pointer: SessionPointer) -> RedemptionResponse {
    RedemptionResponse {
        version: 1,
        target_device_id: pointer.target_device_id,
        agent_id: pointer.agent_id,
        session_id: pointer.session_id,
    }
}

fn session_context(session: &SessionProjection) -> SessionContext {
    SessionContext {
        principal_id: session.account.principal_id.clone(),
        network_id: session.account.network_id.clone(),
        device_id: session.device_id.clone(),
        session_handle: session.session_handle.clone(),
        expires_at: session.expires_at,
    }
}

fn require_exact_owner(
    session: &SessionProjection,
    record: &DeviceRecord,
) -> Result<(), MobileHttpError> {
    if record.principal_id != session.account.principal_id
        || record.network_id != session.account.network_id
        || record.device_id != session.device_id
    {
        return Err(MobileHttpError::unauthorized());
    }
    Ok(())
}

fn bearer_token(headers: &HeaderMap) -> Result<Zeroizing<String>, MobileHttpError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| {
            token.len() == 43
                && token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        })
        .ok_or_else(MobileHttpError::unauthorized)?;
    Ok(Zeroizing::new(token.to_owned()))
}

fn unix_seconds() -> Result<i64, MobileHttpError> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| MobileHttpError::unavailable())?
        .as_secs();
    i64::try_from(seconds).map_err(|_| MobileHttpError::unavailable())
}

#[derive(Debug)]
pub(super) struct MobileHttpError {
    status: StatusCode,
    code: &'static str,
}

impl MobileHttpError {
    fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED",
        }
    }
    fn bad_request() -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "REQUEST_INVALID",
        }
    }
    fn unavailable() -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "MOBILE_NOTIFY_UNAVAILABLE",
        }
    }
    fn provider_unavailable() -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            code: "MOBILE_NOTIFY_PROVIDER_UNAVAILABLE",
        }
    }
    fn challenge_unconfirmed() -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: "SOURCE_PROOF_UNCONFIRMED_RETRY_CHALLENGE",
        }
    }
    fn device(error: DeviceError) -> Self {
        match error {
            DeviceError::InvalidInput => Self::bad_request(),
            DeviceError::Storage | DeviceError::UnsafePath => Self::unavailable(),
            DeviceError::ChallengeRejected
            | DeviceError::ChallengeExpired
            | DeviceError::ProofInvalid
            | DeviceError::GenerationConflict
            | DeviceError::InvalidSession
            | DeviceError::DeviceNotFound
            | DeviceError::OwnerMismatch
            | DeviceError::DeviceAlreadyClaimed
            | DeviceError::GenerationExhausted => Self::challenge_unconfirmed(),
        }
    }
    fn notify(error: NotifyError) -> Self {
        match error {
            NotifyError::InvalidInput => Self::bad_request(),
            NotifyError::Unauthorized | NotifyError::NotFound | NotifyError::ClaimExpired => {
                Self::unauthorized()
            }
            NotifyError::Capacity | NotifyError::Conflict => Self {
                status: StatusCode::CONFLICT,
                code: "MOBILE_NOTIFY_CONFLICT",
            },
            NotifyError::Storage | NotifyError::UnsafePath => Self::unavailable(),
        }
    }
}

impl From<AuthError> for MobileHttpError {
    fn from(error: AuthError) -> Self {
        if error == AuthError::SessionRejected {
            Self::unauthorized()
        } else {
            Self::unavailable()
        }
    }
}

impl IntoResponse for MobileHttpError {
    fn into_response(self) -> Response {
        (
            self.status,
            axum::Json(json!({"ok":false,"error":{"code":self.code}})),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AuthConfig, VerifiedSubject};
    use axum::{
        Router,
        body::Body,
        http::{Request, header::CONTENT_TYPE},
    };
    use myagents_agent_network_crypto::DevicePrivateKey;
    use myagents_agentnet_device_core::DeviceStore;
    use myagents_agentnet_mobile_notify_core::{HostHintV1, TargetScope};
    use serde_json::{Value, json};
    use std::{fs, os::unix::fs::PermissionsExt, time::Duration};
    use tempfile::TempDir;
    use tower::ServiceExt;
    use uuid::Uuid;

    struct Fixture {
        _dir: TempDir,
        auth: Arc<AuthStore>,
        devices: Arc<DeviceStore>,
        store: Arc<Store>,
        router: Router,
        mobile_token: String,
        other_token: String,
        host_device: String,
        mobile_key: DevicePrivateKey,
    }

    fn private_dir() -> TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
        dir
    }

    fn issue(auth: &AuthStore, name: &str, device: &str) -> String {
        auth.issue_session(
            &VerifiedSubject::from_verified_claims(
                "https://issuer.example.test".into(),
                name.into(),
            )
            .unwrap(),
            device,
        )
        .unwrap()
        .into_token()
        .to_string()
    }

    fn claim(
        devices: &DeviceStore,
        auth: &AuthStore,
        token: &str,
    ) -> (DeviceRecord, DevicePrivateKey) {
        let session = auth.validate_session(token).unwrap();
        let context = session_context(&session);
        let key = DevicePrivateKey::generate().unwrap();
        let record = devices
            .claim_initial(&context, &key.csr().unwrap())
            .unwrap();
        (record, key)
    }

    fn fixture() -> Fixture {
        let dir = private_dir();
        let network = Uuid::new_v4().to_string();
        let auth = Arc::new(
            AuthStore::open(
                &dir,
                &AuthConfig {
                    network_id: network.clone(),
                    login_ttl: Duration::from_secs(300),
                    session_ttl: Duration::from_secs(3600),
                },
            )
            .unwrap(),
        );
        let devices = Arc::new(DeviceStore::open(&dir).unwrap());
        let store = Arc::new(Store::open(&dir).unwrap());
        let mobile_device = Uuid::new_v4().to_string();
        let host_device = Uuid::new_v4().to_string();
        let other_device = Uuid::new_v4().to_string();
        let mobile_token = issue(&auth, "mobile-owner", &mobile_device);
        let host_token = issue(&auth, "mobile-owner", &host_device);
        let other_token = issue(&auth, "other-owner", &other_device);
        let (_, mobile_key) = claim(&devices, &auth, &mobile_token);
        claim(&devices, &auth, &host_token);
        claim(&devices, &auth, &other_token);
        let router =
            MobileNotificationService::new(auth.clone(), devices.clone(), store.clone(), network)
                .router();
        Fixture {
            _dir: dir,
            auth,
            devices,
            store,
            router,
            mobile_token,
            other_token,
            host_device,
            mobile_key,
        }
    }

    async fn call(
        router: Router,
        token: &str,
        method: &str,
        uri: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::AUTHORIZATION, format!("Bearer {token}"));
        let request = if let Some(body) = body {
            request = request.header(CONTENT_TYPE, "application/json");
            request.body(Body::from(body.to_string())).unwrap()
        } else {
            request.body(Body::empty()).unwrap()
        };
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        assert_eq!(
            response
                .headers()
                .get(header::CACHE_CONTROL)
                .and_then(|value| value.to_str().ok()),
            Some("no-store, max-age=0"),
        );
        let bytes = axum::body::to_bytes(response.into_body(), MAX_BODY_BYTES)
            .await
            .unwrap();
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        (status, value)
    }

    fn authority(auth: &AuthStore, devices: &DeviceStore, token: &str) -> Authority {
        let session = auth.validate_session(token).unwrap();
        let record = devices
            .read_state(&session_context(&session), &session.device_id)
            .unwrap()
            .unwrap();
        Authority::from_validated_service_state(
            record.principal_id,
            record.network_id,
            record.device_id,
            record.identity_binding_id,
            record.key_generation,
        )
        .unwrap()
    }

    fn source_payload(source_event_id: &str, connection_epoch: &str) -> Value {
        json!({
            "version": 1,
            "sourceEventId": source_event_id,
            "connectionEpoch": connection_epoch,
            "agentId": "agent-main",
            "sessionId": "session-private-ref"
        })
    }

    async fn source_challenge(router: Router, token: &str, payload: Value) -> (StatusCode, Value) {
        call(
            router,
            token,
            "POST",
            "/api/mobile-notify/v1/source/challenges",
            Some(payload),
        )
        .await
    }

    async fn source_hint(
        router: Router,
        token: &str,
        challenge_id: &str,
        proof: &str,
    ) -> (StatusCode, Value) {
        call(
            router,
            token,
            "POST",
            "/api/mobile-notify/v1/source/hints",
            Some(json!({"version":1,"challengeId":challenge_id,"proof":proof})),
        )
        .await
    }

    #[tokio::test]
    async fn authenticated_register_redeem_is_scoped_and_never_returns_token() {
        let f = fixture();
        let installation = Uuid::new_v4().to_string();
        let register_body = json!({"version":1,"provider":"fcm","installationId":installation,"token":"test-provider-secret"});
        let (status, registered) = call(
            f.router.clone(),
            &f.mobile_token,
            "POST",
            "/api/mobile-notify/v1/endpoints",
            Some(register_body),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(registered["version"], 1);
        assert!(registered["endpointId"].as_str().is_some());
        assert!(!registered.to_string().contains("test-provider-secret"));

        let host = authority(
            &f.auth,
            &f.devices,
            &issue(&f.auth, "mobile-owner", &f.host_device),
        );
        let target = TargetScope::from_validated_host_session(&host, "agent-A").unwrap();
        let now = unix_seconds().unwrap();
        let event = f
            .store
            .enqueue_hint(
                &host,
                &target,
                &Uuid::new_v4().to_string(),
                &HostHintV1::new(Uuid::new_v4().to_string(), "session-1").unwrap(),
                now,
                600,
            )
            .unwrap();
        let endpoint = registered["endpointId"].as_str().unwrap();
        let path = format!(
            "/api/mobile-notify/v1/endpoints/{endpoint}/events/{}/redeem",
            event.event_id()
        );
        let (denied, _) = call(
            f.router.clone(),
            &f.other_token,
            "POST",
            &path,
            Some(json!({"version":1})),
        )
        .await;
        assert_eq!(denied, StatusCode::UNAUTHORIZED);
        let (status, pointer) = call(
            f.router.clone(),
            &f.mobile_token,
            "POST",
            &path,
            Some(json!({"version":1})),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(pointer["targetDeviceId"], f.host_device);
        assert_eq!(pointer["agentId"], "agent-A");
        assert_eq!(pointer["sessionId"], "session-1");

        let unknown = format!(
            "/api/mobile-notify/v1/endpoints/{endpoint}/events/{}/redeem",
            Uuid::new_v4()
        );
        let (status, _) = call(
            f.router.clone(),
            &f.mobile_token,
            "POST",
            &unknown,
            Some(json!({"version":1})),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        let revoke = format!("/api/mobile-notify/v1/endpoints/{endpoint}");
        let (cross_revoke, _) =
            call(f.router.clone(), &f.other_token, "DELETE", &revoke, None).await;
        assert_eq!(cross_revoke, StatusCode::UNAUTHORIZED);
        let (revoked, _) = call(f.router.clone(), &f.mobile_token, "DELETE", &revoke, None).await;
        assert_eq!(revoked, StatusCode::OK);
        let (retry_revoke, _) =
            call(f.router.clone(), &f.mobile_token, "DELETE", &revoke, None).await;
        assert_eq!(retry_revoke, StatusCode::OK);
        let (after_revoke, _) = call(
            f.router.clone(),
            &f.mobile_token,
            "POST",
            &path,
            Some(json!({"version":1})),
        )
        .await;
        assert_eq!(after_revoke, StatusCode::UNAUTHORIZED);

        let rotated_registration = json!({"version":1,"provider":"fcm","installationId":Uuid::new_v4().to_string(),"token":"second-provider-token"});
        let (status, second) = call(
            f.router.clone(),
            &f.mobile_token,
            "POST",
            "/api/mobile-notify/v1/endpoints",
            Some(rotated_registration),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let another_event = f
            .store
            .enqueue_hint(
                &host,
                &target,
                &Uuid::new_v4().to_string(),
                &HostHintV1::new(Uuid::new_v4().to_string(), "session-2").unwrap(),
                unix_seconds().unwrap(),
                600,
            )
            .unwrap();
        let mobile_session = f.auth.validate_session(&f.mobile_token).unwrap();
        let context = session_context(&mobile_session);
        let current_record = f
            .devices
            .read_state(&context, &context.device_id)
            .unwrap()
            .unwrap();
        let challenge = f
            .devices
            .create_challenge(
                &context,
                myagents_agentnet_device_core::ChallengeOperation::Rotate,
                current_record.key_generation,
                &current_record.key_fingerprint,
            )
            .unwrap();
        let proof = f
            .mobile_key
            .sign_proof(&challenge.challenge_id, &challenge.nonce)
            .unwrap();
        let next_key = DevicePrivateKey::generate().unwrap();
        f.devices
            .rotate_with_proof(
                &context,
                current_record.key_generation,
                &challenge.challenge_id,
                &proof,
                &next_key.csr().unwrap(),
            )
            .unwrap();
        let second_endpoint = second["endpointId"].as_str().unwrap();
        let rotated_path = format!(
            "/api/mobile-notify/v1/endpoints/{second_endpoint}/events/{}/redeem",
            another_event.event_id()
        );
        let (stale_registration, _) = call(
            f.router.clone(),
            &f.mobile_token,
            "POST",
            &rotated_path,
            Some(json!({"version":1})),
        )
        .await;
        assert_eq!(stale_registration, StatusCode::UNAUTHORIZED);
        assert!(second["endpointId"].as_str().is_some());
    }

    #[tokio::test]
    async fn registration_rejects_unconfigured_provider_without_creating_endpoint() {
        let f = fixture();
        let session = f.auth.validate_session(&f.mobile_token).unwrap();
        let router = MobileNotificationService::new(
            f.auth.clone(),
            f.devices.clone(),
            f.store.clone(),
            session.account.network_id,
        )
        .with_provider_allowlist([Provider::Fcm])
        .router();
        let (status, body) = call(
            router,
            &f.mobile_token,
            "POST",
            "/api/mobile-notify/v1/endpoints",
            Some(json!({
                "version":1,
                "provider":"apns-production",
                "installationId":Uuid::new_v4().to_string(),
                "token":"valid-shaped-token"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(body["error"]["code"], "MOBILE_NOTIFY_PROVIDER_UNAVAILABLE");
        let owner = f.auth.validate_session(&f.mobile_token).unwrap();
        assert!(
            f.store
                .endpoint_candidates(&owner.account.principal_id, &owner.account.network_id)
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn revoked_bearer_and_unknown_body_fields_fail_closed() {
        let f = fixture();
        let (status, _) = call(f.router.clone(), &f.mobile_token, "POST", "/api/mobile-notify/v1/endpoints",
            Some(json!({"version":1,"provider":"fcm","installationId":Uuid::new_v4().to_string(),"token":"secret","scope":{"principal":"forged"}}))).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        f.auth.expire_session_for_test(&f.mobile_token).unwrap();
        let (status, body) = call(f.router.clone(), &f.mobile_token, "POST", "/api/mobile-notify/v1/endpoints",
            Some(json!({"version":1,"provider":"fcm","installationId":Uuid::new_v4().to_string(),"token":"secret"}))).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(!body.to_string().contains("secret"));

        let oversized = json!({"version":1,"provider":"fcm","installationId":Uuid::new_v4().to_string(),"token":"x".repeat(MAX_BODY_BYTES)});
        let (status, error) = call(
            f.router.clone(),
            &issue(&f.auth, "extra-owner", &Uuid::new_v4().to_string()),
            "POST",
            "/api/mobile-notify/v1/endpoints",
            Some(oversized),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(error["error"]["code"], "REQUEST_INVALID");
    }

    #[tokio::test]
    async fn source_hint_requires_device_pop_and_survives_store_reopen() {
        let f = fixture();
        let source_event_id = Uuid::new_v4().to_string();
        let epoch = Uuid::new_v4().to_string();
        let payload = source_payload(&source_event_id, &epoch);
        let (status, challenge) =
            source_challenge(f.router.clone(), &f.mobile_token, payload.clone()).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(challenge["version"], 1);
        let challenge_id = challenge["challengeId"].as_str().unwrap();
        let nonce = challenge["nonce"].as_str().unwrap();
        let proof = f.mobile_key.sign_proof(challenge_id, nonce).unwrap();

        let session = f.auth.validate_session(&f.mobile_token).unwrap();
        let reopened = Arc::new(Store::open(f.store.state_dir()).unwrap());
        let recovered_router = MobileNotificationService::new(
            f.auth.clone(),
            f.devices.clone(),
            reopened,
            session.account.network_id,
        )
        .with_provider_allowlist([Provider::Fcm])
        .router();
        let (status, accepted) = source_hint(
            recovered_router.clone(),
            &f.mobile_token,
            challenge_id,
            &proof,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(accepted["version"], 1);
        let event_id = accepted["eventId"].as_str().unwrap();
        assert!(!accepted.to_string().contains(&source_event_id));
        assert!(!accepted.to_string().contains(&epoch));
        assert!(!accepted.to_string().contains("session-private-ref"));

        let (retry_status, retry) =
            source_hint(recovered_router, &f.mobile_token, challenge_id, &proof).await;
        assert_eq!(retry_status, StatusCode::OK);
        assert_eq!(retry["eventId"], event_id);
    }

    #[tokio::test]
    async fn source_scope_nonce_and_closed_pointer_contract_fail_closed() {
        let f = fixture();
        let source_event_id = Uuid::new_v4().to_string();
        let epoch = Uuid::new_v4().to_string();
        let payload = source_payload(&source_event_id, &epoch);
        let (status, challenge) =
            source_challenge(f.router.clone(), &f.mobile_token, payload.clone()).await;
        assert_eq!(status, StatusCode::CREATED);
        let challenge_id = challenge["challengeId"].as_str().unwrap().to_owned();
        let proof = f
            .mobile_key
            .sign_proof(&challenge_id, challenge["nonce"].as_str().unwrap())
            .unwrap();

        let other_account =
            source_hint(f.router.clone(), &f.other_token, &challenge_id, &proof).await;
        assert_eq!(other_account.0, StatusCode::UNAUTHORIZED);
        let host_token = issue(&f.auth, "mobile-owner", &f.host_device);
        let other_device = source_hint(f.router.clone(), &host_token, &challenge_id, &proof).await;
        assert_eq!(other_device.0, StatusCode::UNAUTHORIZED);
        let same_device = f.auth.validate_session(&f.mobile_token).unwrap();
        let second_session = issue(&f.auth, "mobile-owner", &same_device.device_id);
        let other_session =
            source_hint(f.router.clone(), &second_session, &challenge_id, &proof).await;
        assert_eq!(other_session.0, StatusCode::UNAUTHORIZED);

        let wrong_nonce_signature = "A".repeat(86);
        let (status, error) = source_hint(
            f.router.clone(),
            &f.mobile_token,
            &challenge_id,
            &wrong_nonce_signature,
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(
            error["error"]["code"],
            "SOURCE_PROOF_UNCONFIRMED_RETRY_CHALLENGE"
        );
        assert_eq!(
            source_hint(f.router.clone(), &f.mobile_token, &challenge_id, &proof)
                .await
                .0,
            StatusCode::CONFLICT,
            "a consumed bad proof must not later become accepted"
        );

        let (status, challenge) =
            source_challenge(f.router.clone(), &f.mobile_token, payload.clone()).await;
        assert_eq!(status, StatusCode::CREATED);
        let fresh_id = challenge["challengeId"].as_str().unwrap();
        let fresh_proof = f
            .mobile_key
            .sign_proof(fresh_id, challenge["nonce"].as_str().unwrap())
            .unwrap();
        let (status, _) =
            source_hint(f.router.clone(), &f.mobile_token, fresh_id, &fresh_proof).await;
        assert_eq!(status, StatusCode::OK);

        let (status, body) = source_challenge(
            f.router.clone(),
            &f.mobile_token,
            json!({
                "version":1,
                "sourceEventId":Uuid::new_v4().to_string(),
                "connectionEpoch":Uuid::new_v4().to_string(),
                "agentId":"agent-main",
                "sessionId":"session-private-ref",
                "targetDeviceId":"forged"
            }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "REQUEST_INVALID");
    }

    #[tokio::test]
    async fn source_challenge_requires_its_own_operation_and_generation() {
        let f = fixture();
        let session = f.auth.validate_session(&f.mobile_token).unwrap();
        let context = session_context(&session);
        let record = f
            .devices
            .read_state(&context, &session.device_id)
            .unwrap()
            .unwrap();
        let identity_challenge = f
            .devices
            .create_challenge(
                &context,
                ChallengeOperation::RecoverQuery,
                record.key_generation,
                &record.key_fingerprint,
            )
            .unwrap();
        let identity_proof = f
            .mobile_key
            .sign_proof(&identity_challenge.challenge_id, &identity_challenge.nonce)
            .unwrap();
        assert_eq!(
            source_hint(
                f.router.clone(),
                &f.mobile_token,
                &identity_challenge.challenge_id,
                &identity_proof
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );

        let (status, source) = source_challenge(
            f.router.clone(),
            &f.mobile_token,
            source_payload(&Uuid::new_v4().to_string(), &Uuid::new_v4().to_string()),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let source_id = source["challengeId"].as_str().unwrap();
        let source_proof = f
            .mobile_key
            .sign_proof(source_id, source["nonce"].as_str().unwrap())
            .unwrap();
        let rotate = f
            .devices
            .create_challenge(
                &context,
                ChallengeOperation::Rotate,
                record.key_generation,
                &record.key_fingerprint,
            )
            .unwrap();
        let rotate_proof = f
            .mobile_key
            .sign_proof(&rotate.challenge_id, &rotate.nonce)
            .unwrap();
        let new_key = DevicePrivateKey::generate().unwrap();
        f.devices
            .rotate_with_proof(
                &context,
                record.key_generation,
                &rotate.challenge_id,
                &rotate_proof,
                &new_key.csr().unwrap(),
            )
            .unwrap();
        assert_eq!(
            source_hint(f.router.clone(), &f.mobile_token, source_id, &source_proof)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn consumed_without_receipt_needs_fresh_pop_and_deduplicates_event() {
        let f = fixture();
        let source_event_id = Uuid::new_v4().to_string();
        let epoch = Uuid::new_v4().to_string();
        let payload = source_payload(&source_event_id, &epoch);
        let (status, challenge) =
            source_challenge(f.router.clone(), &f.mobile_token, payload.clone()).await;
        assert_eq!(status, StatusCode::CREATED);
        let challenge_id = challenge["challengeId"].as_str().unwrap();
        let proof = f
            .mobile_key
            .sign_proof(challenge_id, challenge["nonce"].as_str().unwrap())
            .unwrap();
        let session = f.auth.validate_session(&f.mobile_token).unwrap();
        let context = session_context(&session);
        let authority = authority(&f.auth, &f.devices, &f.mobile_token);
        f.devices
            .consume_proof(
                &context,
                ChallengeOperation::RecoverQuery,
                1,
                challenge_id,
                &proof,
            )
            .unwrap();
        let target = TargetScope::from_validated_host_session(&authority, "agent-main").unwrap();
        let queued = f
            .store
            .enqueue_hint(
                &authority,
                &target,
                &epoch,
                &HostHintV1::new(&source_event_id, "session-private-ref").unwrap(),
                unix_seconds().unwrap(),
                600,
            )
            .unwrap();
        assert_eq!(
            source_hint(f.router.clone(), &f.mobile_token, challenge_id, &proof)
                .await
                .0,
            StatusCode::CONFLICT
        );
        let (status, fresh) = source_challenge(f.router.clone(), &f.mobile_token, payload).await;
        assert_eq!(status, StatusCode::CREATED);
        let fresh_id = fresh["challengeId"].as_str().unwrap();
        let fresh_proof = f
            .mobile_key
            .sign_proof(fresh_id, fresh["nonce"].as_str().unwrap())
            .unwrap();
        let (status, receipt) =
            source_hint(f.router.clone(), &f.mobile_token, fresh_id, &fresh_proof).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(receipt["eventId"], queued.event_id());
    }

    #[tokio::test]
    async fn source_routes_fail_closed_without_configured_provider() {
        let f = fixture();
        let session = f.auth.validate_session(&f.mobile_token).unwrap();
        let router = MobileNotificationService::new(
            f.auth.clone(),
            f.devices.clone(),
            f.store.clone(),
            session.account.network_id,
        )
        .with_provider_allowlist([])
        .router();
        let (status, body) = source_challenge(
            router,
            &f.mobile_token,
            source_payload(&Uuid::new_v4().to_string(), &Uuid::new_v4().to_string()),
        )
        .await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(body["error"]["code"], "MOBILE_NOTIFY_PROVIDER_UNAVAILABLE");
    }

    #[tokio::test]
    async fn source_challenge_rejects_bearer_without_claimed_device_key() {
        let f = fixture();
        let unclaimed_device = Uuid::new_v4().to_string();
        let token = issue(&f.auth, "mobile-owner", &unclaimed_device);
        let (status, error) = source_challenge(
            f.router.clone(),
            &token,
            source_payload(&Uuid::new_v4().to_string(), &Uuid::new_v4().to_string()),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(error["error"]["code"], "UNAUTHORIZED");
    }

    #[tokio::test]
    async fn rejected_source_rebind_does_not_consume_device_challenge_quota() {
        let f = fixture();
        let source_event_id = Uuid::new_v4().to_string();
        let epoch = Uuid::new_v4().to_string();
        let original = source_payload(&source_event_id, &epoch);
        let (status, _) = source_challenge(f.router.clone(), &f.mobile_token, original).await;
        assert_eq!(status, StatusCode::CREATED);

        for _ in 0..10 {
            let (status, error) = source_challenge(
                f.router.clone(),
                &f.mobile_token,
                source_payload(&source_event_id, &Uuid::new_v4().to_string()),
            )
            .await;
            assert_eq!(status, StatusCode::CONFLICT);
            assert_eq!(error["error"]["code"], "MOBILE_NOTIFY_CONFLICT");
        }

        let (status, _) = source_challenge(
            f.router.clone(),
            &f.mobile_token,
            source_payload(&Uuid::new_v4().to_string(), &Uuid::new_v4().to_string()),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
    }
}
