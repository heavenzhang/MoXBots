//! Synthetic native-store and loopback regressions. Successful cold recovery
//! additionally requires full-chain acceptance with an enrolled device proof.
use super::*;
use crate::ffi::{
    tests::{callbacks, Memory},
    MoxConnectionStore,
};
use crate::{CryptoError, DevicePrivateKey, KeyScope};
use std::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct FaultStore {
    callbacks: MoxConnectionStore,
    fail_account_write: AtomicBool,
    fail_pending_remove: AtomicBool,
}
impl IdentityStore for FaultStore {
    fn load(&self, scope: &KeyScope) -> Result<DevicePrivateKey, CryptoError> {
        self.callbacks.load(scope)
    }
    fn save_pending(&self, scope: &KeyScope, key: &DevicePrivateKey) -> Result<(), CryptoError> {
        self.callbacks.save_pending(scope, key)
    }
    fn delete(&self, scope: &KeyScope) -> Result<(), CryptoError> {
        self.callbacks.delete(scope)
    }
}
impl SecureStore for FaultStore {
    fn read_record(&self, scope: &str, record: &str) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        self.callbacks.read_record(scope, record)
    }
    fn write_record(&self, scope: &str, record: &str, bytes: &[u8]) -> Result<(), String> {
        if record == "account" && self.fail_account_write.load(Ordering::Acquire) {
            return Err("synthetic account write failure".into());
        }
        self.callbacks.write_record(scope, record, bytes)
    }
    fn remove_record(&self, scope: &str, record: &str) -> Result<(), String> {
        if record == PENDING && self.fail_pending_remove.load(Ordering::Acquire) {
            return Err("synthetic pending removal failure".into());
        }
        self.callbacks.remove_record(scope, record)
    }
}
struct Fixture {
    owner: MobileConnection,
    store: Arc<FaultStore>,
    // Keep the OS callback context alive until owner/store have been dropped.
    memory: Box<Memory>,
}
impl Fixture {
    fn new() -> Self {
        let memory = Box::<Memory>::default();
        let store = Arc::new(FaultStore {
            callbacks: callbacks(&memory),
            fail_account_write: AtomicBool::new(false),
            fail_pending_remove: AtomicBool::new(false),
        });
        let mut owner = super::super::tests::snapshot_owner();
        owner.store = store.clone();
        let fixture = crate::agent_network::crypto::tests::Fixture::new();
        let mut jwk = DevicePrivateKey::generate().unwrap().public_jwk().unwrap();
        jwk["kid"] = json!("renewal-test");
        jwk["alg"] = json!("ES256");
        jwk["use"] = json!("sig");
        let saved = owner.saved.as_mut().unwrap();
        saved.instance.root_certificate = fixture.ca.pem();
        saved.instance.jwks = json!({"keys":[jwk]});
        saved.session.expires_at = jsonwebtoken::get_current_timestamp() + 30 * 86400;
        saved.instance.validate(&owner.config.issuer).unwrap();
        let fixture = Self {
            owner,
            store,
            memory,
        };
        fixture.persist_account();
        fixture
    }
    fn persist_account(&self) {
        self.owner
            .write_checked(
                "account",
                &serde_json::to_vec(self.owner.saved.as_ref().unwrap()).unwrap(),
            )
            .unwrap();
    }
    fn record(&self, name: &str) -> Option<Zeroizing<Vec<u8>>> {
        self.store
            .read_record(&self.owner.config.issuer, name)
            .unwrap()
    }
    fn pending(&self) -> Renewal {
        Renewal {
            original: clone_account(self.owner.saved.as_ref().unwrap()),
            candidate: URL_SAFE_NO_PAD.encode([23_u8; 32]),
            session_handle: uuid::Uuid::new_v4().to_string(),
            key_generation: 1,
            key_fingerprint: DevicePrivateKey::generate()
                .unwrap()
                .public_fingerprint()
                .unwrap(),
        }
    }
    fn stage(&self, pending: &Renewal) {
        self.owner
            .write_checked(PENDING, &serde_json::to_vec(pending).unwrap())
            .unwrap();
    }
    fn clock(&self, checked_at: u64) {
        let clock = Clock {
            account_hash: account_hash(self.owner.saved.as_ref().unwrap()).unwrap(),
            checked_at,
        };
        self.owner
            .write_checked(CLOCK, &serde_json::to_vec(&clock).unwrap())
            .unwrap();
    }
    fn pin(&mut self, server: &Server) {
        self.owner.config.issuer = server.origin.clone();
        self.owner.config.public_tls_ca = Some(server.ca.clone());
        let saved = self.owner.saved.as_mut().unwrap();
        saved.instance.issuer = server.origin.clone();
        saved.instance.validate(&server.origin).unwrap();
        self.owner.client =
            Some(OwnedClient::pinned(saved.instance.clone(), Some(&server.ca)).unwrap());
        self.persist_account();
    }
}
fn clone_account(saved: &SavedAccount) -> SavedAccount {
    SavedAccount {
        device_id: saved.device_id.clone(),
        instance: saved.instance.clone(),
        session: saved.session.clone(),
    }
}
fn renewed(pending: &Renewal) -> OwnedSession {
    OwnedSession {
        access_token: pending.candidate.clone(),
        expires_at: pending.original.session.expires_at + 3600,
        principal_id: pending.original.session.principal_id.clone(),
        network_id: pending.original.session.network_id.clone(),
    }
}

struct Reply {
    status: u16,
    body: String,
    dynamic: Option<Arc<Mutex<Value>>>,
    stall: bool,
    expected_bearer: Option<String>,
}
impl Reply {
    fn json(status: u16, value: Value) -> Self {
        Self {
            status,
            body: value.to_string(),
            dynamic: None,
            stall: false,
            expected_bearer: None,
        }
    }
    fn dynamic(value: Arc<Mutex<Value>>) -> Self {
        Self {
            status: 200,
            body: String::new(),
            dynamic: Some(value),
            stall: false,
            expected_bearer: None,
        }
    }
    fn stalled_inspection(token: &str) -> Self {
        Self {
            status: 200,
            body: String::new(),
            dynamic: None,
            stall: true,
            expected_bearer: Some(token.to_owned()),
        }
    }
    fn logged_out(token: &str) -> Self {
        Self {
            status: 204,
            body: String::new(),
            dynamic: None,
            stall: false,
            expected_bearer: Some(token.to_owned()),
        }
    }
}
struct Server {
    origin: String,
    ca: String,
    seen: Arc<Mutex<Vec<(String, String)>>>,
    task: tokio::task::JoinHandle<Result<(), &'static str>>,
}
impl Server {
    async fn start(replies: Vec<Reply>) -> Self {
        let leaf = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
        let config = rustls::ServerConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(
            vec![leaf.cert.der().clone()],
            rustls::pki_types::PrivatePkcs8KeyDer::from(leaf.signing_key.serialize_der()).into(),
        )
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!(
            "https://localhost:{}",
            listener.local_addr().unwrap().port()
        );
        let ca = leaf.cert.pem();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let capture = seen.clone();
        let task = tokio::spawn(async move {
            let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
            // Keep intentionally unanswered requests open while accepting the
            // post-timeout DELETE on a separate connection.
            let mut stalled_streams = Vec::new();
            for reply in replies {
                let (stream, _) = tokio::time::timeout(Duration::from_secs(5), listener.accept())
                    .await
                    .map_err(|_| "TCP timeout")?
                    .map_err(|_| "TCP accept")?;
                let mut stream = acceptor.accept(stream).await.map_err(|_| "TLS accept")?;
                let mut bytes = Vec::new();
                loop {
                    let mut chunk = [0_u8; 2048];
                    let n = stream.read(&mut chunk).await.map_err(|_| "HTTP read")?;
                    if n == 0 || bytes.len() + n > 16384 {
                        return Err("HTTP input bound");
                    }
                    bytes.extend_from_slice(&chunk[..n]);
                    if bytes.windows(4).any(|value| value == b"\r\n\r\n") {
                        break;
                    }
                }
                let header = std::str::from_utf8(&bytes).map_err(|_| "HTTP header")?;
                let mut fields = header
                    .lines()
                    .next()
                    .ok_or("request line")?
                    .split_whitespace();
                let method = fields.next().ok_or("method")?.to_owned();
                let path = fields.next().ok_or("path")?.to_owned();
                if let Some(token) = &reply.expected_bearer {
                    if !header.lines().any(|line| {
                        line.eq_ignore_ascii_case(&format!("authorization: Bearer {token}"))
                    }) {
                        return Err("unexpected synthetic bearer");
                    }
                }
                capture.lock().map_err(|_| "capture")?.push((method, path));
                if reply.stall {
                    stalled_streams.push(stream);
                    continue;
                }
                let body = if let Some(value) = reply.dynamic {
                    value.lock().map_err(|_| "dynamic response")?.to_string()
                } else {
                    reply.body
                };
                let response = format!("HTTP/1.1 {} Fixture\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", reply.status, body.len(), body);
                stream
                    .write_all(response.as_bytes())
                    .await
                    .map_err(|_| "HTTP response")?;
            }
            Ok(())
        });
        Self {
            origin,
            ca,
            seen,
            task,
        }
    }
    async fn finish(mut self) {
        let result = tokio::time::timeout(Duration::from_secs(6), &mut self.task).await;
        if result.is_err() {
            self.task.abort();
            let _ = self.task.await;
            panic!("renewal fixture deadline");
        }
        result.unwrap().unwrap().unwrap();
    }
}

#[test]
fn check_clock_honors_six_hours_future_time_and_near_expiry() {
    let mut f = Fixture::new();
    let now = jsonwebtoken::get_current_timestamp();
    assert!(f.owner.renewal_due().unwrap());
    f.clock(now);
    assert!(!f.owner.renewal_due().unwrap());
    f.clock(now - CHECK_INTERVAL - 1);
    assert!(f.owner.renewal_due().unwrap());
    f.clock(now + 60);
    assert!(f.owner.renewal_due().unwrap());
    f.clock(now);
    f.owner.saved.as_mut().unwrap().session.expires_at = now + CHECK_INTERVAL - 60;
    assert!(f.owner.renewal_due().unwrap());
    f.owner.saved.as_mut().unwrap().session.expires_at = now - 1;
    assert!(!f.owner.renewal_due().unwrap());
}

#[test]
fn pending_or_account_change_overrides_a_recent_clock() {
    let mut f = Fixture::new();
    f.clock(jsonwebtoken::get_current_timestamp());
    assert!(!f.owner.renewal_due().unwrap());
    let pending = f.pending();
    f.stage(&pending);
    assert!(f.owner.renewal_due().unwrap());
    f.store
        .remove_record(&f.owner.config.issuer, PENDING)
        .unwrap();
    f.owner.saved.as_mut().unwrap().session.access_token = URL_SAFE_NO_PAD.encode([24_u8; 32]);
    assert!(f.owner.renewal_due().unwrap());
}

#[test]
fn wrong_scope_or_candidate_is_rejected_before_publishing() {
    for invalid in ["device", "trust", "candidate", "handle"] {
        let mut f = Fixture::new();
        let mut pending = f.pending();
        match invalid {
            "device" => pending.original.device_id = uuid::Uuid::new_v4().to_string(),
            "trust" => pending.original.instance.service_id = uuid::Uuid::new_v4().to_string(),
            "candidate" => pending.candidate = "invalid".into(),
            _ => pending.session_handle = "not-a-session".into(),
        }
        f.stage(&pending);
        let before = f.record("account").unwrap();
        assert!(
            f.owner.finish_renewal(&pending, renewed(&pending)).is_err(),
            "{invalid}"
        );
        assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
        assert!(f.record(PENDING).is_some());
    }
}

#[test]
fn foreign_or_regressed_renewal_result_preserves_original_and_pending() {
    for invalid in ["principal", "network", "candidate", "expiry"] {
        let mut f = Fixture::new();
        let pending = f.pending();
        f.stage(&pending);
        let mut result = renewed(&pending);
        match invalid {
            "principal" => result.principal_id = uuid::Uuid::new_v4().to_string(),
            "network" => result.network_id = uuid::Uuid::new_v4().to_string(),
            "candidate" => result.access_token = URL_SAFE_NO_PAD.encode([25_u8; 32]),
            _ => result.expires_at = pending.original.session.expires_at - 1,
        }
        let before = f.record("account").unwrap();
        assert!(
            f.owner.finish_renewal(&pending, result).is_err(),
            "{invalid}"
        );
        assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
        assert!(f.record(PENDING).is_some());
    }
}

#[test]
fn account_write_failure_keeps_original_and_durable_candidate() {
    let mut f = Fixture::new();
    let pending = f.pending();
    f.stage(&pending);
    let before = f.record("account").unwrap();
    f.store.fail_account_write.store(true, Ordering::Release);
    assert_eq!(
        f.owner
            .finish_renewal(&pending, renewed(&pending))
            .unwrap_err()
            .code,
        "MOBILE_SECURE_STORE_UNAVAILABLE"
    );
    assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
    assert_eq!(
        f.owner.saved.as_ref().unwrap().session.access_token,
        pending.original.session.access_token
    );
    assert!(f.record(PENDING).is_some());
}

#[test]
fn acknowledged_but_discarded_os_write_is_detected_and_keeps_pending() {
    let mut f = Fixture::new();
    let pending = f.pending();
    f.stage(&pending);
    let before = f.record("account").unwrap();
    f.memory.discard.store(true, Ordering::Release);
    assert_eq!(
        f.owner
            .finish_renewal(&pending, renewed(&pending))
            .unwrap_err()
            .code,
        "MOBILE_SECURE_STORE_UNAVAILABLE"
    );
    assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
    assert_eq!(
        f.owner.saved.as_ref().unwrap().session.access_token,
        pending.original.session.access_token
    );
    assert!(f.record(PENDING).is_some());
}

#[test]
fn committed_account_can_retry_pending_cleanup_without_restoring_old_bearer() {
    let mut f = Fixture::new();
    let pending = f.pending();
    f.stage(&pending);
    let old_guard = f.owner.active.clone();
    f.store.fail_pending_remove.store(true, Ordering::Release);
    assert_eq!(
        f.owner
            .finish_renewal(&pending, renewed(&pending))
            .unwrap_err()
            .code,
        "MOBILE_SECURE_STORE_UNAVAILABLE"
    );
    assert!(!old_guard.load(Ordering::Acquire));
    assert_eq!(
        f.owner.saved.as_ref().unwrap().session.access_token,
        pending.candidate
    );
    let persisted: SavedAccount =
        serde_json::from_slice(f.record("account").unwrap().as_slice()).unwrap();
    assert_eq!(persisted.session.access_token, pending.candidate);
    assert!(f.record(PENDING).is_some());
    assert!(f.record(CLOCK).is_some());
    f.store.fail_pending_remove.store(false, Ordering::Release);
    f.owner.finish_renewal(&pending, renewed(&pending)).unwrap();
    assert!(f.record(PENDING).is_none());
    assert!(!f.owner.renewal_due().unwrap());
}

#[tokio::test]
async fn expired_original_and_confirmed_candidate_401_become_expired_without_pending() {
    let server = Server::start(vec![Reply::json(
        401,
        json!({"error":{"code":"OWNED_SESSION_INVALID"}}),
    )])
    .await;
    let mut f = Fixture::new();
    f.pin(&server);
    f.owner.saved.as_mut().unwrap().session.expires_at = jsonwebtoken::get_current_timestamp() - 1;
    f.persist_account();
    let pending = f.pending();
    f.stage(&pending);
    let result = f
        .owner
        .request(json!({"version":1,"kind":"account.status"}))
        .await;
    assert_eq!(result["ok"], true);
    assert_eq!(result["value"]["state"], "expired");
    assert!(f.record(PENDING).is_none());
    assert!(f.record("account").is_some());
    assert_eq!(
        server.seen.lock().unwrap().as_slice(),
        &[("GET".into(), "/auth/session".into())]
    );
    server.finish().await;
}

#[tokio::test]
async fn malformed_success_or_503_never_discards_the_only_recovery_candidate() {
    for reply in [
        Reply {
            status: 200,
            body: "not-json".into(),
            dynamic: None,
            stall: false,
            expected_bearer: None,
        },
        Reply::json(503, json!({"error":"synthetic unavailable"})),
    ] {
        let server = Server::start(vec![reply]).await;
        let mut f = Fixture::new();
        f.pin(&server);
        f.owner.saved.as_mut().unwrap().session.expires_at =
            jsonwebtoken::get_current_timestamp() - 1;
        let pending = f.pending();
        f.stage(&pending);
        let before = f.record(PENDING).unwrap();
        assert!(f.owner.recover_account_renewal().await.is_err());
        assert_eq!(f.record(PENDING).unwrap().as_slice(), before.as_slice());
        assert_eq!(
            f.owner.saved.as_ref().unwrap().session.access_token,
            pending.original.session.access_token
        );
        server.finish().await;
    }
}

#[tokio::test]
async fn foreign_candidate_inspection_cannot_publish_or_start_device_proof() {
    let server = Server::start(vec![Reply::json(200, json!({
        "principalId":uuid::Uuid::new_v4().to_string(), "networkId":uuid::Uuid::new_v4().to_string(),
        "deviceId":uuid::Uuid::new_v4().to_string(), "expiresAt":jsonwebtoken::get_current_timestamp()+3600
    }))]).await;
    let mut f = Fixture::new();
    f.pin(&server);
    let pending = f.pending();
    f.stage(&pending);
    assert!(f.owner.recover_account_renewal().await.is_err());
    assert!(f.record(PENDING).is_some());
    assert_eq!(server.seen.lock().unwrap().len(), 1);
    assert_eq!(
        f.owner.saved.as_ref().unwrap().session.access_token,
        pending.original.session.access_token
    );
    server.finish().await;
}

#[tokio::test]
async fn first_unenrolled_account_status_only_inspects_its_current_bearer() {
    let inspected = Arc::new(Mutex::new(Value::Null));
    let server = Server::start(vec![Reply::dynamic(inspected.clone())]).await;
    let mut f = Fixture::new();
    f.pin(&server);
    let saved = f.owner.saved.as_ref().unwrap();
    *inspected.lock().unwrap() = json!({"principalId":saved.session.principal_id,
        "networkId":saved.session.network_id,"deviceId":saved.device_id,
        "expiresAt":saved.session.expires_at});
    let result = f
        .owner
        .request(json!({"version":1,"kind":"account.status"}))
        .await;
    assert_eq!(result["ok"], true);
    assert_eq!(result["value"]["state"], "signed-in");
    assert!(f.record(PENDING).is_none());
    assert_eq!(
        server.seen.lock().unwrap().as_slice(),
        &[("GET".into(), "/auth/session".into())]
    );
    server.finish().await;
}

#[tokio::test]
async fn confirmed_current_bearer_401_stays_expired_in_the_warm_cache() {
    let server = Server::start(vec![Reply::json(
        401,
        json!({"error":{"code":"OWNED_SESSION_INVALID"}}),
    )])
    .await;
    let mut f = Fixture::new();
    f.pin(&server);
    // A fresh six-hour clock must never suppress revocation inspection.
    f.clock(jsonwebtoken::get_current_timestamp());
    let before = f.record("account").unwrap();
    let original_hash = account_hash(f.owner.saved.as_ref().unwrap()).unwrap();
    let old_connections = f.owner.active.clone();
    for _ in 0..2 {
        let result = f
            .owner
            .request(json!({"version":1,"kind":"account.status"}))
            .await;
        assert_eq!(result["ok"], true);
        assert_eq!(result["value"]["state"], "expired");
        assert!(result["value"]["principalId"].is_null());
        assert!(f.owner.account_rejected);
        assert!(!old_connections.load(Ordering::Acquire));
        assert_eq!(
            account_hash(f.owner.saved.as_ref().unwrap()).unwrap(),
            original_hash
        );
        assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
    }
    assert_eq!(
        server.seen.lock().unwrap().as_slice(),
        &[("GET".into(), "/auth/session".into())]
    );
    assert!(f.record(PENDING).is_none());
    server.finish().await;
}

#[tokio::test]
async fn current_bearer_503_preserves_the_account_until_a_later_valid_inspection() {
    let inspected = Arc::new(Mutex::new(Value::Null));
    let server = Server::start(vec![
        Reply::json(503, json!({"error":"synthetic unavailable"})),
        Reply::dynamic(inspected.clone()),
    ])
    .await;
    let mut f = Fixture::new();
    f.pin(&server);
    f.clock(jsonwebtoken::get_current_timestamp());
    let saved = f.owner.saved.as_ref().unwrap();
    *inspected.lock().unwrap() = json!({"principalId":saved.session.principal_id,
        "networkId":saved.session.network_id,"deviceId":saved.device_id,
        "expiresAt":saved.session.expires_at});
    let original_hash = account_hash(saved).unwrap();
    let before = f.record("account").unwrap();
    let old_connections = f.owner.active.clone();
    let failed = f
        .owner
        .request(json!({"version":1,"kind":"account.status"}))
        .await;
    assert_eq!(failed["ok"], false);
    assert!(!f.owner.account_rejected);
    assert!(old_connections.load(Ordering::Acquire));
    assert_eq!(
        account_hash(f.owner.saved.as_ref().unwrap()).unwrap(),
        original_hash
    );
    assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
    assert!(f.record(PENDING).is_none());
    let recovered = f
        .owner
        .request(json!({"version":1,"kind":"account.status"}))
        .await;
    assert_eq!(recovered["ok"], true);
    assert_eq!(recovered["value"]["state"], "signed-in");
    assert_eq!(
        account_hash(f.owner.saved.as_ref().unwrap()).unwrap(),
        original_hash
    );
    assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
    assert_eq!(
        server.seen.lock().unwrap().as_slice(),
        &[
            ("GET".into(), "/auth/session".into()),
            ("GET".into(), "/auth/session".into()),
        ]
    );
    server.finish().await;
}

#[tokio::test]
async fn valid_candidate_inspection_without_existing_device_key_cannot_publish() {
    let inspected = Arc::new(Mutex::new(Value::Null));
    let descriptor = Arc::new(Mutex::new(Value::Null));
    let identity_state = Arc::new(Mutex::new(Value::Null));
    let server = Server::start(vec![
        Reply::dynamic(inspected.clone()),
        Reply::dynamic(inspected.clone()),
        Reply::dynamic(descriptor.clone()),
        Reply::dynamic(descriptor.clone()),
        Reply::dynamic(identity_state.clone()),
    ])
    .await;
    let mut f = Fixture::new();
    f.pin(&server);
    let pending = f.pending();
    let saved = f.owner.saved.as_ref().unwrap();
    *inspected.lock().unwrap() = json!({"principalId":saved.session.principal_id,
        "networkId":saved.session.network_id,"deviceId":saved.device_id,
        "expiresAt":pending.original.session.expires_at+3600});
    *descriptor.lock().unwrap() = serde_json::to_value(&saved.instance).unwrap();
    *identity_state.lock().unwrap() = json!({"serviceId":saved.instance.service_id,
        "environment":saved.instance.environment,"deviceId":saved.device_id,
        "keyGeneration":1,"keyFingerprint":pending.key_fingerprint});
    f.stage(&pending);
    let before = f.record("account").unwrap();
    let error = f.owner.recover_account_renewal().await.unwrap_err();
    assert_eq!(error.code, "NETWORK_PRIVATE_KEY_MISSING");
    assert_eq!(f.record("account").unwrap().as_slice(), before.as_slice());
    assert!(f.record(PENDING).is_some());
    assert_eq!(
        f.owner.saved.as_ref().unwrap().session.access_token,
        pending.original.session.access_token
    );
    let paths: Vec<String> = server
        .seen
        .lock()
        .unwrap()
        .iter()
        .map(|(_, path)| path.clone())
        .collect();
    assert_eq!(
        paths,
        vec![
            "/auth/session".to_string(),
            "/auth/session".into(),
            "/api/agent-network/instance".into(),
            "/api/agent-network/instance".into(),
            format!(
                "/api/agent-network/identity/state?deviceId={}",
                pending.original.device_id
            )
        ]
    );
    server.finish().await;
}

#[tokio::test]
async fn logout_cleanup_deadline_clears_local_account_but_preserves_uncertain_candidate() {
    let mut f = Fixture::new();
    let candidate = URL_SAFE_NO_PAD.encode([23_u8; 32]);
    let original = f.owner.saved.as_ref().unwrap().session.access_token.clone();
    let server = Server::start(vec![
        Reply::stalled_inspection(&candidate),
        Reply::logged_out(&original),
    ])
    .await;
    f.pin(&server);
    let pending = f.pending();
    assert_eq!(pending.candidate, candidate);
    f.stage(&pending);
    let durable_pending = f.record(PENDING).unwrap();
    let old_connections = f.owner.active.clone();
    let started = tokio::time::Instant::now();
    let result = tokio::time::timeout(
        Duration::from_secs(3),
        f.owner
            .request(json!({"version":1,"kind":"account.logout"})),
    )
    .await
    .expect("bounded cleanup must not wait for the outer request deadline");
    assert!(started.elapsed() >= super::super::LOGOUT_CLEANUP_TIMEOUT);
    assert_eq!(result["ok"], false);
    assert_eq!(result["error"]["code"], "MOBILE_LOGOUT_UNCONFIRMED");
    assert!(!old_connections.load(Ordering::Acquire));
    assert!(!f.owner.active.load(Ordering::Acquire));
    assert!(f.owner.saved.is_none());
    assert!(f.owner.connected.is_none());
    assert!(f.owner.peer.is_none());
    assert!(f.owner.targets.is_empty());
    assert!(f.record("account").is_none());
    assert_eq!(
        f.record(PENDING).unwrap().as_slice(),
        durable_pending.as_slice()
    );
    let status = f
        .owner
        .request(json!({"version":1,"kind":"account.status"}))
        .await;
    assert_eq!(status["ok"], true);
    assert_eq!(status["value"]["state"], "signed-out");
    assert!(f.owner.saved.is_none());
    assert!(f.record("account").is_none());
    assert!(f.record(PENDING).is_some());
    assert_eq!(
        server.seen.lock().unwrap().as_slice(),
        &[
            ("GET".into(), "/auth/session".into()),
            ("DELETE".into(), "/auth/session".into()),
        ]
    );
    server.finish().await;
}
