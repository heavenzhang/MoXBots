//! Actual Connection recovery through TLS, the real device PoP owner and signer.
use super::*;
use crate::agent_network::crypto::{DevicePrivateKey, IdentityStore, KeyScope};
use crate::owned_state::{Account, PendingRenewal};
use myagents_agentnet_device_core::{ChallengeOperation, DeviceStore, SessionContext};
use myagents_agentnet_identity_core::{IdentityRequest, IssuerProfile, ServiceKeys};
use serde_json::{json, Value};
use std::os::unix::fs::PermissionsExt;
use std::sync::{atomic::Ordering, Mutex};

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
fn serve(
    listener: std::net::TcpListener,
    tls: rustls::ServerConfig,
    authority: Authority,
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
            let (status, body) = authority.respond(&bytes);
            let body = body.to_string();
            write!(stream,"HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            stream.flush().unwrap();
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
