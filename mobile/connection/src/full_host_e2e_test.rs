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
impl Store {
    fn save_record(&self, s: &str, r: &str, value: &[u8]) -> Result<(), String> {
        let key = format!("e2e:{:x}", Sha256::digest(format!("{s}\n{r}")));
        let old = self.0.load_state(&key).map_err(|e| format!("{e:?}"))?;
        self.0
            .compare_exchange_state(&key, old.as_deref().map(|v| v.as_slice()), value)
            .map_err(|e| format!("{e:?}"))
    }
}
impl SecureStore for Store {
    fn read_record(&self, s: &str, r: &str) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        let loaded = self
            .0
            .load_state(&format!("e2e:{:x}", Sha256::digest(format!("{s}\n{r}"))))
            .map_err(|e| format!("{e:?}"))?;
        match loaded {
            None => Ok(None),
            Some(value) => match value.first() {
                Some(0) if value.len() == 1 => Ok(None),
                Some(1) => Ok(Some(Zeroizing::new(value[1..].to_vec()))),
                _ => Err("fixture encrypted record envelope corrupt".into()),
            },
        }
    }
    fn write_record(&self, s: &str, r: &str, value: &[u8]) -> Result<(), String> {
        let mut present = Zeroizing::new(Vec::with_capacity(value.len() + 1));
        present.push(1);
        present.extend_from_slice(value);
        self.save_record(s, r, &present)
    }
    fn remove_record(&self, s: &str, r: &str) -> Result<(), String> {
        // Authenticated tombstone under original durable CAS. Presence bytes
        // distinguish missing from an existing empty record; no filesystem bypass.
        self.save_record(s, r, &[0])
    }
}

#[test]
fn fixture_encrypted_store_preserves_binary_empty_delete_and_rewrite() {
    let root = PathBuf::from(std::env::var_os("HOME").unwrap())
        .canonicalize()
        .unwrap()
        .join(format!(".mxe-store-{}", uuid::Uuid::new_v4().simple()));
    fs::create_dir(&root).unwrap();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    let mut kek = [0; 32];
    fs::File::open("/dev/urandom")
        .unwrap()
        .read_exact(&mut kek)
        .unwrap();
    let store = Store(EncryptedIdentityStore::for_test(&root, &kek).unwrap());
    assert!(store.read_record("scope", "record").unwrap().is_none());
    let binary = [0, 255, 1, 0, 128];
    store.write_record("scope", "record", &binary).unwrap();
    assert_eq!(
        store
            .read_record("scope", "record")
            .unwrap()
            .unwrap()
            .as_slice(),
        binary
    );
    store.write_record("scope", "record", b"").unwrap();
    assert_eq!(
        store
            .read_record("scope", "record")
            .unwrap()
            .unwrap()
            .as_slice(),
        b""
    );
    store.remove_record("scope", "record").unwrap();
    assert!(store.read_record("scope", "record").unwrap().is_none());
    store.write_record("scope", "record", &binary).unwrap();
    assert_eq!(
        store
            .read_record("scope", "record")
            .unwrap()
            .unwrap()
            .as_slice(),
        binary
    );
    assert!(store
        .read_record("other-scope", "record")
        .unwrap()
        .is_none());
}
// The raw C handle never crosses a thread boundary. Only owned DTOs and reply
// channels cross; the encrypted callback context remains alive through free.
enum FfiCommand {
    Request(Value, tokio::sync::oneshot::Sender<Value>),
    Mount(String, bool, tokio::sync::oneshot::Sender<()>),
}
struct FfiOwner {
    commands: Option<std::sync::mpsc::Sender<FfiCommand>>,
    caller: Option<std::thread::JoinHandle<()>>,
}
unsafe extern "C" fn ffi_store_read(
    context: *mut std::ffi::c_void,
    scope: *const u8,
    scope_len: usize,
    record: *const u8,
    record_len: usize,
    out: *mut u8,
    capacity: usize,
) -> i64 {
    let store = &*(context as *const Store);
    let scope = std::str::from_utf8(std::slice::from_raw_parts(scope, scope_len)).unwrap();
    let record = std::str::from_utf8(std::slice::from_raw_parts(record, record_len)).unwrap();
    match store.read_record(scope, record) {
        Ok(None) => -1,
        Ok(Some(bytes)) if bytes.len() <= capacity => {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), out, bytes.len());
            bytes.len() as i64
        }
        _ => -2,
    }
}
unsafe extern "C" fn ffi_store_write(
    context: *mut std::ffi::c_void,
    scope: *const u8,
    scope_len: usize,
    record: *const u8,
    record_len: usize,
    bytes: *const u8,
    len: usize,
) -> i32 {
    let store = &*(context as *const Store);
    let scope = std::str::from_utf8(std::slice::from_raw_parts(scope, scope_len)).unwrap();
    let record = std::str::from_utf8(std::slice::from_raw_parts(record, record_len)).unwrap();
    if store
        .write_record(scope, record, std::slice::from_raw_parts(bytes, len))
        .is_ok()
    {
        0
    } else {
        -1
    }
}
unsafe extern "C" fn ffi_store_remove(
    context: *mut std::ffi::c_void,
    scope: *const u8,
    scope_len: usize,
    record: *const u8,
    record_len: usize,
) -> i32 {
    let store = &*(context as *const Store);
    let scope = std::str::from_utf8(std::slice::from_raw_parts(scope, scope_len)).unwrap();
    let record = std::str::from_utf8(std::slice::from_raw_parts(record, record_len)).unwrap();
    if store.remove_record(scope, record).is_ok() {
        0
    } else {
        -1
    }
}
impl FfiOwner {
    async fn new(config: NativeConfig, store: Arc<Store>) -> Self {
        let (commands, receive) = std::sync::mpsc::channel();
        let (ready, readiness) = tokio::sync::oneshot::channel();
        let caller = std::thread::Builder::new()
            .name("mobile-cabi-512k".into())
            .stack_size(512 * 1024)
            .spawn(move || {
                use crate::ffi::*;
                observe_stack("cabi-caller-before-new");
                let callbacks = MoxConnectionStore {
                    context: Arc::as_ptr(&store) as *mut std::ffi::c_void,
                    read: ffi_store_read,
                    write: ffi_store_write,
                    remove: ffi_store_remove,
                };
                let config = serde_json::to_vec(
                    &json!({"issuer":config.issuer,"publicTlsCa":config.public_tls_ca}),
                )
                .unwrap();
                let mut error = MoxConnectionBuffer {
                    data: std::ptr::null_mut(),
                    len: 0,
                    status: 0,
                };
                let handle = unsafe {
                    mox_connection_new(config.as_ptr(), config.len(), callbacks, &mut error)
                };
                if handle.is_null() {
                    let value: Value = unsafe {
                        serde_json::from_slice(std::slice::from_raw_parts(error.data, error.len))
                            .unwrap()
                    };
                    unsafe { mox_connection_buffer_free(error) };
                    panic!("original C ABI new failed: {value}");
                }
                // Local guard stays on this caller thread and never gains
                // Send/Sync; ordinary assertion unwinding still releases owner.
                struct Handle(*mut MoxConnection);
                impl Drop for Handle {
                    fn drop(&mut self) {
                        unsafe { mox_connection_free(self.0) };
                    }
                }
                let handle = Handle(handle);
                ready.send(()).unwrap();
                for command in receive {
                    match command {
                        FfiCommand::Request(value, reply) => {
                            eprintln!("cabi-probe-input-kind={}", value["kind"]);
                            let bytes = serde_json::to_vec(&value).unwrap();
                            let result = unsafe {
                                mox_connection_request(handle.0, bytes.as_ptr(), bytes.len())
                            };
                            let value: Value = unsafe {
                                serde_json::from_slice(std::slice::from_raw_parts(
                                    result.data,
                                    result.len,
                                ))
                                .unwrap()
                            };
                            let status = result.status;
                            unsafe { mox_connection_buffer_free(result) };
                            assert_eq!(status == 0, value["ok"] == true);
                            reply.send(value).unwrap();
                        }
                        FfiCommand::Mount(host, authorize, reply) => {
                            eprintln!(
                                "cabi-probe-test-setup mount-authorize={authorize} stage=begin"
                            );
                            unsafe { &mut *handle.0 }.fixture_owner_operation(move |owner| {
                                Box::pin(async move {
                                    if authorize {
                                        authorize_fixture_mount(owner, &host).await;
                                    } else {
                                        fixture_mount(owner, &host).await;
                                    }
                                })
                            });
                            eprintln!(
                                "cabi-probe-test-setup mount-authorize={authorize} stage=complete"
                            );
                            reply.send(()).unwrap();
                        }
                    }
                }
                drop(handle);
                drop(store);
                eprintln!("cabi-probe-handle-freed=true");
            })
            .unwrap();
        readiness.await.unwrap();
        Self {
            commands: Some(commands),
            caller: Some(caller),
        }
    }
    async fn request(&self, value: Value) -> Value {
        let (reply, result) = tokio::sync::oneshot::channel();
        self.commands
            .as_ref()
            .unwrap()
            .send(FfiCommand::Request(value, reply))
            .unwrap();
        result.await.unwrap()
    }
    async fn mount(&self, host: &str, authorize: bool) {
        let (reply, result) = tokio::sync::oneshot::channel();
        self.commands
            .as_ref()
            .unwrap()
            .send(FfiCommand::Mount(host.into(), authorize, reply))
            .unwrap();
        result.await.unwrap();
    }
}
impl Drop for FfiOwner {
    fn drop(&mut self) {
        drop(self.commands.take());
        self.caller.take().unwrap().join().unwrap();
    }
}
enum FixtureOwner {
    Direct(Box<MobileConnection>),
    Ffi(FfiOwner),
}
impl FixtureOwner {
    async fn host_address(
        &mut self,
        host: &str,
    ) -> Option<crate::agent_network::transport::DeviceAddress> {
        let Self::Direct(owner) = self else {
            panic!("short renewal acceptance uses the original native owner");
        };
        owner.connect().await.unwrap();
        let connection = owner.connected.as_ref().unwrap();
        connection
            .transport
            .device_address(&connection.identity.token, &connection.local, host)
            .await
            .ok()
    }
    async fn request(&mut self, value: Value) -> Value {
        match self {
            Self::Direct(owner) => owner.request(value).await,
            Self::Ffi(owner) => owner.request(value).await,
        }
    }
    async fn mount(&mut self, host: &str, authorize: bool) {
        match self {
            Self::Direct(owner) => {
                if authorize {
                    authorize_fixture_mount(owner, host).await;
                } else {
                    fixture_mount(owner, host).await;
                }
            }
            Self::Ffi(owner) => owner.mount(host, authorize).await,
        }
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

/// Use the fixture's original login and enrollment APIs to create one extra
/// joined device, then close its actual relay socket so its directory row is
/// offline while the primary test owner still sees a Ready Host.
async fn create_joined_offline_peer(root: &Path, issuer: &str, ca: &str) -> String {
    let state = root.join("offline-peer-state");
    fs::create_dir(&state).unwrap();
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
    let mut kek = [0u8; 32];
    fs::File::open("/dev/urandom")
        .unwrap()
        .read_exact(&mut kek)
        .unwrap();
    let store = Arc::new(Store(
        EncryptedIdentityStore::for_test(&state, &kek).unwrap(),
    ));
    let mut peer = MobileConnection::new(
        NativeConfig {
            issuer: issuer.into(),
            public_tls_ca: Some(ca.into()),
        },
        store,
    )
    .unwrap();
    ok(peer
        .request(json!({"version":1,"kind":"account.login.start"}))
        .await);
    let account = ok(peer
        .request(json!({"version":1,"kind":"account.login.poll"}))
        .await);
    assert_eq!(account["state"], "signed-in");
    peer.connect()
        .await
        .expect("second same-account fixture device joins through original admission");
    let mut connected = peer.connected.take().expect("fixture peer connection");
    let device_id = connected.local.device_id.clone();
    connected
        .socket
        .close(None)
        .await
        .expect("close fixture peer relay socket");
    device_id
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
fn observe_stack(stage: &str) {
    let current = std::thread::current();
    #[cfg(target_os = "macos")]
    unsafe {
        let thread = libc::pthread_self();
        let size = libc::pthread_get_stacksize_np(thread);
        let top = libc::pthread_get_stackaddr_np(thread) as usize;
        let marker = 0u8;
        let used = top.saturating_sub((&marker as *const u8) as usize);
        eprintln!("fixture-thread-stack stage={stage} name={:?} sizeBytes={size} approximateRemainingBytes={}",current.name().unwrap_or("unnamed"),size.saturating_sub(used));
    }
    #[cfg(not(target_os = "macos"))]
    eprintln!(
        "fixture-thread-stack stage={stage} name={:?} sizeBytes=unavailable",
        current.name().unwrap_or("unnamed")
    );
}
async fn asset_request(owner: &mut MobileConnection, target: &Value, mut request: Value) -> Value {
    observe_stack("asset-request-before-native");
    request["version"] = json!(1);
    request["agentId"] = json!("original-host-agent");
    let result = ok(owner
        .request(
            json!({"version":1,"kind":"assets","targetId":target["targetId"],"request":request}),
        )
        .await);
    assert_ne!(
        result["kind"], "error",
        "original asset request rejected: {result}"
    );
    result
}
async fn attachment_continuation(
    owner: &mut MobileConnection,
    target: &Value,
    receipt: &Value,
    root: &Path,
) {
    observe_stack("attachment-phase-poll");
    let manifest: Vec<Value> =
        serde_json::from_slice(&fs::read(root.join("fixture-inputs/manifest.json")).unwrap())
            .unwrap();
    assert_eq!(manifest.len(), 2);
    let capabilities = asset_request(owner, target, json!({"kind":"capabilities"})).await;
    assert_eq!(capabilities["kind"], "capabilities");
    assert_eq!(capabilities["maxChunkBytes"], 24 * 1024);
    assert_eq!(capabilities["maxBytes"], 20 * 1024 * 1024);
    let mut assets = Vec::new();
    for input in &manifest {
        let name = input["name"].as_str().unwrap();
        assert!(["fixture.txt", "fixture.png"].contains(&name));
        let bytes = fs::read(root.join("fixture-inputs").join(name)).unwrap();
        assert_eq!(bytes.len() as u64, input["sizeBytes"].as_u64().unwrap());
        assert_eq!(format!("{:x}", Sha256::digest(&bytes)), input["sha256"]);
        if name == "fixture.txt" {
            assert_eq!(bytes.len(), 40);
        } else {
            assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
            assert!(bytes.len() > 24 * 1024);
        }
        let upload_id = uuid::Uuid::new_v4().to_string();
        let begin=asset_request(owner,target,json!({"kind":"upload.begin","uploadId":upload_id,"name":name,"mimeType":input["mimeType"],"sizeBytes":bytes.len(),"sha256":input["sha256"]})).await;
        assert_eq!(begin["kind"], "upload");
        assert_eq!(begin["uploadId"], upload_id);
        assert_eq!(begin["receivedBytes"], 0);
        assert_eq!(begin["totalBytes"], bytes.len());
        let mut offset = 0usize;
        let mut chunks = 0;
        for chunk in bytes.chunks(24 * 1024) {
            let sent=asset_request(owner,target,json!({"kind":"upload.chunk","uploadId":upload_id,"offset":offset,"dataBase64":base64::engine::general_purpose::STANDARD.encode(chunk),"sha256":format!("{:x}",Sha256::digest(chunk))})).await;
            offset += chunk.len();
            chunks += 1;
            assert_eq!(sent["kind"], "upload");
            assert_eq!(sent["agentId"], "original-host-agent");
            assert_eq!(sent["uploadId"], upload_id);
            assert_eq!(sent["receivedBytes"], offset);
            assert_eq!(sent["totalBytes"], bytes.len());
        }
        let status = asset_request(
            owner,
            target,
            json!({"kind":"upload.status","uploadId":upload_id}),
        )
        .await;
        assert_eq!(status["receivedBytes"], bytes.len());
        let finished = asset_request(
            owner,
            target,
            json!({"kind":"upload.finish","uploadId":upload_id}),
        )
        .await;
        assert_eq!(finished["kind"], "asset");
        assert_eq!(finished["agentId"], "original-host-agent");
        assert_eq!(finished["uploadId"], upload_id);
        assert_eq!(finished["name"], name);
        assert_eq!(finished["mimeType"], input["mimeType"]);
        assert_eq!(finished["sizeBytes"], bytes.len());
        assert_eq!(finished["sha256"], input["sha256"]);
        assert!(finished["assetId"].as_str().is_some());
        eprintln!(
            "actual-encrypted-asset-upload={}",
            json!({"name":name,"sizeBytes":bytes.len(),"sha256":input["sha256"],"chunks":chunks,"maxChunkBytes":24*1024,"assetId":finished["assetId"]})
        );
        assets.push(finished);
    }
    let session_id = receipt["sessionId"].as_str().unwrap();
    let operation_id = uuid::Uuid::new_v4().to_string();
    let send = json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.send","version":1,"agentId":"original-host-agent","sessionId":session_id,"operationId":operation_id,"text":"Original E2EE attachment continuation.","assetIds":assets.iter().map(|a|a["assetId"].clone()).collect::<Vec<_>>()}});
    observe_stack("mobile-send-before-native");
    let probe = owner.request(send.clone());
    eprintln!(
        "native-future-bytes mobile.send.request={}",
        std::mem::size_of_val(&probe)
    );
    drop(probe);
    let probe = owner.request_inner(send.clone());
    eprintln!(
        "native-future-bytes mobile.send.request_inner={}",
        std::mem::size_of_val(&probe)
    );
    drop(probe);
    let submitted = ok(owner.request(send.clone()).await);
    assert_eq!(submitted["kind"], "mobile.receipt");
    let deadline = std::time::Instant::now();
    let accepted = loop {
        let current=ok(owner.request(json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.receipt","version":1,"agentId":"original-host-agent","operationId":operation_id}})).await);
        if current["status"] == "accepted" {
            assert_eq!(current["sessionId"], session_id);
            break current;
        }
        assert!(
            current["status"] != "rejected" && current["status"] != "unconfirmed",
            "attachment continuation rejected: {current}"
        );
        assert!(deadline.elapsed() < Duration::from_secs(35));
        tokio::time::sleep(Duration::from_millis(100)).await;
    };
    let deadline = std::time::Instant::now();
    loop {
        let snapshot=ok(owner.request(json!({"version":1,"kind":"session","targetId":target["targetId"],"request":{"kind":"get","agentId":"original-host-agent","sessionId":session_id,"limit":30}})).await);
        if snapshot["state"] == "idle"
            && snapshot["terminal"] == "complete"
            && snapshot["messages"]
                .to_string()
                .contains("Original Host local supplier completion 2.")
        {
            assert!(snapshot["messages"]
                .to_string()
                .contains("Original E2EE attachment continuation"));
            break;
        }
        assert!(
            deadline.elapsed() < Duration::from_secs(35),
            "attachment terminal absent: {snapshot}"
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let duplicate = owner.request(send).await;
    assert_eq!(duplicate["ok"], false);
    assert_eq!(duplicate["error"]["code"], "MOBILE_RECEIPT_REQUIRED");
    let recovered=ok(owner.request(json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.receipt","version":1,"agentId":"original-host-agent","operationId":operation_id}})).await);
    assert_eq!(recovered, accepted);
    private(
        &root.join("assets-expectation.json"),
        &json!({"sessionId":session_id,"operationId":operation_id,"textAssetId":assets[0]["assetId"],"imageAssetId":assets[1]["assetId"]}),
    );
    eprintln!(
        "actual-encrypted-attachment-continuation={}",
        json!({"sessionId":session_id,"operationId":operation_id,"assets":2,"terminal":"complete","duplicateIntent":"MOBILE_RECEIPT_REQUIRED","receiptRecovered":true})
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
        observe_stack("test-main-inner-poll");
        let key=rcgen::KeyPair::generate().unwrap();let cert=rcgen::CertificateParams::new(vec!["localhost".into()]).unwrap().self_signed(&key).unwrap();
        let tls=rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider())).with_safe_default_protocol_versions().unwrap().with_no_client_auth().with_single_cert(vec![cert.der().clone()],rustls::pki_types::PrivatePkcs8KeyDer::from(key.serialize_der()).into()).unwrap();
        let public=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let issuer=format!("https://localhost:{}",public.local_addr().unwrap().port());
        fs::write(root.join("public-ca.pem"),cert.pem()).unwrap();fs::set_permissions(root.join("public-ca.pem"),fs::Permissions::from_mode(0o600)).unwrap();private(&root.join("config.json"),&json!({"issuer":issuer,"shortRenewal":std::env::var("MOXBOTS_FULL_MODE").as_deref()==Ok("renewal")}));
        let service=std::env::var("MOXBOTS_FULL_SERVICE_TEST_BIN").expect("build service test binary first");spawn(&mut children,&root,&service,&["server::mobile_full_e2e_fixture::original_relay_service_fixture","--ignored","--exact","--nocapture"],"service");
        let ready=wait_json(&root.join("service-ready.json")).await;let address=ready["address"].as_str().unwrap().to_owned();let acceptor=tokio_rustls::TlsAcceptor::from(Arc::new(tls));
        tasks.spawn(async move{let mut connections=tokio::task::JoinSet::new();loop{let (tcp,_)=public.accept().await.unwrap();let acceptor=acceptor.clone();let address=address.clone();connections.spawn(async move{if let Ok(mut tls)=acceptor.accept(tcp).await{if let Ok(mut service)=tokio::net::TcpStream::connect(address).await{let _=tokio::io::copy_bidirectional(&mut tls,&mut service).await;}}});}});
        let mode=std::env::var("MOXBOTS_FULL_MODE").unwrap_or_else(|_|"text".into());assert!(["text","assets","ffi","renewal"].contains(&mode.as_str()));
        let node=std::env::var("MOXBOTS_FULL_NODE").unwrap_or_else(|_|"node".into());let helper=repo.join("scripts/fixtures/mobile-full-e2e-host.ts");spawn(&mut children,&root,&node,&["--import","tsx",helper.to_str().unwrap(),root.to_str().unwrap(),if mode=="ffi"||mode=="renewal" {"text"} else {&mode}],"node");
        let host_ready=wait_json(&root.join("host-ready.json")).await;
        let host=std::env::var("MOXBOTS_FULL_HOST_TEST_BIN").expect("build headless test binary first");spawn(&mut children,&root,&host,&["agent_network::connector::mobile_full_e2e_fixture::original_headless_connector_fixture","--ignored","--exact","--nocapture"],"headless");
        let status=std::time::Instant::now();loop{let v=wait_json(&root.join("headless-status.json")).await;if v["ready"]==true{break;}assert!(status.elapsed()<Duration::from_secs(35),"headless not ready: {v}");tokio::time::sleep(Duration::from_millis(100)).await;}
        if std::env::var("MOXBOTS_FULL_TIMEOUT_CHECK").as_deref()==Ok("1") {
            eprintln!("explicit-timeout-cleanup-fixture-ready");
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
        let state=root.join("mobile-state");fs::create_dir(&state).unwrap();fs::set_permissions(&state,fs::Permissions::from_mode(0o700)).unwrap();let mut kek=[0u8;32];fs::File::open("/dev/urandom").unwrap().read_exact(&mut kek).unwrap();
        let store=Arc::new(Store(EncryptedIdentityStore::for_test(&state,&kek).unwrap()));let config=NativeConfig{issuer:issuer.clone(),public_tls_ca:Some(cert.pem())};let mut owner=if mode=="ffi" {FixtureOwner::Ffi(FfiOwner::new(config,store).await)} else {FixtureOwner::Direct(Box::new(MobileConnection::new(config,store).unwrap()))};
        ok(owner.request(json!({"version":1,"kind":"account.login.start"})).await);let account=ok(owner.request(json!({"version":1,"kind":"account.login.poll"})).await);assert_eq!(account["state"],"signed-in");
        let host_device=host_ready["deviceId"].as_str().unwrap();
        owner.mount(host_device,false).await;
        let disabled=ok(owner.request(json!({"version":1,"kind":"targets.list"})).await);eprintln!("actual-default-mobile-targets={disabled}");assert!(disabled["items"].as_array().unwrap().is_empty());
        assert!(std::env::var("MOXBOTS_FULL_KEEP_MOUNT_DISABLED").as_deref()!=Ok("1"),"ORIGINAL_HOST_MOUNT_DISABLED: real catalog present; explicit synthetic-user mount authorization intentionally withheld");
        owner.mount(host_device,true).await;
        // Keep the second device's admission/connect future out of this
        // already deep orchestration future. It uses the same runtime and
        // original mobile owner implementation, but the setup-only future
        // (and its temporary connection state) no longer remains in the
        // primary test-main poll frame.
        let offline_root = root.clone();
        let offline_issuer = issuer.clone();
        let offline_ca = cert.pem();
        let handle = tokio::runtime::Handle::current();
        let offline_device_id = tokio::task::spawn_blocking(move || {
            handle.block_on(create_joined_offline_peer(
                &offline_root,
                &offline_issuer,
                &offline_ca,
            ))
        })
        .await
        .unwrap();
        if mode == "renewal" {
            let original_address = owner.host_address(host_device).await.expect("initial actual Host address");
            let deadline = std::time::Instant::now();
            loop {
                let renewed = root.join("renewal-observed.json").is_file();
                let status: Value = serde_json::from_slice(&fs::read(root.join("headless-status.json")).unwrap()).unwrap();
                if renewed && status["ready"] == true {
                    if let Some(address) = owner.host_address(host_device).await {
                        if address.connection_epoch != original_address.connection_epoch {
                            assert!(address.scope == original_address.scope, "renewal preserves principal/network/device/key generation");
                            eprintln!("actual-renewal-new-ready-epoch={}", json!({"oldEpoch":original_address.connection_epoch,"newEpoch":address.connection_epoch,"renewStatus":200,"ready":true,"sameDeviceScope":true}));
                            break;
                        }
                    }
                }
                assert!(deadline.elapsed() < Duration::from_secs(45), "actual renewal and new Ready epoch absent");
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
        let deadline=std::time::Instant::now();let targets=loop{let snapshot=ok(owner.request(json!({"version":1,"kind":"targets.list"})).await);if snapshot["unavailableDeviceCount"]==1{break snapshot;}assert!(deadline.elapsed()<Duration::from_secs(12),"actual joined peer did not settle offline: {snapshot}");tokio::time::sleep(Duration::from_millis(100)).await;};
        eprintln!("actual-mobile-targets-with-joined-offline-peer={}",json!({"targets":targets,"offlineDeviceId":offline_device_id}));
        assert_eq!(targets["hasMore"],false,"directory unavailability is separate from pagination");
        let target=targets["items"].as_array().unwrap().iter().find(|v|v["agentId"]=="original-host-agent").expect("original explicitly authorized Host Agent must be discovered through the actual directory");
        let operation_id=uuid::Uuid::new_v4().to_string();
        let start_intent=json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.start","version":1,"agentId":"original-host-agent","operationId":operation_id,"text":"Original E2EE WSS first turn.","assetIds":[]}});
        let probe=owner.request(start_intent.clone());eprintln!("native-future-bytes mobile.start.request={}",std::mem::size_of_val(&probe));drop(probe);
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
        if mode=="assets" {
            let FixtureOwner::Direct(mut owner)=owner else {unreachable!()};
            let send_probe=json!({"version":1,"kind":"mobile","targetId":target["targetId"],"request":{"kind":"mobile.send","version":1,"agentId":"original-host-agent","sessionId":receipt["sessionId"],"operationId":uuid::Uuid::new_v4().to_string(),"text":"unpolled future size probe","assetIds":[]}});
            let probe=owner.request(send_probe.clone());eprintln!("native-future-bytes constructed-only.mobile.send.request={}",std::mem::size_of_val(&probe));drop(probe);
            let probe=owner.request_inner(send_probe);eprintln!("native-future-bytes constructed-only.mobile.send.request_inner={}",std::mem::size_of_val(&probe));drop(probe);
            let target=target.clone();let receipt=receipt.clone();let phase_root=root.clone();
            // Isolate the new fixture phase from the large all-in-one test poll
            // frame. Tokio's existing worker stack is unchanged; original native
            // owner/retained sockets move together, with no new Session executor.
            let handle=tokio::runtime::Handle::current();
            tokio::task::spawn_blocking(move || {observe_stack("attachment-default-blocking-thread");let phase=Box::pin(attachment_continuation(&mut owner,&target,&receipt,&phase_root));eprintln!("fixture-future-bytes attachment-phase={}",std::mem::size_of_val(phase.as_ref().get_ref()));handle.block_on(phase);}).await.unwrap();
        }
        fs::write(root.join("stop"),b"stop").unwrap();let actual=wait_json(&root.join("host-result.json")).await;assert_eq!(actual["calls"],if mode=="assets"{2}else{1});
        if mode=="assets" {assert_eq!(actual["materialized"].as_array().unwrap().len(),2);assert_eq!(actual["sessions"].as_array().unwrap().len(),1);eprintln!("actual-encrypted-attachment-host-evidence={}",json!({"supplierCalls":actual["calls"],"supplierObservations":actual["supplierObservations"],"materialized":actual["materialized"]}));}assert!(actual["sessions"].as_array().unwrap().iter().any(|s|s["id"]==receipt["sessionId"]));
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
