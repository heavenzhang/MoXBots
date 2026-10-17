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
use myagents_agentnet_device_core::{DeviceRecord, DeviceStore, SessionContext};
use myagents_agentnet_mobile_notify_core::{
    Authority, FreshEndpoint, NotifyError, RegisterEndpointV1, SessionPointer, Store,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
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
        }
    }

    /// Deliberately not mounted into the production server by this change.
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
}
