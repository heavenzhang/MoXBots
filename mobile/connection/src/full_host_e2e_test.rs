//! Explicit original MobileConnection → public WSS → inner TLS → original Host.
//! OS SecureStore is temporary encrypted storage; phone/OS/SSO gates stay open.
use super::*;
use crate::{CryptoError, DevicePrivateKey, KeyScope};
use myagents_agent_network_crypto::EncryptedIdentityStore;
use std::{
    fs,
    io::{Read, Write},
    os::unix::{
        fs::{OpenOptionsExt, PermissionsExt},
        process::CommandExt,
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};

struct Store(EncryptedIdentityStore);
impl IdentityStore for Store {
    fn load(&self, s: &KeyScope) -> Result<DevicePrivateKey, CryptoError> {
        self.0.load(s)
    }
    fn save_pending(&self, s: &KeyScope, k: &DevicePrivateKey) -> Result<(), CryptoError> {
        self.0.save_pending(s, k)
    }
    fn delete(&self, s: &KeyScope) -> Result<(), CryptoError> {
        self.0.delete(s)
    }
}
impl SecureStore for Store {
    fn read_record(&self, s: &str, r: &str) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        self.0
            .load_state(&format!("e2e:{:x}", Sha256::digest(format!("{s}\n{r}"))))
            .map_err(|e| format!("{e:?}"))
    }
    fn write_record(&self, s: &str, r: &str, v: &[u8]) -> Result<(), String> {
        let key = format!("e2e:{:x}", Sha256::digest(format!("{s}\n{r}")));
        let old = self.0.load_state(&key).map_err(|e| format!("{e:?}"))?;
        self.0
            .compare_exchange_state(&key, old.as_deref().map(|v| v.as_slice()), v)
            .map_err(|e| format!("{e:?}"))
    }
    fn remove_record(&self, _: &str, _: &str) -> Result<(), String> {
        Err("fixture does not exercise logout".into())
    }
}
fn private(path: &Path, value: &Value) {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .unwrap();
    f.write_all(&serde_json::to_vec(value).unwrap()).unwrap();
}
async fn wait_json(path: &Path) -> Value {
    let start = std::time::Instant::now();
    loop {
        if let Ok(b) = fs::read(path) {
            if let Ok(v) = serde_json::from_slice(&b) {
                return v;
            }
        }
        assert!(
            start.elapsed() < Duration::from_secs(35),
            "readiness timeout {}",
            path.display()
        );
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}
struct Children(Vec<Child>, PathBuf);
impl Drop for Children {
    fn drop(&mut self) {
        // Let the Node owner reap detached SDK descendants before its own group.
        let _ = fs::write(self.1.join("stop"), b"stop");
        std::thread::sleep(Duration::from_millis(1800));
        for c in self.0.iter_mut().rev() {
            if c.try_wait().ok().flatten().is_none() {
                unsafe {
                    libc::kill(-(c.id() as i32), libc::SIGTERM);
                }
            }
        }
        std::thread::sleep(Duration::from_millis(1800));
        for c in self.0.iter_mut().rev() {
            if c.try_wait().ok().flatten().is_none() {
                unsafe {
                    libc::kill(-(c.id() as i32), libc::SIGKILL);
                }
            }
            let _ = c.wait();
        }
    }
}
fn spawn(children: &mut Children, root: &Path, program: &str, args: &[&str], name: &str) {
    let log = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(root.join(format!("{name}.log")))
        .unwrap();
    #[allow(clippy::disallowed_methods)] // Sole Unix fixture process owner; exact child PGIDs.
    let mut c = Command::new(program);
    c.process_group(0)
        .args(args)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap())
        .env("DEVELOPER_DIR", "/Library/Developer/CommandLineTools")
        .env("HOME", root.join("parent-home"))
        .env("MOXBOTS_FULL_E2E_ROOT", root)
        .stdout(Stdio::from(log.try_clone().unwrap()))
        .stderr(Stdio::from(log));
    let child = c.spawn().unwrap();
    #[allow(clippy::disallowed_methods)]
    let birth = Command::new("/bin/ps")
        .args(["-p", &child.id().to_string(), "-o", "lstart="])
        .output()
        .unwrap();
    eprintln!(
        "fixture-owned-process name={name} pid={} pgid={} birth={}",
        child.id(),
        child.id(),
        String::from_utf8_lossy(&birth.stdout).trim()
    );
    children.0.push(child);
}
fn ok(v: Value) -> Value {
    assert_eq!(v["ok"], true, "native request failed: {v}");
    v["value"].clone()
}
/// Synthetic user setup reads the actual admitted native directory. No target
/// or mount identity is constructed, and default remote exposure must be off.
async fn fixture_mount(owner: &mut MobileConnection, host_device: &str) -> (Value, Value) {
    owner.connect().await.unwrap();
    let c = owner
        .connected
        .as_ref()
        .expect("actual original metadata connection");
    c.identity.account.ensure_current().unwrap();
    let devices = c
        .transport
        .json(
            NetworkRoute::Devices {
                cursor: None,
                limit: 100,
            },
            &c.identity.token,
            None,
        )
        .await
        .unwrap();
    assert_eq!(devices["complete"], true);
    let device = devices["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["deviceId"] == host_device)
        .expect("original Host must occur in actual directory")
        .clone();
    assert_eq!(device["networkId"], c.local.network_id);
    assert_eq!(device["principalId"], c.local.principal_id);
    assert_eq!(device["joined"], true);
    assert_eq!(device["connectionState"], "ready");
    let agents = c
        .transport
        .json(
            NetworkRoute::Agents {
                device_id: host_device,
                cursor: None,
                limit: 100,
            },
            &c.identity.token,
            None,
        )
        .await
        .unwrap();
    assert_eq!(agents["complete"], true);
    let mount = agents["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a["localAgentId"] == "original-host-agent")
        .expect("original Host registry catalog must contain fixture Agent")
        .clone();
    assert_eq!(mount["networkId"], c.local.network_id);
    assert_eq!(mount["principalId"], c.local.principal_id);
    assert_eq!(mount["deviceId"], host_device);
    assert_eq!(mount["enabled"], false);
    assert_eq!(mount["enableRevision"], 0);
    assert!(mount["mountId"].as_str().is_some());
    assert!(device["membershipRevision"].as_u64().is_some());
    c.identity.account.ensure_current().unwrap();
    eprintln!(
        "actual-default-host-mount={}",
        json!({"mountId":mount["mountId"],"deviceId":mount["deviceId"],"localAgentId":mount["localAgentId"],"enabled":mount["enabled"],"enableRevision":mount["enableRevision"],"membershipRevision":device["membershipRevision"]})
    );
    (device, mount)
}
/// Explicit synthetic human action, authorized for this isolated fixture only.
/// Production defaults and the closed application intent surface are unchanged.
async fn authorize_fixture_mount(owner: &mut MobileConnection, host_device: &str) {
    let (device, mount) = fixture_mount(owner, host_device).await;
    let c = owner.connected.as_ref().unwrap();
    c.identity.account.ensure_current().unwrap();
    let mount_id = mount["mountId"].as_str().unwrap();
    let mutation = json!({"mutationId":uuid::Uuid::new_v4().to_string(),"expectedMembershipRevision":device["membershipRevision"],"expectedEnableRevision":mount["enableRevision"],"enabled":true});
    let changed = c
        .transport
        .json(
            NetworkRoute::Mount {
                network_id: &c.local.network_id,
                mount_id,
            },
            &c.identity.token,
            Some(mutation.clone()),
        )
        .await
        .unwrap();
    assert_eq!(changed["mountId"], mount_id);
    assert_eq!(changed["networkId"], c.local.network_id);
    assert_eq!(changed["principalId"], c.local.principal_id);
    assert_eq!(changed["deviceId"], host_device);
    assert_eq!(changed["localAgentId"], "original-host-agent");
    assert_eq!(changed["enabled"], true);
    assert_eq!(
        changed["enableRevision"],
        mount["enableRevision"].as_u64().unwrap() + 1
    );
    // Original idempotent mutation receipt, with no extra grant/revision change.
    let duplicate = c
        .transport
        .json(
            NetworkRoute::Mount {
                network_id: &c.local.network_id,
                mount_id,
            },
            &c.identity.token,
            Some(mutation),
        )
        .await
        .unwrap();
    assert_eq!(duplicate, changed);
    c.identity.account.ensure_current().unwrap();
    eprintln!(
        "explicit-synthetic-user-mount-enabled={}",
        json!({"mountId":changed["mountId"],"enabled":changed["enabled"],"enableRevision":changed["enableRevision"]})
    );
}
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "explicit full chain: requires original service/headless test binaries and Node24; bounded loopback only"]
async fn original_mobile_wss_host_chain() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let root = PathBuf::from(std::env::var_os("HOME").expect("explicit user home parent"))
        .canonicalize()
        .unwrap()
        .join(format!(".mxe-{}", uuid::Uuid::new_v4().simple()));
    fs::create_dir(&root).unwrap();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    fs::create_dir(root.join("parent-home")).unwrap();
    eprintln!("private-fixture-root={}", root.display());
    let mut children = Children(Vec::new(), root.clone());
    let mut tasks = tokio::task::JoinSet::new();
    let result=tokio::time::timeout(Duration::from_secs(130),async{
        let key=rcgen::KeyPair::generate().unwrap();let cert=rcgen::CertificateParams::new(vec!["localhost".into()]).unwrap().self_signed(&key).unwrap();
        let tls=rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider())).with_safe_default_protocol_versions().unwrap().with_no_client_auth().with_single_cert(vec![cert.der().clone()],rustls::pki_types::PrivatePkcs8KeyDer::from(key.serialize_der()).into()).unwrap();
        let public=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let issuer=format!("https://localhost:{}",public.local_addr().unwrap().port());
        fs::write(root.join("public-ca.pem"),cert.pem()).unwrap();fs::set_permissions(root.join("public-ca.pem"),fs::Permissions::from_mode(0o600)).unwrap();private(&root.join("config.json"),&json!({"issuer":issuer}));
        let service=std::env::var("MOXBOTS_FULL_SERVICE_TEST_BIN").expect("build service test binary first");spawn(&mut children,&root,&service,&["server::mobile_full_e2e_fixture::original_relay_service_fixture","--ignored","--exact","--nocapture"],"service");
        let ready=wait_json(&root.join("service-ready.json")).await;let address=ready["address"].as_str().unwrap().to_owned();let acceptor=tokio_rustls::TlsAcceptor::from(Arc::new(tls));
        tasks.spawn(async move{let mut connections=tokio::task::JoinSet::new();loop{let (tcp,_)=public.accept().await.unwrap();let acceptor=acceptor.clone();let address=address.clone();connections.spawn(async move{if let Ok(mut tls)=acceptor.accept(tcp).await{if let Ok(mut service)=tokio::net::TcpStream::connect(address).await{let _=tokio::io::copy_bidirectional(&mut tls,&mut service).await;}}});}});
        let node=std::env::var("MOXBOTS_FULL_NODE").unwrap_or_else(|_|"node".into());let helper=repo.join("scripts/fixtures/mobile-full-e2e-host.ts");spawn(&mut children,&root,&node,&["--import","tsx",helper.to_str().unwrap(),root.to_str().unwrap()],"node");
        let host_ready=wait_json(&root.join("host-ready.json")).await;
        let host=std::env::var("MOXBOTS_FULL_HOST_TEST_BIN").expect("build headless test binary first");spawn(&mut children,&root,&host,&["agent_network::connector::mobile_full_e2e_fixture::original_headless_connector_fixture","--ignored","--exact","--nocapture"],"headless");
        let status=std::time::Instant::now();loop{let v=wait_json(&root.join("headless-status.json")).await;if v["ready"]==true{break;}assert!(status.elapsed()<Duration::from_secs(35),"headless not ready: {v}");tokio::time::sleep(Duration::from_millis(100)).await;}
        if std::env::var("MOXBOTS_FULL_TIMEOUT_CHECK").as_deref()==Ok("1") {
            eprintln!("explicit-timeout-cleanup-fixture-ready");
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
        let state=root.join("mobile-state");fs::create_dir(&state).unwrap();fs::set_permissions(&state,fs::Permissions::from_mode(0o700)).unwrap();let mut kek=[0u8;32];fs::File::open("/dev/urandom").unwrap().read_exact(&mut kek).unwrap();
        let store=Arc::new(Store(EncryptedIdentityStore::for_test(&state,&kek).unwrap()));let mut owner=MobileConnection::new(NativeConfig{issuer,public_tls_ca:Some(cert.pem())},store).unwrap();
        ok(owner.request(json!({"version":1,"kind":"account.login.start"})).await);let account=ok(owner.request(json!({"version":1,"kind":"account.login.poll"})).await);assert_eq!(account["state"],"signed-in");
        let host_device=host_ready["deviceId"].as_str().unwrap();
        fixture_mount(&mut owner,host_device).await;
        let disabled=ok(owner.request(json!({"version":1,"kind":"targets.list"})).await);eprintln!("actual-default-mobile-targets={disabled}");assert!(disabled["items"].as_array().unwrap().is_empty());
        assert!(std::env::var("MOXBOTS_FULL_KEEP_MOUNT_DISABLED").as_deref()!=Ok("1"),"ORIGINAL_HOST_MOUNT_DISABLED: real catalog present; explicit synthetic-user mount authorization intentionally withheld");
        authorize_fixture_mount(&mut owner,host_device).await;
        let targets=ok(owner.request(json!({"version":1,"kind":"targets.list"})).await);eprintln!("actual-mobile-targets={targets}");
        let target=targets["items"].as_array().unwrap().iter().find(|v|v["agentId"]=="original-host-agent").expect("original explicitly authorized Host Agent must be discovered through the actual directory");
        let operation_id=uuid::Uuid::new_v4().to_string();
        let start_intent=json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.start","version":1,"agentId":"original-host-agent","operationId":operation_id,"text":"Original E2EE WSS first turn.","assetIds":[]}});
        let first=ok(owner.request(start_intent.clone()).await);
        assert_eq!(first["kind"],"mobile.receipt");
        let receipt_deadline=std::time::Instant::now();
        let receipt=loop {
            let current=ok(owner.request(json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.receipt","version":1,"agentId":"original-host-agent","operationId":operation_id}})).await);
            assert_eq!(current["kind"],"mobile.receipt");
            if current["status"]=="accepted" {break current;}
            assert!(current["status"]!="rejected" && current["status"]!="unconfirmed","original start rejected: {current}");
            assert!(receipt_deadline.elapsed()<Duration::from_secs(35),"original start receipt absent: {current}");
            tokio::time::sleep(Duration::from_millis(100)).await;
        };
        eprintln!("actual-encrypted-mobile-receipt={receipt}");assert!(receipt["sessionId"].as_str().is_some());
        let terminal_deadline=std::time::Instant::now();
        loop {
            let snapshot=ok(owner.request(json!({"version":1,"kind":"session","targetId":target["targetId"],"request":{"kind":"get","agentId":"original-host-agent","sessionId":receipt["sessionId"],"limit":30}})).await);
            if snapshot["state"]=="idle" && snapshot["terminal"]=="complete" {
                assert!(snapshot["messages"].to_string().contains("Original Host local supplier completion"));
                eprintln!("actual-original-session-terminal={snapshot}");break;
            }
            assert!(terminal_deadline.elapsed()<Duration::from_secs(35),"original session terminal absent: {snapshot}");
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        // Native journal requires read-only receipt recovery for a known
        // mutation; it must not replay even an already accepted business intent.
        let duplicate=owner.request(start_intent).await;
        assert_eq!(duplicate["ok"],false);
        assert_eq!(duplicate["error"]["code"],"MOBILE_RECEIPT_REQUIRED");
        let recovered=ok(owner.request(json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.receipt","version":1,"agentId":"original-host-agent","operationId":operation_id}})).await);
        assert_eq!(recovered,receipt,"same original operation is queried without redispatch");
        fs::write(root.join("stop"),b"stop").unwrap();let actual=wait_json(&root.join("host-result.json")).await;assert_eq!(actual["calls"],1);assert!(actual["sessions"].as_array().unwrap().iter().any(|s|s["id"]==receipt["sessionId"]));
    }).await;
    tasks.abort_all();
    while tasks.join_next().await.is_some() {}
    drop(children);
    assert!(
        result.is_ok(),
        "full chain exceeded bounded deadline; private evidence at {}",
        root.display()
    );
}
