//! Actual connector entry point with the original encrypted owner and login.
//! `for_test` substitutes only OS KEK provisioning on non-Linux test hosts.
use myagents_agent_network_crypto::EncryptedIdentityStore;
use serde_json::Value;
use std::{fs, path::PathBuf, sync::Arc, time::Duration};
#[tokio::test]
#[ignore = "bounded full mobile E2EE fixture; explicit isolated root only"]
async fn original_headless_connector_fixture() {
    let root = PathBuf::from(std::env::var_os("MOXBOTS_FULL_E2E_ROOT").unwrap());
    let config: Value =
        serde_json::from_slice(&fs::read(root.join("config.json")).unwrap()).unwrap();
    let host: Value =
        serde_json::from_slice(&fs::read(root.join("host-ready.json")).unwrap()).unwrap();
    let device = host["deviceId"].as_str().unwrap();
    crate::device_identity::initialize(device.into(), Some("Original E2EE Host".into())).unwrap();
    let state = root.join("headless-state");
    fs::create_dir(&state).unwrap();
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
    // Random test-local KEK never leaves this process; original AES-GCM store.
    let mut kek = [0u8; 32];
    use std::io::Read;
    fs::File::open("/dev/urandom")
        .unwrap()
        .read_exact(&mut kek)
        .unwrap();
    let store = Arc::new(EncryptedIdentityStore::for_test(&state, &kek).unwrap());
    let connection = crate::owned::Connection::discover(
        config["issuer"].as_str().unwrap(),
        Some(&root.join("public-ca.pem")),
        store.clone(),
        device,
    )
    .await
    .unwrap();
    connection.start().await.unwrap();
    connection.wait().await.unwrap();
    let ipc = crate::management_ipc::ManagementIpcConfig {
        socket: root.join("ipc/management.sock"),
        asset_root: state.join("remote-assets-v1"),
        host_uid: unsafe { libc::geteuid() },
        management_gid: unsafe { libc::getegid() },
    };
    // Original run_owned rejects same-UID Host/network (red evidence retained).
    // Existing cfg(test) socket adapter relaxes that one OS topology condition;
    // all socket UID/GID, account-generation and transport checks remain real.
    let account = connection.account(false).await.unwrap();
    let binding = crate::management_admission::authorize(&connection.owner, &account).unwrap();
    let ipc = crate::management_ipc::ManagementIpc::bind_source_fixture(&ipc).unwrap();
    // Original status writer replaces a pre-provisioned operator-owned 0640 file.
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o640)
        .open(root.join("headless-status.json"))
        .unwrap();
    // Provision the original status contract exactly even under a private umask.
    fs::set_permissions(
        root.join("headless-status.json"),
        fs::Permissions::from_mode(0o640),
    )
    .unwrap();
    tokio::time::timeout(
        Duration::from_secs(150),
        super::run_context(
            Arc::new(crate::state::Owner {
                store,
                device_id: device.into(),
            }),
            Some(&connection),
            Some(&root.join("headless-status.json")),
            true,
            Some(&ipc),
            Some(&binding),
            None,
        ),
    )
    .await
    .unwrap()
    .unwrap();
}
