//! Owned-instance discovery and PKCE HTTP contract. Persistence and attempt
//! generations belong to the Desktop/Headless owners, never to the renderer.
use super::{crypto, NetworkError};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::{header, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use zeroize::{Zeroize, Zeroizing};

const MAX_BODY: usize = 128 * 1024;
pub(crate) const INSTANCE_PATH: &str = "/api/agent-network/instance";

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OwnedInstance {
    pub version: u8,
    pub profile: String,
    pub service_id: String,
    pub environment: String,
    pub network_id: String,
    pub name: String,
    pub issuer: String,
    pub login_issuer: String,
    pub protocol: u8,
    pub capabilities: Vec<String>,
    pub root_certificate: String,
    pub jwks: Value,
}
fn uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value)
        .map(|v| v.to_string())
        .as_deref()
        == Ok(value)
}
impl OwnedInstance {
    pub(crate) fn validate(&self, origin: &str) -> Result<(), NetworkError> {
        let login = url::Url::parse(&self.login_issuer)
            .map_err(|_| NetworkError::new("NETWORK_DESCRIPTOR_INVALID"))?;
        if self.version != 1
            || self.protocol != 1
            || self.profile != "owned-device-relay-v1"
            || self.issuer != origin
            || !uuid(&self.service_id)
            || !uuid(&self.network_id)
            || !["production", "development"].contains(&self.environment.as_str())
            || self.name.is_empty()
            || self.name.len() > 512
            || self.root_certificate.len() > 20_000
            || self.capabilities != ["tls13-mtls"]
            || login.scheme() != "https"
            || login.host_str().is_none()
            || !login.username().is_empty()
            || login.password().is_some()
            || login.query().is_some()
            || login.fragment().is_some()
        {
            return Err(NetworkError::new("NETWORK_DESCRIPTOR_INVALID"));
        }
        crypto::certificate_chain(&self.root_certificate)?;
        super::jwt::checked_jwks(self.jwks.clone())?;
        Ok(())
    }
    pub(crate) fn ensure_same_trust(&self, next: &Self) -> Result<(), NetworkError> {
        let mut expected = self.clone();
        expected.name = next.name.clone();
        if &expected != next {
            return Err(NetworkError::new("NETWORK_TRUST_CHANGED"));
        }
        Ok(())
    }
    pub(crate) fn ensure_bootstrap(&self, root: &str, origin: &str) -> Result<(), NetworkError> {
        if self.root_certificate != root || self.issuer != origin {
            return Err(NetworkError::new("NETWORK_TRUST_CHANGED"));
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OwnedSession {
    pub access_token: String,
    pub expires_at: u64,
    pub principal_id: String,
    pub network_id: String,
}
impl Drop for OwnedSession {
    fn drop(&mut self) {
        self.access_token.zeroize();
    }
}
impl OwnedSession {
    pub(crate) fn validate(&self, instance: &OwnedInstance) -> Result<(), NetworkError> {
        let now = jsonwebtoken::get_current_timestamp();
        if !uuid(&self.principal_id)
            || self.network_id != instance.network_id
            || self.access_token.len() != 43
            || !self
                .access_token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            || self.expires_at <= now
            || self.expires_at > now.saturating_add(31_536_000)
        {
            return Err(NetworkError::new("OWNED_SESSION_INVALID"));
        }
        Ok(())
    }
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OwnedLoginStart {
    pub transaction_id: String,
    pub expires_at: u64,
    pub authorization_url: String,
}
pub(crate) enum OwnedPoll {
    Pending,
    Authenticated(OwnedSession),
}

#[derive(Clone)]
pub(crate) struct OwnedClient {
    origin: String,
    http: reqwest::Client,
    instance: OwnedInstance,
}
fn client(public_ca: Option<&str>) -> Result<reqwest::Client, NetworkError> {
    #[allow(clippy::disallowed_methods)]
    let builder = reqwest::Client::builder()
        .https_only(true)
        .http1_only()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .tls_backend_preconfigured(crypto::external_tls_config_with_ca(public_ca)?);
    crate::proxy_config::build_client_with_proxy(builder)
        .map_err(|_| NetworkError::new("NETWORK_PROXY_INVALID"))
}
pub(crate) async fn raw_request(
    http: &reqwest::Client,
    origin: &str,
    method: Method,
    path: &str,
    body: Option<Value>,
    token: Option<&str>,
) -> Result<(StatusCode, Value), NetworkError> {
    raw_request_with_limits(
        http,
        origin,
        method,
        path,
        body,
        token,
        16 * 1024,
        MAX_BODY,
        false,
    )
    .await
}
async fn raw_request_with_limits(
    http: &reqwest::Client,
    origin: &str,
    method: Method,
    path: &str,
    body: Option<Value>,
    token: Option<&str>,
    request_limit: usize,
    response_limit: usize,
    allow_start_rejection: bool,
) -> Result<(StatusCode, Value), NetworkError> {
    let optional_start = allow_start_rejection
        && method == Method::POST
        && path == "/auth/login/start"
        && token.is_none();
    // Only callers with fixed, reviewed routes use this private HTTP seam.
    let diagnostic =
        crate::network_diagnostics::RequestDiagnostic::new("owned-account", &method, path);
    let mut request = http.request(method, format!("{origin}{path}"));
    if let Some(body) = body {
        let bytes = Zeroizing::new(
            serde_json::to_vec(&body).map_err(|_| NetworkError::new("OWNED_REQUEST_INVALID"))?,
        );
        if bytes.len() > request_limit {
            return Err(NetworkError::new("OWNED_REQUEST_INVALID"));
        }
        request = request
            .header(header::CONTENT_TYPE, "application/json")
            .body(bytes.to_vec());
    }
    if let Some(token) = token {
        let mut bearer = header::HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| NetworkError::new("OWNED_SESSION_INVALID"))?;
        bearer.set_sensitive(true);
        request = request.header(header::AUTHORIZATION, bearer);
    }
    let mut response = diagnostic
        .send(request)
        .await
        .map_err(|_| NetworkError::cloud("OWNED_ACCOUNT_UNAVAILABLE", 503))?;
    let status = response.status();
    // Axum's old JSON extractor can reject the new option with plain-text 422
    // and no cache header. Read no error body and expose only this closed pair
    // of rejection statuses; all successful/authenticated responses remain strict.
    if optional_start
        && matches!(
            status,
            StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY
        )
    {
        return Ok((status, Value::Null));
    }
    if !response
        .headers()
        .get(header::CACHE_CONTROL)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(',')
                .any(|v| v.trim().eq_ignore_ascii_case("no-store"))
        })
    {
        return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
    }
    let mut bytes = Zeroizing::new(Vec::new());
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| NetworkError::cloud("OWNED_ACCOUNT_UNAVAILABLE", 503))?
    {
        if bytes.len().saturating_add(chunk.len()) > response_limit {
            return Err(NetworkError::new("OWNED_RESPONSE_TOO_LARGE"));
        }
        bytes.extend_from_slice(&chunk);
    }
    let value = if status == StatusCode::NO_CONTENT && bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).map_err(|_| NetworkError::new("OWNED_RESPONSE_INVALID"))?
    };
    if !status.is_success() {
        return Err(NetworkError::cloud(
            value["error"]["code"]
                .as_str()
                .unwrap_or("OWNED_ACCOUNT_UNAVAILABLE"),
            status.as_u16(),
        ));
    }
    Ok((status, value))
}
impl OwnedClient {
    pub(crate) fn pinned(
        instance: OwnedInstance,
        public_ca: Option<&str>,
    ) -> Result<Self, NetworkError> {
        let origin = super::account::origin(&instance.issuer)?;
        instance.validate(&origin)?;
        Ok(Self {
            origin,
            http: client(public_ca)?,
            instance,
        })
    }
    pub(crate) async fn discover(
        origin: &str,
        public_ca: Option<&str>,
    ) -> Result<(Self, OwnedInstance), NetworkError> {
        let origin = super::account::origin(origin)?;
        let http = client(public_ca)?;
        let (status, value) =
            raw_request(&http, &origin, Method::GET, INSTANCE_PATH, None, None).await?;
        if status != StatusCode::OK {
            return Err(NetworkError::new("NETWORK_DESCRIPTOR_INVALID"));
        }
        let instance: OwnedInstance = serde_json::from_value(value)
            .map_err(|_| NetworkError::new("NETWORK_DESCRIPTOR_INVALID"))?;
        instance.validate(&origin)?;
        Ok((
            Self {
                origin,
                http,
                instance: instance.clone(),
            },
            instance,
        ))
    }
    pub(crate) async fn public_instance(&self) -> Result<OwnedInstance, NetworkError> {
        let (status, value) = raw_request(
            &self.http,
            &self.origin,
            Method::GET,
            INSTANCE_PATH,
            None,
            None,
        )
        .await?;
        if status != StatusCode::OK {
            return Err(NetworkError::new("NETWORK_DESCRIPTOR_INVALID"));
        }
        let next: OwnedInstance = serde_json::from_value(value)
            .map_err(|_| NetworkError::new("NETWORK_DESCRIPTOR_INVALID"))?;
        next.validate(&self.origin)?;
        self.instance.ensure_same_trust(&next)?;
        Ok(next)
    }
    pub(crate) async fn start(
        &self,
        device_id: &str,
        challenge: &str,
    ) -> Result<OwnedLoginStart, NetworkError> {
        self.start_with_return(device_id, challenge, false).await
    }
    pub(crate) async fn start_desktop(
        &self,
        device_id: &str,
        challenge: &str,
    ) -> Result<OwnedLoginStart, NetworkError> {
        self.start_with_return(device_id, challenge, true).await
    }
    async fn start_with_return(
        &self,
        device_id: &str,
        challenge: &str,
        desktop: bool,
    ) -> Result<OwnedLoginStart, NetworkError> {
        if !uuid(device_id)
            || challenge.len() != 43
            || URL_SAFE_NO_PAD.decode(challenge).map(|v| v.len()).ok() != Some(32)
        {
            return Err(NetworkError::new("OWNED_LOGIN_INVALID"));
        }
        let mut body = json!({"deviceId":device_id,"pkceChallenge":challenge});
        if desktop {
            body["browserReturn"] = json!(true);
            body["browserReturnPath"] = json!("/desktop");
        }
        let (mut status, mut value) = raw_request_with_limits(
            &self.http,
            &self.origin,
            Method::POST,
            "/auth/login/start",
            Some(body),
            None,
            16 * 1024,
            MAX_BODY,
            desktop,
        )
        .await?;
        // Older services reject the optional return path before creating a
        // transaction. Preserve their existing polling login during rollout.
        if desktop
            && matches!(
                status,
                StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY
            )
        {
            (status, value) = raw_request(
                &self.http,
                &self.origin,
                Method::POST,
                "/auth/login/start",
                Some(json!({"deviceId":device_id,"pkceChallenge":challenge})),
                None,
            )
            .await?;
        }
        if status != StatusCode::OK {
            return Err(NetworkError::new("OWNED_LOGIN_INVALID"));
        }
        let started: OwnedLoginStart =
            serde_json::from_value(value).map_err(|_| NetworkError::new("OWNED_LOGIN_INVALID"))?;
        let now = jsonwebtoken::get_current_timestamp();
        let authorization = url::Url::parse(&started.authorization_url)
            .map_err(|_| NetworkError::new("OWNED_LOGIN_INVALID"))?;
        let issuer = url::Url::parse(&self.instance.login_issuer)
            .map_err(|_| NetworkError::new("OWNED_LOGIN_INVALID"))?;
        if !uuid(&started.transaction_id)
            || started.expires_at <= now
            || started.expires_at > now.saturating_add(300)
            || authorization.origin() != issuer.origin()
            || authorization.scheme() != "https"
            || !authorization.username().is_empty()
            || authorization.password().is_some()
            || authorization.fragment().is_some()
            || started.authorization_url.len() > 8192
        {
            return Err(NetworkError::new("OWNED_LOGIN_INVALID"));
        }
        Ok(started)
    }
    pub(crate) async fn poll(
        &self,
        device: &str,
        transaction: &str,
        verifier: &str,
    ) -> Result<OwnedPoll, NetworkError> {
        let body = login_proof(device, transaction, verifier)?;
        let (status, value) = raw_request(
            &self.http,
            &self.origin,
            Method::POST,
            "/auth/login/poll",
            Some(body),
            None,
        )
        .await?;
        if status == StatusCode::ACCEPTED && value == json!({"status":"pending"}) {
            return Ok(OwnedPoll::Pending);
        }
        if status != StatusCode::OK {
            return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
        }
        let session: OwnedSession = serde_json::from_value(value)
            .map_err(|_| NetworkError::new("OWNED_SESSION_INVALID"))?;
        session.validate(&self.instance)?;
        self.validate_session(device, &session).await?;
        Ok(OwnedPoll::Authenticated(session))
    }
    pub(crate) async fn cancel(
        &self,
        device: &str,
        transaction: &str,
        verifier: &str,
    ) -> Result<(), NetworkError> {
        let body = login_proof(device, transaction, verifier)?;
        let (status, _) = raw_request(
            &self.http,
            &self.origin,
            Method::DELETE,
            "/auth/login/cancel",
            Some(body),
            None,
        )
        .await?;
        if status != StatusCode::NO_CONTENT {
            return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
        }
        Ok(())
    }
    pub(crate) async fn logout(&self, token: &str) -> Result<(), NetworkError> {
        let (status, _) = raw_request(
            &self.http,
            &self.origin,
            Method::DELETE,
            "/auth/session",
            None,
            Some(token),
        )
        .await?;
        if status != StatusCode::NO_CONTENT {
            return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
        }
        Ok(())
    }
    pub(crate) async fn validate_session(
        &self,
        device: &str,
        session: &OwnedSession,
    ) -> Result<(), NetworkError> {
        session.validate(&self.instance)?;
        let (status, value) = raw_request(
            &self.http,
            &self.origin,
            Method::GET,
            "/auth/session",
            None,
            Some(&session.access_token),
        )
        .await?;
        if status != StatusCode::OK
            || value
                != json!({"principalId":session.principal_id,
            "networkId":session.network_id,"deviceId":device,"expiresAt":session.expires_at})
        {
            return Err(NetworkError::new("OWNED_SESSION_INVALID"));
        }
        Ok(())
    }
    pub(crate) async fn community_request(
        &self,
        request: &super::community::CommunityRequest,
        token: &str,
    ) -> Result<Value, NetworkError> {
        let (method, path, body) = request.route()?;
        // Community lists/details contain full user text. Keep identity limits
        // unchanged while allowing the server's bounded 100 topics/200 replies.
        let (status, value) = raw_request_with_limits(
            &self.http,
            &self.origin,
            method,
            &path,
            body,
            Some(token),
            64 * 1024,
            16 * 1024 * 1024,
            false,
        )
        .await?;
        if status != StatusCode::OK {
            return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
        }
        request.response(value)
    }
    pub(crate) async fn feedback_request(
        &self,
        request: &super::feedback::FeedbackRequest,
        token: &str,
    ) -> Result<Value, NetworkError> {
        let (method, path, body) = request.route()?;
        let (status, value) = raw_request_with_limits(
            &self.http,
            &self.origin,
            method,
            &path,
            body,
            Some(token),
            64 * 1024,
            1024 * 1024,
            false,
        )
        .await?;
        if status != StatusCode::OK {
            return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
        }
        request.response(value)
    }
    pub(crate) async fn identity_request(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
        token: &str,
    ) -> Result<Value, NetworkError> {
        let (status, value) =
            raw_request(&self.http, &self.origin, method, path, body, Some(token)).await?;
        if status != StatusCode::OK {
            return Err(NetworkError::new("OWNED_RESPONSE_INVALID"));
        }
        Ok(value)
    }
}
fn login_proof(device: &str, transaction: &str, verifier: &str) -> Result<Value, NetworkError> {
    if !uuid(device)
        || !uuid(transaction)
        || !(43..=128).contains(&verifier.len())
        || !verifier
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-._~".contains(&b))
    {
        return Err(NetworkError::new("OWNED_LOGIN_INVALID"));
    }
    Ok(json!({"deviceId":device,"transactionId":transaction,"pkceVerifier":verifier}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn desktop_start_uses_opt_in_and_only_retries_explicit_old_service_rejections() {
        use std::sync::{Arc, Mutex};
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for rejected in [None, Some(400), Some(422), Some(503)] {
            let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
            let captured = seen.clone();
            let transaction = uuid::Uuid::new_v4().to_string();
            let expected_transaction = transaction.clone();
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let origin = format!("http://{}", listener.local_addr().unwrap());
            let server = tokio::spawn(async move {
                loop {
                    let (mut stream, _) = listener.accept().await.unwrap();
                    let mut bytes = Vec::new();
                    let (header_end, size) = loop {
                        let mut chunk = [0u8; 2048];
                        let read = stream.read(&mut chunk).await.unwrap();
                        assert!(read > 0 && bytes.len() + read <= 8192);
                        bytes.extend_from_slice(&chunk[..read]);
                        if let Some(pos) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                            let headers = std::str::from_utf8(&bytes[..pos]).unwrap();
                            let size = headers
                                .lines()
                                .find_map(|line| {
                                    let (key, value) = line.split_once(':')?;
                                    key.eq_ignore_ascii_case("content-length")
                                        .then(|| value.trim().parse::<usize>().unwrap())
                                })
                                .unwrap();
                            if bytes.len() >= pos + 4 + size {
                                break (pos + 4, size);
                            }
                        }
                    };
                    let body: Value =
                        serde_json::from_slice(&bytes[header_end..header_end + size]).unwrap();
                    let first = {
                        let mut seen = captured.lock().unwrap();
                        seen.push(body);
                        seen.len() == 1
                    };
                    let (status, headers, body) = if first && rejected.is_some() {
                        // Old extractor: plain text and no cache header.
                        (rejected.unwrap(), "", "request rejected".to_owned())
                    } else {
                        (200, "Cache-Control: no-store\r\nContent-Type: application/json\r\n", json!({
                            "transactionId": transaction,
                            "authorizationUrl": "https://login.example.test/dex/auth?state=fixture",
                            "expiresAt": jsonwebtoken::get_current_timestamp() + 120,
                        }).to_string())
                    };
                    let response = format!("HTTP/1.1 {status} Response\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                    stream.write_all(response.as_bytes()).await.unwrap();
                }
            });
            // Test-only HTTP loopback. Production keeps pinned HTTPS/no redirects.
            #[allow(clippy::disallowed_methods)]
            let http = reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(3))
                .retry(reqwest::retry::never())
                .build()
                .unwrap();
            let client = OwnedClient {
                origin,
                http,
                instance: instance(),
            };
            let challenge = URL_SAFE_NO_PAD.encode([1u8; 32]);
            let result = client
                .start_desktop(&uuid::Uuid::new_v4().to_string(), &challenge)
                .await;
            if rejected == Some(503) {
                assert!(result.is_err());
            } else {
                assert_eq!(result.unwrap().transaction_id, expected_transaction);
            }
            let seen = seen.lock().unwrap();
            assert_eq!(seen[0]["browserReturnPath"], "/desktop");
            assert_eq!(
                seen.len(),
                if matches!(rejected, Some(400 | 422)) {
                    2
                } else {
                    1
                }
            );
            if seen.len() == 2 {
                assert!(seen[1].get("browserReturn").is_none());
                assert_eq!(seen[0]["deviceId"], seen[1]["deviceId"]);
                assert_eq!(seen[0]["pkceChallenge"], seen[1]["pkceChallenge"]);
            }
            server.abort();
        }
    }
    fn instance() -> OwnedInstance {
        let mut jwk = crypto::DevicePrivateKey::generate()
            .unwrap()
            .public_jwk()
            .unwrap();
        jwk["kid"] = json!("owned-test");
        jwk["alg"] = json!("ES256");
        jwk["use"] = json!("sig");
        OwnedInstance {
            version: 1,
            profile: "owned-device-relay-v1".into(),
            service_id: uuid::Uuid::new_v4().to_string(),
            environment: "development".into(),
            network_id: uuid::Uuid::new_v4().to_string(),
            name: "Owned test".into(),
            issuer: "https://owned.example.test".into(),
            login_issuer: "https://login.example.test/dex".into(),
            protocol: 1,
            capabilities: vec!["tls13-mtls".into()],
            root_certificate: crypto::tests::Fixture::new().ca.pem(),
            jwks: json!({"keys":[jwk]}),
        }
    }
    #[test]
    fn discovery_cannot_grant_principal_or_unimplemented_agent_capabilities() {
        let d = instance();
        d.validate(&d.issuer).unwrap();
        let mut raw = serde_json::to_value(&d).unwrap();
        raw["principalId"] = json!(uuid::Uuid::new_v4().to_string());
        assert!(serde_json::from_value::<OwnedInstance>(raw).is_err());
        let mut unimplemented = d.clone();
        unimplemented.capabilities.push("permit-v1".into());
        assert!(unimplemented.validate(&unimplemented.issuer).is_err());
        let mut changed = d.clone();
        changed.login_issuer = "https://other.example.test".into();
        assert!(d.ensure_same_trust(&changed).is_err());
        let mut rename = d.clone();
        rename.name = "Renamed".into();
        d.ensure_same_trust(&rename).unwrap();
        assert!(d
            .ensure_bootstrap(&d.root_certificate, "https://foreign.example.test")
            .is_err());
    }
    #[test]
    fn session_rejects_wrong_network_expiry_jwt_and_noncanonical_principal() {
        let d = instance();
        let session = OwnedSession {
            access_token: "a".repeat(43),
            expires_at: jsonwebtoken::get_current_timestamp() + 60,
            principal_id: uuid::Uuid::new_v4().to_string(),
            network_id: d.network_id.clone(),
        };
        session.validate(&d).unwrap();
        for field in ["networkId", "expiresAt", "accessToken", "principalId"] {
            let mut value = serde_json::to_value(&session).unwrap();
            value[field] = match field {
                "expiresAt" => json!(1),
                "accessToken" => json!("jwt.bearer.fake"),
                _ => json!("foreign"),
            };
            let bad: OwnedSession = serde_json::from_value(value).unwrap();
            assert!(bad.validate(&d).is_err());
        }
        assert!(login_proof(
            &session.principal_id,
            &uuid::Uuid::new_v4().to_string(),
            "secret"
        )
        .is_err());
        assert!(crypto::external_tls_config_with_ca(Some("untrusted non-certificate")).is_err());
    }
}
