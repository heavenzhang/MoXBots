//! Actual publish → Node private IPC → pinned TLS bridge → real service owners.
use super::*;
use crate::{
    agent_network::{
        crypto,
        owned_login::{OwnedClient, OwnedInstance},
    },
    management_ipc::ManagementIpcConfig,
    owned_state::{Owner, Scope},
};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::Instant,
};

/// Headless has no GUI process_cmd module. Its Unix-only test fixture owns an
/// exact birth PGID (including cargo/esbuild descendants), never an argv match.
fn fixture_command(program: &str) -> Command {
    use std::os::unix::process::CommandExt;
    #[allow(clippy::disallowed_methods)] // Sole command owner in this Unix-only test adapter.
    let mut command = Command::new(program);
    command.process_group(0);
    command
}
fn stop_process(child: &mut Child) {
    let pgid = child.id() as i32;
    unsafe {
        libc::kill(-pgid, libc::SIGTERM);
    }
    thread::sleep(Duration::from_millis(40));
    unsafe {
        libc::kill(-pgid, libc::SIGKILL);
    }
    let _ = child.wait();
}
struct Processes(Vec<Child>, PathBuf);
impl Drop for Processes {
    fn drop(&mut self) {
        let _ = fs::write(self.1.join("service-stop"), b"stop");
        let _ = fs::write(self.1.join("node-stop"), b"stop");
        thread::sleep(Duration::from_millis(100));
        for child in &mut self.0 {
            stop_process(child);
        }
    }
}
struct BridgeGuard {
    live: Arc<AtomicBool>,
    task: Option<thread::JoinHandle<()>>,
}
impl Drop for BridgeGuard {
    fn drop(&mut self) {
        self.live.store(false, Ordering::Release);
        if let Some(task) = self.task.take() {
            let _ = task.join();
        }
    }
}
fn private_json(path: &Path, value: &Value) {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(&temporary)
        .unwrap();
    file.write_all(&serde_json::to_vec(value).unwrap()).unwrap();
    drop(file);
    fs::rename(temporary, path).unwrap();
}
async fn wait_json(path: &Path) -> Value {
    let start = Instant::now();
    loop {
        if let Ok(bytes) = fs::read(path) {
            if let Ok(value) = serde_json::from_slice(&bytes) {
                return value;
            }
        }
        assert!(
            start.elapsed() < Duration::from_secs(120),
            "fixture readiness timed out: {}",
            path.display()
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
fn spawn_node(repo: &Path, root: &Path, observe: bool) -> Child {
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("node.log"))
        .unwrap();
    let mut c = fixture_command("node");
    let node_home = root.join("node-home");
    fs::create_dir_all(&node_home).unwrap();
    fs::set_permissions(&node_home, fs::Permissions::from_mode(0o700)).unwrap();
    c.env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap())
        .env("HOME", node_home);
    c.current_dir(repo)
        .args(["--import", "tsx"])
        .arg(repo.join("src/test/fixtures/host-notification-combined-node.ts"))
        .arg(root);
    if observe {
        c.arg("observe");
    }
    c.stdout(Stdio::from(log.try_clone().unwrap()))
        .stderr(Stdio::from(log));
    c.spawn().unwrap()
}
async fn stop_node(
    children: &mut Processes,
    root: &Path,
    ipc: &ManagementIpc,
    authority: &LocalSourceAuthority,
) {
    let mut child = children.0.pop().unwrap();
    stop_process(&mut child);
    let _ = fs::remove_file(root.join("node-ready"));
    tokio::time::sleep(Duration::from_millis(30)).await;
    // Original transport must observe the old EOF before accepting replacement.
    let _ = peek(ipc, authority).await;
}
fn node_disk(root: &Path) -> Value {
    let files: Vec<_> = fs::read_dir(root.join("node-outbox"))
        .unwrap()
        .map(Result::unwrap)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|v| v == "json"))
        .collect();
    assert_eq!(files.len(), 1);
    serde_json::from_slice(&fs::read(&files[0]).unwrap()).unwrap()
}
async fn service_command(root: &Path, operation: &str) -> Value {
    let id = uuid::Uuid::new_v4().to_string();
    private_json(
        &root.join("service-command.json"),
        &json!({"id":id,"operation":operation}),
    );
    let start = Instant::now();
    loop {
        let result = wait_json(&root.join("service-result.json")).await;
        if result["id"] == id {
            return result;
        }
        assert!(start.elapsed() < Duration::from_secs(5));
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

async fn ready_hint(ipc: &ManagementIpc, authority: &LocalSourceAuthority) -> Option<Hint> {
    let start = Instant::now();
    loop {
        match peek(ipc, authority).await {
            Ok(value) => return value,
            Err(error) => {
                assert!(
                    start.elapsed() < Duration::from_secs(8),
                    "private IPC reconnect failed: {}",
                    error.code
                );
                tokio::time::sleep(Duration::from_millis(30)).await;
            }
        }
    }
}

/// TLS terminates only in this explicit test transport. All HTTP source routes
/// pass verbatim to MobileNotificationService/AuthStore/DeviceStore/SQLite.
fn tls_bridge(
    listener: TcpListener,
    tls: rustls::ServerConfig,
    address: String,
    live: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
    listener.set_nonblocking(true).unwrap();
    thread::spawn(move || {
        while live.load(Ordering::Acquire) {
            match listener.accept() {
                Ok((socket, _)) => {
                    let tls = tls.clone();
                    let address = address.clone();
                    thread::spawn(move || {
                        socket.set_nonblocking(false).unwrap();
                        socket
                            .set_read_timeout(Some(Duration::from_secs(10)))
                            .unwrap();
                        let mut stream = rustls::StreamOwned::new(
                            rustls::ServerConnection::new(Arc::new(tls)).unwrap(),
                            socket,
                        );
                        let mut bytes = Vec::new();
                        let end = loop {
                            let mut b = [0; 4096];
                            let n = match stream.read(&mut b) {
                                Ok(n) if n > 0 => n,
                                Ok(_) => return,
                                Err(e) => panic!("fixture TLS read failed: {e}"),
                            };
                            bytes.extend_from_slice(&b[..n]);
                            assert!(bytes.len() <= 32 * 1024);
                            if let Some(pos) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                                let h = std::str::from_utf8(&bytes[..pos]).unwrap();
                                let size = h
                                    .lines()
                                    .find_map(|l| {
                                        let (k, v) = l.split_once(':')?;
                                        k.eq_ignore_ascii_case("content-length")
                                            .then(|| v.trim().parse::<usize>().unwrap())
                                    })
                                    .unwrap_or(0);
                                if bytes.len() >= pos + 4 + size {
                                    break pos;
                                }
                            }
                        };
                        let head = std::str::from_utf8(&bytes[..end]).unwrap();
                        let mut request = head
                            .lines()
                            .filter(|l| !l.to_ascii_lowercase().starts_with("connection:"))
                            .collect::<Vec<_>>()
                            .join("\r\n")
                            .into_bytes();
                        request.extend(b"\r\nConnection: close\r\n\r\n");
                        request.extend(&bytes[end + 4..]);
                        let mut upstream = TcpStream::connect(address).unwrap();
                        upstream
                            .set_read_timeout(Some(Duration::from_secs(10)))
                            .unwrap();
                        upstream.write_all(&request).unwrap();
                        let mut response = Vec::new();
                        upstream.read_to_end(&mut response).unwrap();
                        eprintln!(
                            "fixture TLS bridge forwarded response bytes={}",
                            response.len()
                        );
                        let _ = stream.write_all(&response);
                        let _ = stream.flush();
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5))
                }
                Err(_) => break,
            }
        }
    })
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "explicit full Node/native/service loopback acceptance"]
async fn actual_publish_private_node_source_real_service_restart_ack_loss_and_revocation() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let home = PathBuf::from(std::env::var_os("HOME").unwrap())
        .canonicalize()
        .unwrap();
    let dir = tempfile::Builder::new()
        .prefix("sc-")
        .tempdir_in(&home)
        .unwrap();
    let root = dir.keep().canonicalize().unwrap();
    eprintln!("private combined fixture root: {}", root.display());
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    let key = Arc::new(crypto::DevicePrivateKey::generate().unwrap());
    let device = uuid::Uuid::new_v4().to_string();
    let certified = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let ca = certified.cert.pem();
    let tls = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .unwrap()
    .with_no_client_auth()
    .with_single_cert(
        vec![certified.cert.der().clone()],
        rustls::pki_types::PrivatePkcs8KeyDer::from(certified.signing_key.serialize_der()).into(),
    )
    .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!(
        "https://localhost:{}",
        listener.local_addr().unwrap().port()
    );
    let mut jwk = key.public_jwk().unwrap();
    jwk["kid"] = json!("source-fixture");
    jwk["alg"] = json!("ES256");
    jwk["use"] = json!("sig");
    let instance = OwnedInstance {
        version: 1,
        profile: "owned-device-relay-v1".into(),
        service_id: uuid::Uuid::new_v4().to_string(),
        environment: "development".into(),
        network_id: uuid::Uuid::new_v4().to_string(),
        name: "isolated combined source".into(),
        issuer: origin.clone(),
        login_issuer: "https://isolated-login.invalid/dex".into(),
        protocol: 1,
        capabilities: vec!["tls13-mtls".into()],
        root_certificate: crypto::tests::Fixture::new().ca.pem(),
        jwks: json!({"keys":[jwk]}),
    };
    private_json(
        &root.join("service-config.json"),
        &json!({"deviceId":device,"csr":key.csr().unwrap(),"instance":instance}),
    );
    let log = fs::File::create(root.join("service.log")).unwrap();
    let mut children = Processes(
        vec![fixture_command("cargo")
            .env("DEVELOPER_DIR", "/Library/Developer/CommandLineTools")
            .env("MOXBOTS_SOURCE_COMBINED_ROOT", &root)
            .current_dir(&repo)
            .args([
                "test",
                "--manifest-path",
                "services/agentnet/Cargo.toml",
                "--locked",
                "--offline",
                "actual_host_source_service_fixture",
                "--",
                "--ignored",
                "--nocapture",
            ])
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap()],
        root.clone(),
    );
    let ready = wait_json(&root.join("service-ready.json")).await;
    let live = Arc::new(AtomicBool::new(true));
    let bridge = BridgeGuard {
        live: live.clone(),
        task: Some(tls_bridge(
            listener,
            tls,
            ready["address"].as_str().unwrap().into(),
            live.clone(),
        )),
    };
    let native_root = root.join("native");
    fs::create_dir(&native_root).unwrap();
    fs::set_permissions(&native_root, fs::Permissions::from_mode(0o700)).unwrap();
    let store =
        Arc::new(crypto::EncryptedIdentityStore::for_test(&native_root, &[41; 32]).unwrap());
    let owner = Arc::new(Owner {
        store: store.clone(),
        scope: Scope {
            issuer: origin.clone(),
            service_id: instance.service_id.clone(),
            environment: instance.environment.clone(),
            network_id: instance.network_id.clone(),
            device_id: device.clone(),
        },
        trust_fingerprint: "a".repeat(64),
    });
    let (mut state, old) = owner.read().unwrap();
    let now = jsonwebtoken::get_current_timestamp();
    state.begin("x".repeat(43), now);
    state.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
    let attempt = state.revision.clone();
    state.claim_poll(&attempt, now).unwrap();
    state
        .publish_account(
            &attempt,
            ready["session"]["principalId"].as_str().unwrap().into(),
            ready["token"].as_str().unwrap().into(),
            ready["session"]["expiresAt"].as_u64().unwrap(),
            now,
        )
        .unwrap();
    owner
        .commit(old.as_deref().map(|v| v.as_slice()), &state)
        .unwrap();
    let connection = Connection {
        client: OwnedClient::pinned(instance.clone(), Some(&ca)).unwrap(),
        instance: instance.clone(),
        owner,
        public_ca: Some(ca),
    };
    let account = connection.account(false).await.unwrap();
    let binding = crate::management_admission::authorize(&connection.owner, &account).unwrap();
    let identity =
        NetworkIdentity::source_fixture(account, key, ready["deviceGeneration"].as_u64().unwrap())
            .unwrap();
    let authority = LocalSourceAuthority {
        connection: myagents_agent_network_protocol::ConnectionScope {
            service_id: instance.service_id.clone(),
            network_id: instance.network_id.clone(),
            boot_epoch: uuid::Uuid::new_v4().to_string(),
            connection_epoch: uuid::Uuid::new_v4().to_string(),
        },
        local: myagents_agent_network_protocol::DeviceScope {
            service_id: instance.service_id.clone(),
            environment: instance.environment.clone(),
            network_id: instance.network_id.clone(),
            principal_id: ready["session"]["principalId"].as_str().unwrap().into(),
            device_id: device.clone(),
            key_generation: ready["deviceGeneration"].as_u64().unwrap(),
        },
        account_binding: identity.account.binding_id().into(),
        management_binding: binding.account_binding().into(),
    };
    let ipc_dir = root.join("ipc");
    fs::create_dir(&ipc_dir).unwrap();
    fs::set_permissions(&ipc_dir, fs::Permissions::from_mode(0o750)).unwrap();
    let config = ManagementIpcConfig {
        socket: ipc_dir.join("s"),
        asset_root: ipc_dir.join("assets"),
        host_uid: unsafe { libc::geteuid() },
        management_gid: unsafe { libc::getegid() },
    };
    let ipc = ManagementIpc::bind_source_fixture(&config).unwrap();
    let pointer = json!({"agentId":"agent:combined","sessionId":uuid::Uuid::new_v4().to_string(),"workerGeneration":uuid::Uuid::new_v4().to_string(),"observation":"terminal:original-1"});
    private_json(
        &root.join("node-config.json"),
        &json!({"socket":config.socket,"deviceId":device,"authority":authority,"pointer":pointer}),
    );
    fs::write(root.join("ack-mode"), "before").unwrap();
    children.0.push(spawn_node(&repo, &root, true));
    wait_json(&root.join("node-ready")).await;
    let first = ready_hint(&ipc, &authority).await.unwrap();
    assert!(publish(&connection, &ipc, &binding, &identity, &authority)
        .await
        .is_err());
    let stats = service_command(&root, "stats").await;
    assert_eq!(stats["events"].as_array().unwrap().len(), 1);
    let original_event = stats["events"][0]["eventId"].clone();
    assert_eq!(stats["events"][0]["sourceEventId"], first.source_event_id);
    stop_node(&mut children, &root, &ipc, &authority).await;
    fs::write(root.join("ack-mode"), "normal").unwrap();
    children.0.push(spawn_node(&repo, &root, false));
    wait_json(&root.join("node-ready")).await;
    assert!(ready_hint(&ipc, &authority).await.as_ref() == Some(&first));
    assert!(publish(&connection, &ipc, &binding, &identity, &authority)
        .await
        .unwrap());
    let repeated = service_command(&root, "stats").await;
    assert_eq!(repeated["events"].as_array().unwrap().len(), 1);
    assert_eq!(repeated["events"][0]["eventId"], original_event);
    let received = node_disk(&root);
    let confirmed = received["confirmed"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["sourceEventId"] == first.source_event_id)
        .unwrap();
    assert_eq!(confirmed["eventId"], original_event);
    let proofs: Vec<_> = repeated["proofs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|v| v["sourceEventId"] == first.source_event_id)
        .collect();
    assert_eq!(proofs.len(), 2);
    for proof in proofs {
        assert_eq!(proof["state"], "finalized");
        assert_eq!(proof["eventId"], original_event);
        assert_eq!(proof["connectionEpoch"], first.connection_epoch);
        assert_eq!(proof["agentId"], first.agent_id);
        assert_eq!(proof["sessionId"], first.session_id);
    }

    stop_node(&mut children, &root, &ipc, &authority).await;
    children.0.push(spawn_node(&repo, &root, false));
    wait_json(&root.join("node-ready")).await;
    assert!(!publish(&connection, &ipc, &binding, &identity, &authority)
        .await
        .unwrap());
    // Loss after Node's durable ACK must also survive restart without a new
    // event or another source publication. This differs from pre-ACK loss above.
    stop_node(&mut children, &root, &ipc, &authority).await;
    let mut after_ack_pointer = pointer.clone();
    after_ack_pointer["observation"] = json!("terminal:after-durable-ack");
    private_json(
        &root.join("node-config.json"),
        &json!({"socket":config.socket,"deviceId":device,"authority":authority,"pointer":after_ack_pointer}),
    );
    fs::write(root.join("ack-mode"), "after").unwrap();
    children.0.push(spawn_node(&repo, &root, true));
    wait_json(&root.join("node-ready")).await;
    let after_ack_hint = ready_hint(&ipc, &authority).await.unwrap();
    assert!(publish(&connection, &ipc, &binding, &identity, &authority)
        .await
        .is_err());
    let ack_lost = service_command(&root, "stats").await;
    assert_eq!(ack_lost["events"].as_array().unwrap().len(), 2);
    assert!(ack_lost["events"]
        .as_array()
        .unwrap()
        .iter()
        .any(|event| event["sourceEventId"] == after_ack_hint.source_event_id));
    let event_after_ack = ack_lost["events"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["sourceEventId"] == after_ack_hint.source_event_id)
        .unwrap();
    let acked_disk = node_disk(&root);
    let acked = acked_disk["confirmed"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["sourceEventId"] == after_ack_hint.source_event_id)
        .unwrap();
    assert_eq!(acked["eventId"], event_after_ack["eventId"]);
    stop_node(&mut children, &root, &ipc, &authority).await;
    fs::write(root.join("ack-mode"), "normal").unwrap();
    children.0.push(spawn_node(&repo, &root, false));
    wait_json(&root.join("node-ready")).await;
    assert!(!publish(&connection, &ipc, &binding, &identity, &authority)
        .await
        .unwrap());
    assert_eq!(
        service_command(&root, "stats").await["events"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    // Another original observation is persisted, then actual AuthStore revoke
    // denies fresh-account HTTP before signing or ACK; pending pointer survives.
    stop_node(&mut children, &root, &ipc, &authority).await;
    let mut changed = pointer.clone();
    changed["observation"] = json!("terminal:original-2");
    private_json(
        &root.join("node-config.json"),
        &json!({"socket":config.socket,"deviceId":device,"authority":authority,"pointer":changed}),
    );
    children.0.push(spawn_node(&repo, &root, true));
    wait_json(&root.join("node-ready")).await;
    let pending = ready_hint(&ipc, &authority).await.unwrap();
    service_command(&root, "revoke").await;
    assert!(publish(&connection, &ipc, &binding, &identity, &authority)
        .await
        .is_err());
    assert!(ready_hint(&ipc, &authority).await.as_ref() == Some(&pending));
    let revoked = service_command(&root, "stats").await;
    assert_eq!(revoked["events"].as_array().unwrap().len(), 2);
    let mut wrong_generation = authority.clone();
    wrong_generation.local.key_generation += 1;
    assert!(
        publish(&connection, &ipc, &binding, &identity, &wrong_generation)
            .await
            .is_err()
    );
    assert_eq!(
        wait_json(&root.join("execution-count.json")).await["count"],
        0
    );
    eprintln!("combined source accepted: actual publish, private Node IPC, pinned TLS → actual AuthStore/DeviceStore/notification router; immutable sourceEventId/epoch/pointer restart retry retained same service eventId; loss after durable ACK restarted empty without republish; real bearer revocation and local wrong-generation rejected; Session executors absent");
    fs::write(root.join("service-stop"), b"stop").unwrap();
    drop(bridge);
    drop(children);
    fs::remove_dir_all(&root).unwrap();
}
