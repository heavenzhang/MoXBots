//! Opt-in adapter to the existing Dex password connector. No credential store,
//! public OIDC client or alternate principal authority is introduced here.
use super::*;
use std::future::Future;
use tokio::sync::Semaphore;

const WINDOW: Duration = Duration::from_secs(60);
const GLOBAL_ATTEMPTS: u32 = 60;
const ACCOUNT_ATTEMPTS: u32 = 5;
const ACCOUNT_BUCKETS: usize = 1024;

pub(super) struct PasswordLogin {
    enabled: bool,
    slots: Semaphore,
    salt: [u8; 32],
    rates: Mutex<Rates>,
}
struct Rates {
    global: (Instant, u32),
    accounts: HashMap<[u8; 32], (Instant, u32)>,
}
impl PasswordLogin {
    pub(super) fn new(enabled: bool) -> Self {
        Self {
            enabled,
            slots: Semaphore::new(4),
            salt: random(),
            rates: Mutex::new(Rates {
                global: (Instant::now(), 0),
                accounts: HashMap::new(),
            }),
        }
    }
    fn admit(&self, username: &str) -> Result<tokio::sync::SemaphorePermit<'_>, ApiError> {
        if !self.enabled {
            return Err(ApiError::PasswordUnavailable);
        }
        let mut rates = self.rates.lock().map_err(|_| ApiError::Internal)?;
        let now = Instant::now();
        if now.duration_since(rates.global.0) >= WINDOW {
            rates.global = (now, 0);
        }
        // Charge every attempt, independent of account existence and provider result.
        if rates.global.1 >= GLOBAL_ATTEMPTS {
            return Err(ApiError::PasswordRateLimited);
        }
        rates.global.1 += 1;
        rates
            .accounts
            .retain(|_, entry| now.duration_since(entry.0) < WINDOW);
        let mut hash = Sha256::new();
        hash.update(self.salt);
        hash.update(username.trim().to_lowercase().as_bytes());
        let key: [u8; 32] = hash.finalize().into();
        if !rates.accounts.contains_key(&key) && rates.accounts.len() >= ACCOUNT_BUCKETS {
            return Err(ApiError::PasswordRateLimited);
        }
        let entry = rates.accounts.entry(key).or_insert((now, 0));
        if entry.1 >= ACCOUNT_ATTEMPTS {
            return Err(ApiError::PasswordRateLimited);
        }
        entry.1 += 1;
        drop(rates);
        self.slots
            .try_acquire()
            .map_err(|_| ApiError::PasswordRateLimited)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PasswordRequest {
    device_id: String,
    pkce_challenge: String,
    username: Zeroizing<String>,
    password: Zeroizing<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PasswordResponse {
    transaction_id: String,
    expires_at: i64,
}

pub(super) enum PasswordApiError {
    Service(ApiError),
    InvalidBody(StatusCode),
}
impl IntoResponse for PasswordApiError {
    fn into_response(self) -> axum::response::Response {
        let error = match self {
            Self::Service(error) => error,
            Self::InvalidBody(status) => {
                return (
                    status,
                    [(header::CACHE_CONTROL, "no-store")],
                    Json(serde_json::json!({"error":{"code":"invalid_request"}})),
                )
                    .into_response();
            }
        };
        let (status, code) = match error {
            ApiError::CredentialsInvalid => (StatusCode::UNAUTHORIZED, "OWNED_CREDENTIALS_INVALID"),
            ApiError::PasswordUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "OWNED_PASSWORD_LOGIN_UNAVAILABLE",
            ),
            ApiError::PasswordRateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "OWNED_PASSWORD_LOGIN_RATE_LIMITED",
            ),
            other => return other.into_response(),
        };
        (
            status,
            [(header::CACHE_CONTROL, "no-store")],
            Json(serde_json::json!({"error":{"code":code}})),
        )
            .into_response()
    }
}

pub(super) async fn login(
    State(app): State<Arc<App>>,
    req: Result<Json<PasswordRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, Json<PasswordResponse>), PasswordApiError> {
    // Never reflect JSON/extractor diagnostics from a secret-bearing body.
    let Json(req) = req.map_err(|error| PasswordApiError::InvalidBody(error.status()))?;
    let exchange_app = app.clone();
    let keys_app = app.clone();
    login_using(
        app,
        req,
        move |username, password, nonce| async move {
            exchange_password(&exchange_app, &username, &password, &nonce).await
        },
        move || async move {
            let http = keys_app.http.clone();
            let origin = keys_app.origin.clone();
            CoreJsonWebKeySet::fetch_async(keys_app.verification.metadata.jwks_uri(), &move |r| {
                bounded_call(http.clone(), origin.clone(), r)
            })
            .await
            .map_err(|_| ApiError::PasswordUnavailable)
        },
    )
    .await
    .map_err(PasswordApiError::Service)
}

async fn exchange_password(
    app: &App,
    username: &str,
    password: &str,
    nonce: &str,
) -> Result<CoreTokenResponse, ApiError> {
    let request = password_provider_request(app, username, password, nonce)?;
    let response = bounded_call(app.http.clone(), app.origin.clone(), request)
        .await
        .map_err(|_| ApiError::PasswordUnavailable)?;
    let status = response.status();
    let bytes = Zeroizing::new(response.into_body());
    decode_provider_response(status, &bytes)
}

fn password_provider_request(
    app: &App,
    username: &str,
    password: &str,
    nonce: &str,
) -> Result<openidconnect::HttpRequest, ApiError> {
    let endpoint_option = app.verification.metadata.token_endpoint();
    let endpoint = endpoint_option
        .as_ref()
        .ok_or(ApiError::PasswordUnavailable)?;
    // Endpoints and client authentication are operator-controlled, never request inputs.
    let body = Zeroizing::new(
        url::form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "password")
            .append_pair("scope", "openid profile email")
            .append_pair("username", username)
            .append_pair("password", password)
            .append_pair("nonce", nonce)
            .finish(),
    );
    // OAuth client credentials use form encoding before HTTP Basic encoding.
    let encode =
        |value: &str| url::form_urlencoded::byte_serialize(value.as_bytes()).collect::<String>();
    let credentials = Zeroizing::new(format!(
        "{}:{}",
        encode(app.verification.client_id.as_str()),
        encode(app.verification.client_secret.secret())
    ));
    let authorization = Zeroizing::new(format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(credentials.as_bytes())
    ));
    let mut bearer =
        header::HeaderValue::from_str(&authorization).map_err(|_| ApiError::PasswordUnavailable)?;
    bearer.set_sensitive(true);
    openidconnect::http::Request::builder()
        .method("POST")
        .uri(endpoint.as_str())
        .header(header::AUTHORIZATION, bearer)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body.as_bytes().to_vec())
        .map_err(|_| ApiError::PasswordUnavailable)
}

fn decode_provider_response(
    status: StatusCode,
    bytes: &[u8],
) -> Result<CoreTokenResponse, ApiError> {
    if !status.is_success() {
        // Never forward provider descriptions, usernames or tokens. Account absence
        // and a wrong password have exactly the same public response.
        let code = serde_json::from_slice::<serde_json::Value>(bytes)
            .ok()
            .and_then(|v| v.get("error").and_then(|s| s.as_str()).map(str::to_owned));
        return Err(
            if matches!(code.as_deref(), Some("invalid_grant" | "access_denied")) {
                ApiError::CredentialsInvalid
            } else {
                ApiError::PasswordUnavailable
            },
        );
    }
    if status != StatusCode::OK {
        return Err(ApiError::PasswordUnavailable);
    }
    serde_json::from_slice(bytes).map_err(|_| ApiError::PasswordUnavailable)
}

async fn login_using<E, EF, K, KF>(
    app: Arc<App>,
    req: PasswordRequest,
    exchange: E,
    load_keys: K,
) -> Result<(StatusCode, Json<PasswordResponse>), ApiError>
where
    E: FnOnce(Zeroizing<String>, Zeroizing<String>, Zeroizing<String>) -> EF,
    EF: Future<Output = Result<CoreTokenResponse, ApiError>>,
    K: FnOnce() -> KF,
    KF: Future<Output = Result<CoreJsonWebKeySet, ApiError>>,
{
    if !app.password_login.enabled {
        return Err(ApiError::PasswordUnavailable);
    }
    let device = canonical_uuid(&req.device_id).ok_or(ApiError::BadRequest)?;
    if !valid_challenge(&req.pkce_challenge)
        || req.username.is_empty()
        || req.username.len() > 512
        || req.username.contains('\0')
        || req.password.is_empty()
        || req.password.len() > 1024
        || req.password.contains('\0')
    {
        return Err(ApiError::BadRequest);
    }
    let _permit = app.password_login.admit(&req.username)?;
    let now = unix_now().map_err(|_| ApiError::Internal)?;
    {
        let mut all = app.flow.pending.lock().map_err(|_| ApiError::Internal)?;
        all.retain(|_, p| p.expires_at > now);
        if all.len() >= MAX_TRANSACTIONS {
            return Err(ApiError::Busy);
        }
    }
    let nonce = Zeroizing::new(URL_SAFE_NO_PAD.encode(random::<[u8; 32]>()));
    let response = tokio::time::timeout(
        Duration::from_secs(15),
        exchange(req.username, req.password, nonce.clone()),
    )
    .await
    .map_err(|_| ApiError::PasswordUnavailable)??;
    let token = response.id_token().ok_or(ApiError::PasswordUnavailable)?;
    let expected = Nonce::new(nonce.to_string());
    let (keys, generation) = {
        let cache = app
            .verification
            .cache
            .lock()
            .map_err(|_| ApiError::Internal)?;
        (cache.keys.clone(), cache.generation)
    };
    let verifier = app.verification.verifier(keys);
    let subject = match token.claims(&verifier, &expected) {
        Ok(claims) => VerifiedSubject::from_verified_claims(
            claims.issuer().as_str().into(),
            claims.subject().as_str().into(),
        )
        .map_err(|_| ApiError::PasswordUnavailable)?,
        Err(ClaimsVerificationError::SignatureVerification(
            SignatureVerificationError::NoMatchingKey | SignatureVerificationError::CryptoError(_),
        )) => {
            let keys = refresh_keys(&app, generation, load_keys)
                .await
                .map_err(|_| ApiError::PasswordUnavailable)?;
            let verifier = app.verification.verifier(keys);
            let claims = token
                .claims(&verifier, &expected)
                .map_err(|_| ApiError::PasswordUnavailable)?;
            VerifiedSubject::from_verified_claims(
                claims.issuer().as_str().into(),
                claims.subject().as_str().into(),
            )
            .map_err(|_| ApiError::PasswordUnavailable)?
        }
        Err(_) => return Err(ApiError::PasswordUnavailable),
    };
    let now = unix_now().map_err(|_| ApiError::Internal)?;
    let expires_at = now
        .checked_add(app.flow.ttl.as_secs().min(MAX_LOGIN_TRANSACTION_SECONDS) as i64)
        .ok_or(ApiError::Internal)?;
    let transaction_id = Uuid::new_v4().to_string();
    let mut all = app.flow.pending.lock().map_err(|_| ApiError::Internal)?;
    all.retain(|_, p| p.expires_at > now);
    if all.len() >= MAX_TRANSACTIONS {
        return Err(ApiError::Busy);
    }
    all.insert(
        transaction_id.clone(),
        Pending {
            device_id: device,
            client_challenge: req.pkce_challenge,
            provider_verifier: Zeroizing::new(String::new()),
            state: Zeroizing::new(String::new()),
            nonce,
            expires_at,
            phase: Phase::Ready(subject),
            browser_return_path: None,
        },
    );
    Ok((
        StatusCode::OK,
        Json(PasswordResponse {
            transaction_id,
            expires_at,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::super::tests::{signed_response, signing, test_app};
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use tower::ServiceExt;

    const DEVICE: &str = "22222222-2222-4222-8222-222222222222";
    const VERIFIER: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    fn enabled() -> (Arc<App>, tempfile::TempDir) {
        let (mut app, dir) = test_app();
        let owner = Arc::get_mut(&mut app).unwrap();
        owner.password_login = PasswordLogin::new(true);
        owner.verification.cache.lock().unwrap().keys = signing(false).jwks.clone();
        (app, dir)
    }
    fn request(username: &str) -> PasswordRequest {
        PasswordRequest {
            device_id: DEVICE.into(),
            pkce_challenge: URL_SAFE_NO_PAD.encode(Sha256::digest(VERIFIER.as_bytes())),
            username: Zeroizing::new(username.into()),
            password: Zeroizing::new("synthetic-password".into()),
        }
    }
    async fn no_keys() -> Result<CoreJsonWebKeySet, ApiError> {
        panic!("unexpected JWKS fetch")
    }
    async fn success(app: Arc<App>) -> PasswordResponse {
        login_using(
            app,
            request("synthetic@example.test"),
            |username, password, nonce| async move {
                assert_eq!(username.as_str(), "synthetic@example.test");
                assert_eq!(password.as_str(), "synthetic-password");
                assert_eq!(URL_SAFE_NO_PAD.decode(nonce.as_str()).unwrap().len(), 32);
                Ok(signed_response(
                    signing(false),
                    &nonce,
                    "https://dex.example.test",
                    "agentnet-test",
                    unix_now().unwrap() + 300,
                ))
            },
            no_keys,
        )
        .await
        .unwrap()
        .1
        .0
    }
    fn poll_request(tx: &str, verifier: &str) -> PollRequest {
        PollRequest {
            transaction_id: tx.into(),
            device_id: DEVICE.into(),
            pkce_verifier: Zeroizing::new(verifier.into()),
        }
    }
    async fn body(response: axum::response::Response) -> serde_json::Value {
        serde_json::from_slice(&to_bytes(response.into_body(), 8192).await.unwrap()).unwrap()
    }

    #[tokio::test]
    async fn password_ready_uses_original_principal_network_and_one_time_pkce_poll() {
        let (app, _dir) = enabled();
        // Existing browser identity, not a username-derived or new authority.
        let subject = VerifiedSubject::from_verified_claims(
            "https://dex.example.test".into(),
            "isolated-user".into(),
        )
        .unwrap();
        let existing = app.store.issue_session(&subject, DEVICE).unwrap();
        let started = success(app.clone()).await;
        let projection = serde_json::to_value(&started).unwrap();
        assert_eq!(projection.as_object().unwrap().len(), 2);
        assert!(projection.get("accessToken").is_none());
        assert!(projection.get("authorizationUrl").is_none());
        assert!(started.expires_at > unix_now().unwrap());
        assert!(started.expires_at <= unix_now().unwrap() + MAX_LOGIN_TRANSACTION_SECONDS as i64);
        assert!(matches!(
            poll(
                State(app.clone()),
                Json(poll_request(&started.transaction_id, &"z".repeat(43)))
            )
            .await,
            Err(ApiError::Unauthorized)
        ));
        let mut other_device = poll_request(&started.transaction_id, VERIFIER);
        other_device.device_id = uuid::Uuid::new_v4().to_string();
        assert!(matches!(
            poll(State(app.clone()), Json(other_device)).await,
            Err(ApiError::Unauthorized)
        ));
        let reply = poll(
            State(app.clone()),
            Json(poll_request(&started.transaction_id, VERIFIER)),
        )
        .await
        .unwrap();
        assert_eq!(reply.headers()[header::CACHE_CONTROL], "no-store");
        let reply = body(reply).await;
        assert_eq!(reply["principalId"], existing.account.principal_id);
        assert_eq!(reply["networkId"], existing.account.network_id);
        let expiry = reply["expiresAt"].as_i64().unwrap();
        assert!(expiry > unix_now().unwrap() + 3590 && expiry <= unix_now().unwrap() + 3600);
        assert!(
            app.store
                .validate_session(reply["accessToken"].as_str().unwrap())
                .is_ok()
        );
        assert!(matches!(
            poll(
                State(app.clone()),
                Json(poll_request(&started.transaction_id, VERIFIER))
            )
            .await,
            Err(ApiError::BadRequest)
        ));
    }

    #[tokio::test]
    async fn password_ready_supports_original_cancel_and_expiry_without_session_issue() {
        let (app, _dir) = enabled();
        let started = success(app.clone()).await;
        cancel(
            State(app.clone()),
            Json(CancelRequest {
                transaction_id: started.transaction_id.clone(),
                device_id: DEVICE.into(),
                pkce_verifier: Zeroizing::new(VERIFIER.into()),
            }),
        )
        .await
        .unwrap();
        assert!(
            poll(
                State(app.clone()),
                Json(poll_request(&started.transaction_id, VERIFIER))
            )
            .await
            .is_err()
        );
        let started = success(app.clone()).await;
        app.flow
            .pending
            .lock()
            .unwrap()
            .get_mut(&started.transaction_id)
            .unwrap()
            .expires_at = unix_now().unwrap() - 1;
        assert!(
            poll(
                State(app.clone()),
                Json(poll_request(&started.transaction_id, VERIFIER))
            )
            .await
            .is_err()
        );
        assert!(app.flow.pending.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn password_id_token_requires_valid_signature_issuer_audience_nonce_and_expiry() {
        for invalid in [
            "issuer",
            "audience",
            "nonce",
            "expiry",
            "signature",
            "missing",
        ] {
            let (app, _dir) = enabled();
            let result = login_using(
                app.clone(),
                request("synthetic@example.test"),
                |_, _, nonce| async move {
                    if invalid == "missing" {
                        return Ok(serde_json::from_value(
                            serde_json::json!({"access_token":"synthetic","token_type":"Bearer"}),
                        )
                        .unwrap());
                    }
                    Ok(signed_response(
                        signing(invalid == "signature"),
                        if invalid == "nonce" { "wrong" } else { &nonce },
                        if invalid == "issuer" {
                            "https://wrong.example.test"
                        } else {
                            "https://dex.example.test"
                        },
                        if invalid == "audience" {
                            "wrong"
                        } else {
                            "agentnet-test"
                        },
                        if invalid == "expiry" {
                            unix_now().unwrap() - 60
                        } else {
                            unix_now().unwrap() + 300
                        },
                    ))
                },
                || async { Ok(signing(false).jwks.clone()) },
            )
            .await;
            assert!(
                matches!(result, Err(ApiError::PasswordUnavailable)),
                "{invalid}"
            );
            assert!(app.flow.pending.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn password_jwks_rotation_keeps_original_bounded_verifier() {
        let (app, _dir) = enabled();
        let result = login_using(
            app,
            request("synthetic@example.test"),
            |_, _, nonce| async move {
                Ok(signed_response(
                    signing(true),
                    &nonce,
                    "https://dex.example.test",
                    "agentnet-test",
                    unix_now().unwrap() + 300,
                ))
            },
            || async { Ok(signing(true).jwks.clone()) },
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn password_disabled_and_credentials_errors_do_not_enumerate_or_create_transactions() {
        let (app, _dir) = test_app();
        assert!(matches!(
            login_using(
                app,
                request("synthetic@example.test"),
                |_, _, _| async { panic!("disabled provider call") },
                no_keys
            )
            .await,
            Err(ApiError::PasswordUnavailable)
        ));
        let (app, _dir) = enabled();
        for name in ["absent@example.test", "existing@example.test"] {
            let response = login_using(
                app.clone(),
                request(name),
                |_, _, _| async { Err(ApiError::CredentialsInvalid) },
                no_keys,
            )
            .await;
            let error = match response {
                Err(error) => error,
                Ok(_) => panic!("unexpected success"),
            };
            let response = PasswordApiError::Service(error).into_response();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            assert_eq!(
                body(response).await,
                serde_json::json!({"error":{"code":"OWNED_CREDENTIALS_INVALID"}})
            );
        }
        assert!(app.flow.pending.lock().unwrap().is_empty());
    }

    #[test]
    fn password_limits_global_account_and_concurrent_work_without_plain_account_keys() {
        let limiter = PasswordLogin::new(true);
        let permits: Vec<_> = (0..4)
            .map(|i| limiter.admit(&format!("user{i}@example.test")).unwrap())
            .collect();
        assert!(matches!(
            limiter.admit("other@example.test"),
            Err(ApiError::PasswordRateLimited)
        ));
        drop(permits);
        for _ in 0..4 {
            drop(limiter.admit("USER0@example.test").unwrap());
        }
        assert!(matches!(
            limiter.admit(" user0@example.test "),
            Err(ApiError::PasswordRateLimited)
        ));
        for i in 0..60 {
            let _ = limiter.admit(&format!("global{i}"));
        }
        assert!(matches!(
            limiter.admit("fresh"),
            Err(ApiError::PasswordRateLimited)
        ));
        let mut rates = limiter.rates.lock().unwrap();
        rates.global.0 = Instant::now() - WINDOW;
        for entry in rates.accounts.values_mut() {
            entry.0 = Instant::now() - WINDOW;
        }
        drop(rates);
        assert!(limiter.admit("user0@example.test").is_ok());
        assert!(!PasswordLogin::new(false).enabled);
    }

    #[tokio::test]
    async fn password_http_contract_is_closed_bounded_and_never_cacheable() {
        let (app, _dir) = test_app();
        let router = Router::new()
            .route("/auth/login/password", post(login))
            .with_state(app)
            .layer(axum::extract::DefaultBodyLimit::max(MAX_HTTP_BODY))
            .layer(axum::middleware::map_response(no_store));
        for (value, status) in [
            (
                serde_json::json!({"deviceId":DEVICE,"pkceChallenge":"a".repeat(43),"username":"u","password":"p"}),
                StatusCode::SERVICE_UNAVAILABLE,
            ),
            (
                serde_json::json!({"deviceId":DEVICE,"pkceChallenge":"a".repeat(43),"username":"u","password":"p","issuer":"forbidden"}),
                StatusCode::UNPROCESSABLE_ENTITY,
            ),
            (
                serde_json::json!({"password":"x".repeat(8192)}),
                StatusCode::PAYLOAD_TOO_LARGE,
            ),
        ] {
            let response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/auth/login/password")
                        .header(header::CONTENT_TYPE, "application/json")
                        .body(Body::from(value.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            let reply = body(response).await;
            assert_eq!(
                reply,
                if status == StatusCode::SERVICE_UNAVAILABLE {
                    serde_json::json!({"error":{"code":"OWNED_PASSWORD_LOGIN_UNAVAILABLE"}})
                } else {
                    serde_json::json!({"error":{"code":"invalid_request"}})
                }
            );
        }
    }

    #[test]
    fn password_provider_errors_are_closed_and_do_not_forward_descriptions() {
        for code in ["invalid_grant", "access_denied"] {
            let bytes = serde_json::to_vec(&serde_json::json!({"error":code,"error_description":"synthetic private provider description"})).unwrap();
            assert!(matches!(
                decode_provider_response(StatusCode::UNAUTHORIZED, &bytes),
                Err(ApiError::CredentialsInvalid)
            ));
        }
        for code in [
            "unsupported_grant_type",
            "invalid_client",
            "invalid_request",
            "mfa_required",
            "server_error",
        ] {
            let bytes = serde_json::to_vec(&serde_json::json!({"error":code})).unwrap();
            assert!(matches!(
                decode_provider_response(StatusCode::BAD_REQUEST, &bytes),
                Err(ApiError::PasswordUnavailable)
            ));
        }
        assert!(matches!(
            decode_provider_response(StatusCode::OK, b"not-json"),
            Err(ApiError::PasswordUnavailable)
        ));
        assert!(matches!(
            decode_provider_response(StatusCode::CREATED, b"{}"),
            Err(ApiError::PasswordUnavailable)
        ));
    }

    #[test]
    fn password_provider_wire_uses_private_client_and_exact_credentials_nonce_without_offline_scope()
     {
        let (app, _dir) = enabled();
        let req = password_provider_request(
            &app,
            "user+synthetic@example.test",
            " p&+synthetic ",
            "synthetic-nonce",
        )
        .unwrap();
        assert_eq!(req.method(), "POST");
        assert_eq!(req.uri().to_string(), "https://dex.example.test/token");
        let authorization = &req.headers()[header::AUTHORIZATION];
        assert!(authorization.is_sensitive());
        let basic = authorization
            .to_str()
            .unwrap()
            .strip_prefix("Basic ")
            .unwrap();
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(basic)
                .unwrap(),
            b"agentnet-test:unit-test-secret"
        );
        let form: HashMap<_, _> = url::form_urlencoded::parse(req.body())
            .into_owned()
            .collect();
        assert_eq!(form.len(), 5);
        assert_eq!(form["grant_type"], "password");
        assert_eq!(form["scope"], "openid profile email");
        assert_eq!(form["username"], "user+synthetic@example.test");
        assert_eq!(form["password"], " p&+synthetic ");
        assert_eq!(form["nonce"], "synthetic-nonce");
    }

    #[tokio::test]
    async fn password_field_validation_rejects_invalid_input_before_provider_work() {
        let (app, _dir) = enabled();
        for invalid in [
            "device",
            "pkce",
            "username-empty",
            "username-long",
            "password-empty",
            "password-long",
            "password-nul",
        ] {
            let mut req = request("synthetic@example.test");
            match invalid {
                "device" => req.device_id = "not-a-device".into(),
                "pkce" => req.pkce_challenge = "invalid".into(),
                "username-empty" => req.username = Zeroizing::new(String::new()),
                "username-long" => req.username = Zeroizing::new("u".repeat(513)),
                "password-empty" => req.password = Zeroizing::new(String::new()),
                "password-long" => req.password = Zeroizing::new("p".repeat(1025)),
                _ => req.password = Zeroizing::new("p\0p".into()),
            }
            assert!(matches!(
                login_using(
                    app.clone(),
                    req,
                    |_, _, _| async { panic!("invalid provider dispatch") },
                    no_keys
                )
                .await,
                Err(ApiError::BadRequest)
            ));
        }
    }
}
