//! Actual Connection recovery through TLS, the real device PoP owner and signer.
use super::*;
use crate::agent_network::crypto::{DevicePrivateKey, IdentityStore, KeyScope};
use crate::owned_state::{Account, PendingRenewal};
use myagents_agentnet_device_core::{ChallengeOperation, DeviceStore, SessionContext};
use myagents_agentnet_identity_core::{IdentityRequest, IssuerProfile, ServiceKeys};
use serde_json::{json, Value};
use std::os::unix::fs::PermissionsExt;
use std::sync::{atomic::Ordering, Mutex};

struct StartupFixture {
    _state: tempfile::TempDir,
    _ipc: tempfile::TempDir,
    connection: Connection,
    instance: OwnedInstance,
    principal: String,
    expiry: u64,
    management: crate::management_ipc::ManagementIpcConfig,
    status: std::path::PathBuf,
}
fn startup_fixture(origin: &str, public_ca: Option<String>) -> StartupFixture {
    let state_dir = tempfile::tempdir().unwrap();
    std::fs::set_permissions(state_dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let root = state_dir.path().canonicalize().unwrap();
    let signer = ServiceKeys::generate_initial(root.join("fixture-signing-keys.json")).unwrap();
    let instance = OwnedInstance {
        version: 1,
        profile: "owned-device-relay-v1".into(),
        service_id: uuid::Uuid::new_v4().to_string(),
        environment: "development".into(),
        network_id: uuid::Uuid::new_v4().to_string(),
        name: "Startup fixture".into(),
        issuer: origin.into(),
        login_issuer: "https://login.invalid/dex".into(),
        protocol: 1,
        capabilities: vec!["tls13-mtls".into()],
        root_certificate: signer.root_certificate_pem().into(),
        jwks: signer.jwks(),
    };
    let store = Arc::new(EncryptedIdentityStore::for_test(&root, &[121; 32]).unwrap());
    let device = uuid::Uuid::new_v4().to_string();
    let pin = InstancePin {
        version: 1,
        device_id: device.clone(),
        instance: instance.clone(),
        public_ca,
    };
    store
        .compare_exchange_state(
            &pin_namespace(origin, &device),
            None,
            &serde_json::to_vec(&pin).unwrap(),
        )
        .unwrap();
    // This is the same offline constructor used by CLI run. No discovery GET.
    let connection = Connection::from_pinned(origin, None, store, &device).unwrap();
    let principal = uuid::Uuid::new_v4().to_string();
    let expiry = jsonwebtoken::get_current_timestamp() + 3600;
    let (mut state, raw) = connection.owner.read().unwrap();
    state.account = Some(Account {
        binding: uuid::Uuid::new_v4().to_string(),
        principal: principal.clone(),
        token: URL_SAFE_NO_PAD.encode([122; 32]),
        expires_at: expiry,
        renewal: None,
    });
    connection
        .owner
        .commit(raw.as_deref().map(|v| v.as_slice()), &state)
        .unwrap();
    // Production parent checks stay enabled; HOME is already required by the
    // existing private IPC tests, unlike shared /tmp ancestors.
    let ipc = tempfile::Builder::new()
        .prefix("st-")
        .tempdir_in(std::env::var_os("HOME").unwrap())
        .unwrap();
    let ipc_root = ipc.path().canonicalize().unwrap();
    std::fs::set_permissions(&ipc_root, std::fs::Permissions::from_mode(0o750)).unwrap();
    let management = crate::management_ipc::ManagementIpcConfig {
        socket: ipc_root.join("m.sock"),
        asset_root: root.join("assets"),
        host_uid: unsafe { libc::geteuid() } + 1,
        management_gid: unsafe { libc::getegid() },
    };
    let status = root.join("status.json");
    std::fs::write(&status, b"").unwrap();
    std::fs::set_permissions(&status, std::fs::Permissions::from_mode(0o640)).unwrap();
    StartupFixture {
        _state: state_dir,
        _ipc: ipc,
        connection,
        instance,
        principal,
        expiry,
        management,
        status,
    }
}
fn startup_owner(fixture: &StartupFixture) -> Arc<crate::state::Owner> {
    Arc::new(crate::state::Owner {
        store: fixture.connection.owner.store.clone(),
        device_id: fixture.connection.owner.scope.device_id.clone(),
    })
}
struct StartupAuthority {
    instance: OwnedInstance,
    principal: String,
    device: String,
    expiry: u64,
    unauthorized: bool,
}
impl Responder for StartupAuthority {
    fn response(&self, request: &[u8]) -> (u16, Value) {
        if request.starts_with(b"GET /api/agent-network/instance ") {
            return (200, serde_json::to_value(&self.instance).unwrap());
        }
        assert!(
            request.starts_with(b"GET /auth/session "),
            "startup must not write a remote mutation"
        );
        if self.unauthorized {
            return (401, json!({"error":{"code":"UNAUTHORIZED"}}));
        }
        (
            200,
            json!({"principalId":self.principal, "networkId":self.instance.network_id,
            "deviceId":self.device, "expiresAt":self.expiry}),
        )
    }
}

#[tokio::test]
async fn startup_refused_connection_recovers_in_same_connector_after_original_backoff() {
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap();
    let origin = format!("https://{port}");
    let (tls, ca) = tls_config();
    let fixture = startup_fixture(&origin, Some(ca));
    let stop = Arc::new(AtomicBool::new(false));
    let mut server = None;
    let projected = std::sync::atomic::AtomicUsize::new(0);
    let project = || {
        let count = projected.fetch_add(1, Ordering::SeqCst);
        if count >= 2 {
            assert!(
                fixture.management.socket.exists(),
                "listener follows online authorization"
            );
            return Err(NetworkError::new("STARTUP_TEST_COMPLETE"));
        }
        assert!(
            !fixture.management.socket.exists(),
            "no listener before online authorization"
        );
        Ok(())
    };
    let run = crate::connector::run_owned(
        startup_owner(&fixture),
        &fixture.connection,
        Some(&fixture.status),
        false,
        None,
        Some(&fixture.management),
        Some(&project),
    );
    tokio::pin!(run);
    let monitor = async {
        loop {
            let value: Value = serde_json::from_slice(&std::fs::read(&fixture.status).unwrap())
                .unwrap_or(Value::Null);
            if value["errorCode"] == "OWNED_ACCOUNT_UNAVAILABLE" {
                assert_eq!(value["state"], "unavailable");
                assert_eq!(value["ready"], false);
                assert!(!fixture.management.socket.exists());
                let listener = std::net::TcpListener::bind(port).unwrap();
                listener.set_nonblocking(true).unwrap();
                server = Some(serve(
                    listener,
                    tls.clone(),
                    StartupAuthority {
                        instance: fixture.instance.clone(),
                        principal: fixture.principal.clone(),
                        device: fixture.connection.owner.scope.device_id.clone(),
                        expiry: fixture.expiry,
                        unauthorized: false,
                    },
                    stop.clone(),
                ));
                std::future::pending::<()>().await;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    };
    let started = std::time::Instant::now();
    let result = tokio::time::timeout(Duration::from_secs(12), async {
        tokio::select! { result = &mut run => result, _ = monitor => unreachable!() }
    })
    .await
    .unwrap();
    stop.store(true, Ordering::Release);
    server.unwrap().join().unwrap();
    assert_eq!(result.unwrap_err().code, "STARTUP_TEST_COMPLETE");
    assert!(
        started.elapsed() >= Duration::from_secs(5),
        "existing connector backoff is unchanged"
    );
    assert_eq!(projected.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn startup_saved_session_rejected_is_terminal_before_listener() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let origin = format!("https://{}", listener.local_addr().unwrap());
    let (tls, ca) = tls_config();
    let fixture = startup_fixture(&origin, Some(ca));
    let stop = Arc::new(AtomicBool::new(false));
    let server = serve(
        listener,
        tls,
        StartupAuthority {
            instance: fixture.instance.clone(),
            principal: fixture.principal.clone(),
            device: fixture.connection.owner.scope.device_id.clone(),
            expiry: fixture.expiry,
            unauthorized: true,
        },
        stop.clone(),
    );
    let result = tokio::time::timeout(
        Duration::from_secs(3),
        crate::connector::run_owned(
            startup_owner(&fixture),
            &fixture.connection,
            Some(&fixture.status),
            false,
            None,
            Some(&fixture.management),
            None,
        ),
    )
    .await
    .unwrap();
    stop.store(true, Ordering::Release);
    server.join().unwrap();
    assert_eq!(result.unwrap_err().code, "OWNED_SESSION_INVALID");
    assert!(!fixture.management.socket.exists());
}

#[tokio::test]
async fn startup_untrusted_tls_is_terminal_before_listener() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("https://{}", listener.local_addr().unwrap());
    let (tls, _ca) = tls_config();
    let fixture = startup_fixture(&origin, None);
    let server = std::thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut stream = rustls::StreamOwned::new(
            rustls::ServerConnection::new(Arc::new(tls)).unwrap(),
            socket,
        );
        assert!(stream.read(&mut [0; 1]).is_err());
    });
    let result = tokio::time::timeout(
        Duration::from_secs(3),
        crate::connector::run_owned(
            startup_owner(&fixture),
            &fixture.connection,
            Some(&fixture.status),
            false,
            None,
            Some(&fixture.management),
            None,
        ),
    )
    .await
    .unwrap();
    server.join().unwrap();
    let error = result.unwrap_err();
    assert_eq!(error.code, "OWNED_ACCOUNT_UNAVAILABLE");
    assert!(!error.retryable);
    assert!(!fixture.management.socket.exists());
}

#[tokio::test]
async fn startup_wait_never_adopts_replaced_local_binding() {
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap();
    let fixture = startup_fixture(&format!("https://{port}"), None);
    let run = crate::connector::run_owned(
        startup_owner(&fixture),
        &fixture.connection,
        Some(&fixture.status),
        false,
        None,
        Some(&fixture.management),
        None,
    );
    tokio::pin!(run);
    let change = async {
        loop {
            let value: Value = serde_json::from_slice(&std::fs::read(&fixture.status).unwrap())
                .unwrap_or(Value::Null);
            if value["errorCode"] == "OWNED_ACCOUNT_UNAVAILABLE" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let (mut state, raw) = fixture.connection.owner.read().unwrap();
        state.account.as_mut().unwrap().binding = uuid::Uuid::new_v4().to_string();
        fixture
            .connection
            .owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &state)
            .unwrap();
        std::future::pending::<()>().await;
    };
    let result = tokio::time::timeout(Duration::from_secs(8), async {
        tokio::select! { result = &mut run => result, _ = change => unreachable!() }
    })
    .await
    .unwrap();
    assert_eq!(result.unwrap_err().code, "ACCOUNT_BINDING_CHANGED");
    assert!(!fixture.management.socket.exists());
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Case {
    Committed,
    ForeignHandle,
    ForeignKey,
    ForeignPrincipal,
}
#[derive(Default)]
struct Observations {
    proof_count: usize,
    query_count: usize,
    forbidden_count: usize,
}
struct Authority {
    instance: OwnedInstance,
    context: SessionContext,
    candidate: Zeroizing<String>,
    devices: DeviceStore,
    signer: ServiceKeys,
    observations: Arc<Mutex<Observations>>,
    case: Case,
}
impl Authority {
    fn respond(&self, request: &[u8]) -> (u16, Value) {
        let split = request.windows(4).position(|p| p == b"\r\n\r\n").unwrap();
        let headers = std::str::from_utf8(&request[..split]).unwrap();
        let first = headers.lines().next().unwrap();
        let mut words = first.split_whitespace();
        let method = words.next().unwrap();
        let path = words.next().unwrap();
        let authorization = headers.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key.eq_ignore_ascii_case("authorization")
                .then(|| value.trim())
        });
        if method == "GET" && path == "/api/agent-network/instance" {
            return (200, serde_json::to_value(&self.instance).unwrap());
        }
        assert!(authorization
            .is_some_and(|value| value == format!("Bearer {}", self.candidate.as_str())));
        if method == "GET" && path == "/auth/session" {
            let principal = if self.case == Case::ForeignPrincipal {
                uuid::Uuid::new_v4().to_string()
            } else {
                self.context.principal_id.clone()
            };
            return (
                200,
                json!({"principalId":principal,"deviceId":self.context.device_id,
                "networkId":self.context.network_id,"expiresAt":self.context.expires_at}),
            );
        }
        if method == "GET" && path == "/api/agent-network/jwks" {
            return (200, self.signer.jwks());
        }
        if method == "GET"
            && path
                == format!(
                    "/api/agent-network/identity/state?deviceId={}",
                    self.context.device_id
                )
        {
            let record = self
                .devices
                .read_state(&self.context, &self.context.device_id)
                .unwrap()
                .unwrap();
            return (
                200,
                json!({"serviceId":self.instance.service_id,"environment":self.instance.environment,
                "deviceId":self.context.device_id,"keyGeneration":record.key_generation,"keyFingerprint":record.key_fingerprint}),
            );
        }
        let body: Value = serde_json::from_slice(&request[split + 4..]).unwrap_or(Value::Null);
        if method == "POST" && path == "/api/agent-network/challenge" {
            assert_eq!(body["deviceId"], self.context.device_id);
            assert_eq!(body["operation"], "recover-query");
            let challenge = self
                .devices
                .create_challenge(
                    &self.context,
                    ChallengeOperation::RecoverQuery,
                    body["expectedKeyGeneration"].as_u64().unwrap(),
                    body["targetFingerprint"].as_str().unwrap(),
                )
                .unwrap();
            self.observations.lock().unwrap().proof_count += 1;
            return (
                200,
                json!({"challengeId":challenge.challenge_id,"nonce":challenge.nonce,"expiresAt":challenge.expires_at}),
            );
        }
        if method == "POST" && path == "/api/agent-network/identity/current" {
            assert_eq!(body["deviceId"], self.context.device_id);
            // The production owner verifies the actual host signature and
            // consumes its one-shot challenge. No success proof is mocked.
            let record = self
                .devices
                .consume_proof(
                    &self.context,
                    ChallengeOperation::RecoverQuery,
                    body["expectedKeyGeneration"].as_u64().unwrap(),
                    body["challengeId"].as_str().unwrap(),
                    body["proof"].as_str().unwrap(),
                )
                .unwrap();
            assert_eq!(body["keyFingerprint"], record.key_fingerprint);
            self.observations.lock().unwrap().query_count += 1;
            let handle = if self.case == Case::ForeignHandle {
                uuid::Uuid::new_v4().to_string()
            } else {
                self.context.session_handle.clone()
            };
            let csr = if self.case == Case::ForeignKey {
                DevicePrivateKey::generate().unwrap().csr().unwrap()
            } else {
                record.csr_pem
            };
            let issued = self
                .signer
                .issue(
                    &IssuerProfile {
                        issuer: self.instance.issuer.clone(),
                        service_id: self.instance.service_id.clone(),
                        environment: self.instance.environment.clone(),
                        network_id: self.instance.network_id.clone(),
                    },
                    &IdentityRequest {
                        principal_id: self.context.principal_id.clone(),
                        device_id: self.context.device_id.clone(),
                        key_generation: record.key_generation,
                        identity_binding_id: record.identity_binding_id,
                        session_handle: handle,
                        csr_pem: csr,
                    },
                )
                .unwrap();
            return (200, issued.as_json().unwrap());
        }
        // Initial registration, rotation, join and management/model operations
        // are forbidden in this recovery journey and never receive a fake ACK.
        self.observations.lock().unwrap().forbidden_count += 1;
        (
            404,
            json!({"ok":false,"error":{"code":"UNEXPECTED_OPERATION","retryable":false},"requestId":"fixture"}),
        )
    }
}
fn tls_config() -> (rustls::ServerConfig, String) {
    let ca_key = rcgen::KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256).unwrap();
    let mut params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
    params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params.key_usages = vec![rcgen::KeyUsagePurpose::KeyCertSign];
    let ca = params.self_signed(&ca_key).unwrap();
    let pem = ca.pem();
    let issuer = rcgen::Issuer::new(params, ca_key);
    let key = rcgen::KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256).unwrap();
    let mut params = rcgen::CertificateParams::new(vec!["127.0.0.1".into()]).unwrap();
    params.extended_key_usages = vec![rcgen::ExtendedKeyUsagePurpose::ServerAuth];
    let cert = params.signed_by(&key, &issuer).unwrap();
    let config = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_protocol_versions(&[&rustls::version::TLS13])
    .unwrap()
    .with_no_client_auth()
    .with_single_cert(
        vec![cert.der().clone()],
        rustls::pki_types::PrivatePkcs8KeyDer::from(key.serialize_der()).into(),
    )
    .unwrap();
    (config, pem)
}
trait Responder: Send + 'static {
    fn response(&self, request: &[u8]) -> (u16, Value);
}
impl Responder for Authority {
    fn response(&self, request: &[u8]) -> (u16, Value) {
        self.respond(request)
    }
}
fn serve(
    listener: std::net::TcpListener,
    tls: rustls::ServerConfig,
    authority: impl Responder,
    stop: Arc<AtomicBool>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let tls = Arc::new(tls);
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        while !stop.load(Ordering::Acquire) {
            let socket = match listener.accept() {
                Ok((socket, _)) => socket,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(std::time::Instant::now() < deadline);
                    std::thread::sleep(Duration::from_millis(2));
                    continue;
                }
                Err(_) => panic!("fixture listener"),
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            socket
                .set_write_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut stream = rustls::StreamOwned::new(
                rustls::ServerConnection::new(tls.clone()).unwrap(),
                socket,
            );
            let mut bytes = Vec::new();
            loop {
                let mut chunk = [0u8; 4096];
                let read = stream.read(&mut chunk).unwrap();
                assert!(read > 0 && bytes.len() + read <= 16384);
                bytes.extend_from_slice(&chunk[..read]);
                if let Some(split) = bytes.windows(4).position(|p| p == b"\r\n\r\n") {
                    let header = std::str::from_utf8(&bytes[..split]).unwrap();
                    let length = header
                        .lines()
                        .find_map(|line| {
                            let (k, v) = line.split_once(':')?;
                            k.eq_ignore_ascii_case("content-length")
                                .then(|| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= split + 4 + length {
                        break;
                    }
                }
            }
            let (status, body) = authority.response(&bytes);
            let body = body.to_string();
            // A timed-out renewal intentionally drops its HTTP response. The
            // authority may already have committed before this write fails.
            let _ = write!(stream,"HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
            let _ = stream.flush();
        }
    })
}

#[tokio::test]
async fn committed_candidate_recovers_after_old_expiry_via_real_existing_key_proof() {
    // Physical metadata is process-global; an owned profile still overrides its
    // device UUID. This is an isolated test process, never the installed app.
    let _ = crate::device_identity::initialize(
        uuid::Uuid::new_v4().to_string(),
        Some("Fixture".into()),
    );
    for case in [
        Case::Committed,
        Case::ForeignHandle,
        Case::ForeignKey,
        Case::ForeignPrincipal,
    ] {
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let signer = ServiceKeys::generate_initial(root.join("fixture-signing-keys.json")).unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let origin = format!("https://{}", listener.local_addr().unwrap());
        let (tls, public_ca) = tls_config();
        let instance = OwnedInstance {
            version: 1,
            profile: "owned-device-relay-v1".into(),
            service_id: uuid::Uuid::new_v4().to_string(),
            environment: "development".into(),
            network_id: uuid::Uuid::new_v4().to_string(),
            name: "Recovery fixture".into(),
            issuer: origin.clone(),
            login_issuer: "https://login.invalid/dex".into(),
            protocol: 1,
            capabilities: vec!["tls13-mtls".into()],
            root_certificate: signer.root_certificate_pem().into(),
            jwks: signer.jwks(),
        };
        let device = uuid::Uuid::new_v4().to_string();
        let principal = uuid::Uuid::new_v4().to_string();
        let handle = uuid::Uuid::new_v4().to_string();
        let binding = uuid::Uuid::new_v4().to_string();
        let now = jsonwebtoken::get_current_timestamp();
        let expiry = now + 3600;
        let store = Arc::new(EncryptedIdentityStore::for_test(&root, &[101; 32]).unwrap());
        let scope = KeyScope {
            issuer: origin.clone(),
            environment: instance.environment.clone(),
            service_id: instance.service_id.clone(),
            principal_id: principal.clone(),
            device_id: device.clone(),
            key_generation: 1,
        };
        let host_key = DevicePrivateKey::generate().unwrap();
        let fingerprint = host_key.public_fingerprint().unwrap();
        store.save_pending(&scope, &host_key).unwrap();
        let context = SessionContext {
            principal_id: principal.clone(),
            network_id: instance.network_id.clone(),
            device_id: device.clone(),
            session_handle: handle.clone(),
            expires_at: expiry as i64,
        };
        let devices = DeviceStore::open(&root).unwrap();
        let record = devices
            .claim_initial(&context, &host_key.csr().unwrap())
            .unwrap();
        let old_token = URL_SAFE_NO_PAD.encode([102u8; 32]);
        let candidate = URL_SAFE_NO_PAD.encode([103u8; 32]);
        let pin = InstancePin {
            version: 1,
            device_id: device.clone(),
            instance: instance.clone(),
            public_ca: Some(public_ca),
        };
        store
            .compare_exchange_state(
                &pin_namespace(&origin, &device),
                None,
                &serde_json::to_vec(&pin).unwrap(),
            )
            .unwrap();
        let connection = Connection::from_pinned(&origin, None, store.clone(), &device).unwrap();
        let (mut state, raw) = connection.owner.read().unwrap();
        // Durable pre-crash candidate: server has committed the rotation but
        // its response was lost and the old local expiry has now passed.
        state.account = Some(Account {
            binding: binding.clone(),
            principal: principal.clone(),
            token: old_token.clone(),
            expires_at: now - 1,
            renewal: Some(PendingRenewal {
                token: candidate.clone(),
                session_handle: handle.clone(),
                key_generation: 1,
                key_fingerprint: fingerprint.clone(),
            }),
        });
        connection
            .owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &state)
            .unwrap();
        assert_eq!(
            connection.owner.ensure_binding(&binding).unwrap_err().code,
            "ACCOUNT_SESSION_EXPIRED"
        );
        drop(connection);
        let observations = Arc::new(Mutex::new(Observations::default()));
        let stop = Arc::new(AtomicBool::new(false));
        let server = serve(
            listener,
            tls,
            Authority {
                instance,
                context,
                candidate: Zeroizing::new(candidate.clone()),
                devices,
                signer,
                observations: observations.clone(),
                case,
            },
            stop.clone(),
        );
        let restarted_store =
            Arc::new(EncryptedIdentityStore::for_test(&root, &[101; 32]).unwrap());
        let restarted =
            Connection::from_pinned(&origin, None, restarted_store.clone(), &device).unwrap();
        let result =
            tokio::time::timeout(Duration::from_secs(20), restarted.recover_pending_renewal())
                .await;
        stop.store(true, Ordering::Release);
        server.join().unwrap();
        let result = result.unwrap();
        let account = restarted.owner.read().unwrap().0.account.unwrap();
        let seen = observations.lock().unwrap();
        assert_eq!(seen.forbidden_count, 0);
        assert_eq!(
            (seen.proof_count, seen.query_count),
            if case == Case::ForeignPrincipal {
                (0, 0)
            } else {
                (1, 1)
            }
        );
        assert_eq!(
            store.load(&scope).unwrap().public_fingerprint().unwrap(),
            fingerprint
        );
        assert_eq!(
            (&account.binding, &account.principal),
            (&binding, &principal)
        );
        if case == Case::Committed {
            result.unwrap();
            assert_eq!(account.token, candidate);
            assert_eq!(account.expires_at, expiry);
            assert!(account.renewal.is_none());
            restarted.owner.ensure_binding(&binding).unwrap();
            let server_record = DeviceStore::open(&root)
                .unwrap()
                .read_state(
                    &SessionContext {
                        principal_id: principal.clone(),
                        network_id: restarted.owner.scope.network_id.clone(),
                        device_id: device.clone(),
                        session_handle: handle.clone(),
                        expires_at: expiry as i64,
                    },
                    &device,
                )
                .unwrap()
                .unwrap();
            assert_eq!(server_record, record); // original key/binding/generation
        } else {
            assert!(result.is_err());
            assert_eq!(account.token, old_token);
            assert_eq!(account.expires_at, now - 1);
            assert_eq!(account.renewal.as_ref().unwrap().session_handle, handle);
        }
    }
}

/// The mobile source must remain a read-only consumer of the live socket's
/// snapshot even after the service rotates its bearer but before the renewal
/// owner receives the response. This fixture uses the production source helper
/// and actual Connection/NetworkTransport renewal requests over TLS.
struct RenewalRace {
    authority: Mutex<Authority>,
    committed: Arc<AtomicBool>,
    release: Arc<AtomicBool>,
    posts: Arc<std::sync::atomic::AtomicUsize>,
    network_token: Arc<Mutex<Option<Zeroizing<String>>>>,
    device_jwk: Value,
    renewed_expiry: u64,
}
impl Responder for RenewalRace {
    fn response(&self, request: &[u8]) -> (u16, Value) {
        use base64::Engine;
        let split = request.windows(4).position(|p| p == b"\r\n\r\n").unwrap();
        let header = std::str::from_utf8(&request[..split]).unwrap();
        if !header.starts_with("POST /v1/session/renew ") {
            let authority = self.authority.lock().unwrap();
            if !header.starts_with("GET /api/agent-network/instance ") {
                let bearer = header.lines().find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("authorization")
                        .then(|| value.trim())
                });
                if bearer != Some(format!("Bearer {}", authority.candidate.as_str()).as_str()) {
                    return (
                        401,
                        json!({"ok":false,"error":{"code":"SESSION_INVALID","retryable":false},"requestId":"fixture"}),
                    );
                }
            }
            return authority.respond(request);
        }
        let read_header = |name: &str| {
            header
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.eq_ignore_ascii_case(name).then(|| value.trim())
                })
                .unwrap()
        };
        let expected = self.network_token.lock().unwrap();
        assert_eq!(
            read_header("authorization"),
            format!("Bearer {}", expected.as_ref().unwrap().as_str())
        );
        // Verify the real client's DPoP signature with its existing device key,
        // then bind its claims to this request and admitted access credential.
        let proof = read_header("dpop");
        let jwk: jsonwebtoken::jwk::Jwk = serde_json::from_value(self.device_jwk.clone()).unwrap();
        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::ES256);
        validation.required_spec_claims.clear();
        validation.validate_exp = false;
        validation.validate_aud = false;
        let claims = jsonwebtoken::decode::<Value>(
            proof,
            &jsonwebtoken::DecodingKey::from_jwk(&jwk).unwrap(),
            &validation,
        )
        .unwrap()
        .claims;
        let mut authority = self.authority.lock().unwrap();
        assert_eq!(claims["htm"], "POST");
        assert_eq!(
            claims["htu"],
            format!("{}/v1/session/renew", authority.instance.issuer)
        );
        assert_eq!(
            claims["ath"],
            URL_SAFE_NO_PAD.encode(Sha256::digest(expected.as_ref().unwrap().as_bytes()))
        );
        drop(expected);
        let body: Value = serde_json::from_slice(&request[split + 4..]).unwrap();
        assert_eq!(body.as_object().unwrap().len(), 1);
        let candidate = body["sessionToken"].as_str().unwrap();
        assert_eq!(URL_SAFE_NO_PAD.decode(candidate).unwrap().len(), 32);
        let number = self.posts.fetch_add(1, Ordering::AcqRel);
        if number == 0 {
            authority.candidate = Zeroizing::new(candidate.to_owned());
            authority.context.expires_at = self.renewed_expiry as i64;
        } else {
            assert_eq!(authority.candidate.as_str(), candidate); // same candidate retry
        }
        let projection = json!({"ok":true,"data":{
            "principalId":authority.context.principal_id,"deviceId":authority.context.device_id,
            "networkId":authority.context.network_id,"sessionHandle":authority.context.session_handle,
            "expiresAt":authority.context.expires_at}});
        drop(authority);
        self.committed.store(true, Ordering::Release);
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !self.release.load(Ordering::Acquire) {
            assert!(
                std::time::Instant::now() < deadline,
                "test must release the renewal response"
            );
            std::thread::sleep(Duration::from_millis(2));
        }
        (200, projection)
    }
}

#[tokio::test]
async fn notification_snapshot_cannot_adopt_during_renewal_commit_or_lost_response() {
    use crate::agent_network::{
        identity::NetworkIdentity, memory::MemoryBudget, transport::NetworkTransport,
    };
    use crate::management_ipc::LocalSourceAuthority;
    use myagents_agent_network_protocol::{ConnectionScope, DeviceScope};
    let _ = crate::device_identity::initialize(
        uuid::Uuid::new_v4().to_string(),
        Some("Fixture".into()),
    );
    for lost_response in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let signer = ServiceKeys::generate_initial(root.join("fixture-signing-keys.json")).unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let origin = format!("https://{}", listener.local_addr().unwrap());
        let (tls, public_ca) = tls_config();
        let instance = OwnedInstance {
            version: 1,
            profile: "owned-device-relay-v1".into(),
            service_id: uuid::Uuid::new_v4().to_string(),
            environment: "development".into(),
            network_id: uuid::Uuid::new_v4().to_string(),
            name: "Renewal race fixture".into(),
            issuer: origin.clone(),
            login_issuer: "https://login.invalid/dex".into(),
            protocol: 1,
            capabilities: vec!["tls13-mtls".into()],
            root_certificate: signer.root_certificate_pem().into(),
            jwks: signer.jwks(),
        };
        let device = uuid::Uuid::new_v4().to_string();
        let principal = uuid::Uuid::new_v4().to_string();
        let handle = uuid::Uuid::new_v4().to_string();
        let binding_id = uuid::Uuid::new_v4().to_string();
        let now = jsonwebtoken::get_current_timestamp();
        let store = Arc::new(EncryptedIdentityStore::for_test(&root, &[111; 32]).unwrap());
        let scope = KeyScope {
            issuer: origin.clone(),
            environment: instance.environment.clone(),
            service_id: instance.service_id.clone(),
            principal_id: principal.clone(),
            device_id: device.clone(),
            key_generation: 1,
        };
        let key = DevicePrivateKey::generate().unwrap();
        store.save_pending(&scope, &key).unwrap();
        let context = SessionContext {
            principal_id: principal.clone(),
            network_id: instance.network_id.clone(),
            device_id: device.clone(),
            session_handle: handle.clone(),
            expires_at: (now + 60) as i64,
        };
        let devices = DeviceStore::open(&root).unwrap();
        devices
            .claim_initial(&context, &key.csr().unwrap())
            .unwrap();
        let old_token = URL_SAFE_NO_PAD.encode([112u8; 32]);
        let pin = InstancePin {
            version: 1,
            device_id: device.clone(),
            instance: instance.clone(),
            public_ca: Some(public_ca.clone()),
        };
        store
            .compare_exchange_state(
                &pin_namespace(&origin, &device),
                None,
                &serde_json::to_vec(&pin).unwrap(),
            )
            .unwrap();
        let connection = Connection::from_pinned(&origin, None, store.clone(), &device).unwrap();
        let (mut state, raw) = connection.owner.read().unwrap();
        state.account = Some(Account {
            binding: binding_id.clone(),
            principal: principal.clone(),
            token: old_token.clone(),
            expires_at: now + 60,
            renewal: None,
        });
        connection
            .owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &state)
            .unwrap();
        let committed = Arc::new(AtomicBool::new(false));
        let release = Arc::new(AtomicBool::new(false));
        let posts = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let network_token = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let server = serve(
            listener,
            tls,
            RenewalRace {
                authority: Mutex::new(Authority {
                    instance,
                    context,
                    candidate: Zeroizing::new(old_token.clone()),
                    devices,
                    signer,
                    observations: Arc::new(Mutex::new(Observations::default())),
                    case: Case::Committed,
                }),
                committed: committed.clone(),
                release: release.clone(),
                posts: posts.clone(),
                network_token: network_token.clone(),
                device_jwk: key.public_jwk().unwrap(),
                renewed_expiry: now + 3600,
            },
            stop.clone(),
        );
        let account = connection.account(false).await.unwrap();
        let identity = NetworkIdentity::initialize_existing(account, store.clone())
            .await
            .unwrap();
        *network_token.lock().unwrap() = Some(identity.token.clone());
        let management =
            crate::management_admission::authorize(&connection.owner, &identity.account).unwrap();
        let authority = LocalSourceAuthority {
            connection: ConnectionScope {
                service_id: scope.service_id.clone(),
                network_id: connection.owner.scope.network_id.clone(),
                boot_epoch: uuid::Uuid::new_v4().to_string(),
                connection_epoch: uuid::Uuid::new_v4().to_string(),
            },
            local: DeviceScope {
                service_id: scope.service_id.clone(),
                environment: scope.environment.clone(),
                network_id: connection.owner.scope.network_id.clone(),
                principal_id: principal.clone(),
                device_id: device.clone(),
                key_generation: 1,
            },
            account_binding: binding_id.clone(),
            management_binding: binding_id.clone(),
        };
        let transport = NetworkTransport::new_with_public_ca(
            &origin,
            identity.device_key(),
            MemoryBudget::default(),
            Some(&public_ca),
        )
        .unwrap();
        let cancel_after_source = tokio::sync::Notify::new();
        let renewal_timed_out = tokio::sync::Notify::new();
        let renew = async {
            if lost_response {
                let renewal = connection.renew_session(&identity, &transport);
                tokio::pin!(renewal);
                tokio::select! {
                    result = &mut renewal => panic!("response must still be withheld: {}", result.is_ok()),
                    _ = cancel_after_source.notified() => {}
                }
                assert!(
                    tokio::time::timeout(Duration::from_millis(20), &mut renewal)
                        .await
                        .is_err()
                );
                renewal_timed_out.notify_one();
            } else {
                assert!(connection
                    .renew_session(&identity, &transport)
                    .await
                    .unwrap());
            }
        };
        let source = async {
            tokio::time::timeout(Duration::from_secs(10), async {
                while !committed.load(Ordering::Acquire) {
                    tokio::time::sleep(Duration::from_millis(2)).await;
                }
            })
            .await
            .unwrap();
            let (before, before_raw) = connection.owner.read().unwrap();
            assert_eq!(before.account.as_ref().unwrap().token, old_token);
            assert!(before.account.as_ref().unwrap().renewal.is_some());
            let sealed_state = || {
                std::fs::read_dir(&root)
                    .unwrap()
                    .map(|entry| entry.unwrap().path())
                    .filter(|path| {
                        path.file_name()
                            .unwrap()
                            .to_string_lossy()
                            .starts_with("state-")
                            && path
                                .extension()
                                .is_some_and(|extension| extension == "sealed")
                    })
                    .map(|path| {
                        (
                            path.file_name().unwrap().to_owned(),
                            std::fs::read(path).unwrap(),
                        )
                    })
                    .collect::<std::collections::BTreeMap<_, _>>()
            };
            let encrypted_before = sealed_state();
            assert!(!encrypted_before.is_empty());
            // This is the exact credential reader invoked by publish after its
            // IPC peek. It must neither await recovery nor adopt the candidate.
            let source_account =
                crate::notification_source::publication_account(&identity, &management, &authority)
                    .unwrap();
            assert_eq!(source_account.session.access_token, old_token);
            let (_, after_raw) = connection.owner.read().unwrap();
            assert_eq!(before_raw.as_deref(), after_raw.as_deref());
            let mut foreign = authority.clone();
            foreign.account_binding = uuid::Uuid::new_v4().to_string();
            assert!(crate::notification_source::publication_account(
                &identity,
                &management,
                &foreign
            )
            .is_err());
            foreign = authority.clone();
            foreign.local.principal_id = uuid::Uuid::new_v4().to_string();
            assert!(crate::notification_source::publication_account(
                &identity,
                &management,
                &foreign
            )
            .is_err());
            foreign = authority.clone();
            foreign.local.key_generation += 1;
            assert!(crate::notification_source::publication_account(
                &identity,
                &management,
                &foreign
            )
            .is_err());
            let (_, after_rejections) = connection.owner.read().unwrap();
            assert_eq!(before_raw.as_deref(), after_rejections.as_deref());
            assert!(encrypted_before == sealed_state());
            if lost_response {
                cancel_after_source.notify_one();
                renewal_timed_out.notified().await;
            }
            release.store(true, Ordering::Release);
        };
        tokio::join!(renew, source);
        if lost_response {
            let pending = connection.owner.read().unwrap().0.account.unwrap();
            assert_eq!(pending.token, old_token);
            assert!(pending.renewal.is_some());
            assert!(connection
                .renew_session(&identity, &transport)
                .await
                .unwrap());
            assert_eq!(posts.load(Ordering::Acquire), 2);
        } else {
            assert_eq!(posts.load(Ordering::Acquire), 1);
        }
        let adopted = connection.owner.read().unwrap().0.account.unwrap();
        assert_ne!(adopted.token, old_token);
        assert!(adopted.renewal.is_none());
        assert_eq!(adopted.binding, binding_id);
        assert_eq!(adopted.principal, principal);
        assert_eq!(adopted.expires_at, now + 3600);
        // The optional source may receive a real 401 for its retired bearer;
        // this cannot become a second adopter or prevent the owner's reconnect.
        assert!(connection
            .client
            .notification_source_request(
                "/api/mobile-notify/v1/source/challenges",
                json!({"version":1}),
                &old_token
            )
            .await
            .is_err());
        // A reconnect captures the adopted token; the old immutable connection
        // itself is never silently mutated or allowed to replay operations.
        let reconnected = connection.account(false).await.unwrap();
        let NetworkAccountSession::Owned(new_account) = reconnected else {
            unreachable!()
        };
        assert_eq!(new_account.session.access_token, adopted.token);
        assert_eq!(new_account.connection_id, binding_id);
        let (mut replacement, original) = connection.owner.read().unwrap();
        replacement.account.as_mut().unwrap().binding = uuid::Uuid::new_v4().to_string();
        connection
            .owner
            .commit(original.as_deref().map(|v| v.as_slice()), &replacement)
            .unwrap();
        assert_eq!(
            crate::notification_source::publication_account(&identity, &management, &authority)
                .err()
                .unwrap()
                .code,
            "ACCOUNT_BINDING_CHANGED"
        );
        stop.store(true, Ordering::Release);
        server.join().unwrap();
    }
}
