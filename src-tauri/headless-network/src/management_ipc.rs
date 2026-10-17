//! Private reverse IPC from the Host process to its colocated Node owner.
//! The Unix peer is authenticated locally; it never carries AgentNet credentials.

use crate::agent_network::NetworkError;
use myagents_agent_network_protocol::{ConnectionScope, DeviceScope};
use myagents_host_management_protocol::{
    CanonicalUuid, Frame, ManagementMessage, ManagementMethod, RequestParams, ResponseResult,
    MAX_OBJECT_BYTES, MAX_RECEIVE_BYTES, NAMESPACE, VERSION,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    sync::Mutex,
};

const IPC_TIMEOUT: Duration = Duration::from_secs(30);

/// Private IPC authority comes only from the active, verified AgentNet
/// connection. The Node Host additionally validates its own device identity
/// and the original agent/session/worker generation before dispatch.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InternalAuthority {
    pub connection: ConnectionScope,
    pub peer: DeviceScope,
    pub peer_epoch: String,
    pub local: DeviceScope,
    pub account_binding: String,
    pub management_binding: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all_fields = "camelCase", deny_unknown_fields)]
pub(crate) enum InternalOperation {
    #[serde(rename = "asset.stage.begin")]
    StageBegin {
        agent_id: String,
        session_id: String,
        asset_id: String,
        name: String,
        mime_type: String,
        size_bytes: u64,
        sha256: String,
    },
    #[serde(rename = "asset.stage.chunk")]
    StageChunk {
        agent_id: String,
        session_id: String,
        asset_id: String,
        offset: u64,
        data_base64: String,
        sha256: String,
    },
    #[serde(rename = "asset.stage.finish")]
    StageFinish {
        agent_id: String,
        session_id: String,
        asset_id: String,
    },
    #[serde(rename = "assets.request")]
    Assets {
        request: myagents_host_management_protocol::RemoteAssetRequest,
    },
    #[serde(rename = "mobile.request")]
    Mobile {
        request: myagents_host_management_protocol::RemoteMobileRequest,
    },
    #[serde(rename = "asset.owner.list")]
    OwnerList {
        agent_id: String,
        session_id: String,
        limit: u8,
        before: Option<String>,
    },
    #[serde(rename = "asset.owner.read")]
    OwnerRead {
        agent_id: String,
        session_id: String,
        source_id: String,
        offset: u64,
        max_bytes: u32,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct InternalRequest {
    kind: String,
    request_id: CanonicalUuid,
    authority: InternalAuthority,
    operation: InternalOperation,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct InternalResponse {
    kind: String,
    request_id: CanonicalUuid,
    authority: InternalAuthority,
    result: Value,
}

/// Colocated source owner has no phone peer and grants no Session operations.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LocalSourceAuthority {
    pub connection: ConnectionScope,
    pub local: DeviceScope,
    pub account_binding: String,
    pub management_binding: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub(crate) enum LocalSourceOperation {
    #[serde(rename = "catalog.snapshot")]
    CatalogSnapshot {
        #[serde(skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
    },
    #[serde(rename = "source.peek")]
    Peek,
    #[serde(rename = "source.ack", rename_all = "camelCase")]
    Ack {
        source_event_id: String,
        event_id: String,
    },
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalSourceRequest {
    kind: String,
    request_id: CanonicalUuid,
    authority: LocalSourceAuthority,
    operation: LocalSourceOperation,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalSourceResponse {
    kind: String,
    request_id: CanonicalUuid,
    authority: LocalSourceAuthority,
    result: Value,
}

#[derive(Clone, Debug)]
pub(crate) struct ManagementIpcConfig {
    pub socket: PathBuf,
    pub asset_root: PathBuf,
    pub host_uid: u32,
    pub management_gid: u32,
}

struct PeerConnection {
    stream: UnixStream,
}

pub(crate) struct ManagementIpc {
    socket: PathBuf,
    socket_dev: u64,
    socket_ino: u64,
    host_uid: u32,
    asset_store: Arc<moxbots_asset_store::AssetStore>,
    connection: Arc<Mutex<Option<PeerConnection>>>,
    accept_tasks: tokio::task::JoinSet<()>,
}

fn invalid_path() -> NetworkError {
    NetworkError::new("HOST_MANAGEMENT_IPC_PATH_INVALID")
}

fn validate_parent(path: &Path, gid: u32) -> Result<(), NetworkError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(invalid_path());
    }
    let parent = path.parent().ok_or_else(invalid_path)?;
    let canonical = parent.canonicalize().map_err(|_| invalid_path())?;
    if canonical != parent {
        return Err(invalid_path());
    }
    let mut current = PathBuf::from("/");
    for component in parent.components().skip(1) {
        current.push(component);
        let meta = fs::symlink_metadata(&current).map_err(|_| invalid_path())?;
        if !meta.is_dir() || meta.file_type().is_symlink() || meta.mode() & 0o022 != 0 {
            return Err(invalid_path());
        }
        if meta.uid() != 0 && meta.uid() != unsafe { libc::geteuid() } {
            return Err(invalid_path());
        }
    }
    let meta = fs::symlink_metadata(parent).map_err(|_| invalid_path())?;
    if meta.uid() != unsafe { libc::geteuid() } || meta.gid() != gid || meta.mode() & 0o777 != 0o750
    {
        return Err(invalid_path());
    }
    Ok(())
}

fn set_socket_owner(path: &Path, gid: u32) -> Result<(), NetworkError> {
    use std::os::unix::ffi::OsStrExt;
    let metadata = fs::symlink_metadata(path).map_err(|_| invalid_path())?;
    if !metadata.file_type().is_socket() || metadata.nlink() != 1 {
        return Err(invalid_path());
    }
    // A Unix socket cannot be opened as a regular file. Use lchown/chmod by
    // pathname only after validating its inode and verify the exact inode again.
    let cpath = std::ffi::CString::new(path.as_os_str().as_bytes()).map_err(|_| invalid_path())?;
    let uid = unsafe { libc::geteuid() };
    let chown = unsafe { libc::lchown(cpath.as_ptr(), uid, gid) };
    if chown != 0 {
        return Err(invalid_path());
    }
    fs::set_permissions(path, fs::Permissions::from_mode(0o660)).map_err(|_| invalid_path())?;
    let after = fs::symlink_metadata(path).map_err(|_| invalid_path())?;
    if !after.file_type().is_socket()
        || after.nlink() != 1
        || after.uid() != unsafe { libc::geteuid() }
        || after.gid() != gid
        || after.mode() & 0o777 != 0o660
        || after.dev() != metadata.dev()
        || after.ino() != metadata.ino()
    {
        return Err(invalid_path());
    }
    Ok(())
}

impl ManagementIpc {
    pub(crate) fn bind(config: &ManagementIpcConfig) -> Result<Self, NetworkError> {
        Self::bind_inner(config, false)
    }

    #[cfg(test)]
    pub(crate) fn bind_source_fixture(config: &ManagementIpcConfig) -> Result<Self, NetworkError> {
        Self::bind_inner(config, true)
    }

    fn bind_inner(
        config: &ManagementIpcConfig,
        allow_same_uid: bool,
    ) -> Result<Self, NetworkError> {
        let asset_meta = match fs::symlink_metadata(&config.asset_root) {
            Ok(meta) => meta,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&config.asset_root)
                    .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?;
                fs::set_permissions(&config.asset_root, fs::Permissions::from_mode(0o700))
                    .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?;
                fs::symlink_metadata(&config.asset_root)
                    .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?
            }
            Err(_) => return Err(NetworkError::new("ASSET_STORE_UNAVAILABLE")),
        };
        if !config.asset_root.is_absolute()
            || asset_meta.file_type().is_symlink()
            || !asset_meta.is_dir()
        {
            return Err(NetworkError::new("ASSET_STORE_UNAVAILABLE"));
        }
        let asset_store = Arc::new(
            moxbots_asset_store::AssetStore::open(&config.asset_root)
                .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?,
        );
        let current_uid = unsafe { libc::geteuid() };
        if config.host_uid == 0
            || (!allow_same_uid && config.host_uid == current_uid)
            || config.management_gid == 0
            || config.socket.as_os_str().as_encoded_bytes().len() > 4096
        {
            return Err(NetworkError::new("HOST_MANAGEMENT_IPC_IDENTITY_INVALID"));
        }
        validate_parent(&config.socket, config.management_gid)?;
        if fs::symlink_metadata(&config.socket).is_ok() {
            return Err(NetworkError::new("HOST_MANAGEMENT_IPC_PATH_EXISTS"));
        }
        let listener = UnixListener::bind(&config.socket)
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_IPC_BIND_FAILED"))?;
        let created = fs::symlink_metadata(&config.socket).map_err(|_| invalid_path())?;
        if let Err(error) = set_socket_owner(&config.socket, config.management_gid) {
            remove_if_owned(&config.socket, created.dev(), created.ino());
            return Err(error);
        }
        let metadata = fs::symlink_metadata(&config.socket).map_err(|_| invalid_path())?;
        let connection = Arc::new(Mutex::new(None));
        let accept_connection = connection.clone();
        let host_uid = config.host_uid;
        let mut accept_tasks = tokio::task::JoinSet::new();
        accept_tasks.spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                if stream.peer_cred().map(|cred| cred.uid()).ok() != Some(host_uid) {
                    continue;
                }
                let mut slot = accept_connection.lock().await;
                if slot.is_none() {
                    *slot = Some(PeerConnection { stream });
                }
            }
        });
        Ok(Self {
            socket: config.socket.clone(),
            socket_dev: metadata.dev(),
            socket_ino: metadata.ino(),
            host_uid,
            asset_store,
            connection,
            accept_tasks,
        })
    }

    pub(crate) fn asset_store(&self) -> Arc<moxbots_asset_store::AssetStore> {
        self.asset_store.clone()
    }

    pub(crate) async fn request(
        &self,
        channel_id: &str,
        request_id: CanonicalUuid,
        method: ManagementMethod,
        params: RequestParams,
    ) -> Result<ResponseResult, NetworkError> {
        self.request_with_timeout(channel_id, request_id, method, params, IPC_TIMEOUT)
            .await
    }

    /// Separate closed internal union for Node-hosted asset/mobile ownership.
    /// Legacy ManagementMessage framing/serialization remains untouched.
    pub(crate) async fn request_internal(
        &self,
        request_id: CanonicalUuid,
        authority: InternalAuthority,
        operation: InternalOperation,
    ) -> Result<Value, NetworkError> {
        if let InternalOperation::StageChunk { data_base64, .. } = &operation {
            // 24 KiB raw chunk, canonical padded base64; this bound plus the
            // fixed envelope leaves ample room under MAX_OBJECT_BYTES.
            if data_base64.is_empty() || data_base64.len() > 32 * 1024 {
                return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_TOO_LARGE"));
            }
        }
        for value in [
            authority.account_binding.as_str(),
            authority.management_binding.as_str(),
            authority.peer_epoch.as_str(),
        ] {
            if value.is_empty() || value.len() > 256 || value.bytes().any(|b| b.is_ascii_control())
            {
                return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"));
            }
        }
        let message = InternalRequest {
            kind: "internal-request".into(),
            request_id,
            authority: authority.clone(),
            operation,
        };
        let payload = serde_json::to_vec(&message)
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"))?;
        if payload.is_empty() || payload.len() > MAX_OBJECT_BYTES {
            return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_TOO_LARGE"));
        }
        let mut slot = tokio::time::timeout(IPC_TIMEOUT, async {
            loop {
                let slot = self.connection.lock().await;
                if slot.is_some() {
                    return slot;
                }
                drop(slot);
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNAVAILABLE"))?;
        let connection = slot
            .as_mut()
            .ok_or_else(|| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
        let result = async {
            if connection
                .stream
                .peer_cred()
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_IPC_PEER_REJECTED"))?
                .uid()
                != self.host_uid
            {
                return Err(NetworkError::new("HOST_MANAGEMENT_IPC_PEER_REJECTED"));
            }
            let mut frame = Vec::with_capacity(payload.len() + 4);
            frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
            frame.extend_from_slice(&payload);
            connection
                .stream
                .write_all(&frame)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let mut prefix = [0u8; 4];
            connection
                .stream
                .read_exact(&mut prefix)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let length = u32::from_be_bytes(prefix) as usize;
            if length == 0 || length > MAX_OBJECT_BYTES || length + 4 > MAX_RECEIVE_BYTES {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            let mut body = vec![0; length];
            connection
                .stream
                .read_exact(&mut body)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let response: InternalResponse = serde_json::from_slice(&body)
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
            if response.kind != "internal-response"
                || response.request_id != request_id
                || response.authority != authority
            {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            Ok(response.result)
        };
        let result = match tokio::time::timeout(IPC_TIMEOUT, result).await {
            Ok(result) => result,
            Err(_) => Err(NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED")),
        };
        if result.is_err() {
            *slot = None;
        }
        result
    }

    pub(crate) async fn request_local_source(
        &self,
        request_id: CanonicalUuid,
        authority: LocalSourceAuthority,
        operation: LocalSourceOperation,
    ) -> Result<Value, NetworkError> {
        if matches!(&operation, LocalSourceOperation::CatalogSnapshot { cursor: Some(cursor) } if cursor.is_empty() || cursor.len() > 128)
        {
            return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"));
        }
        if authority.account_binding != authority.management_binding
            || authority.connection.network_id != authority.local.network_id
            || authority.connection.service_id != authority.local.service_id
        {
            return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"));
        }
        let message = LocalSourceRequest {
            kind: "local-source-request".into(),
            request_id,
            authority: authority.clone(),
            operation,
        };
        let payload = serde_json::to_vec(&message)
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"))?;
        if payload.is_empty() || payload.len() > MAX_OBJECT_BYTES {
            return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_TOO_LARGE"));
        }
        let mut slot = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let slot = self.connection.lock().await;
                if slot.is_some() {
                    return slot;
                }
                drop(slot);
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNAVAILABLE"))?;
        let connection = slot
            .as_mut()
            .ok_or_else(|| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
        let result = async {
            if connection
                .stream
                .peer_cred()
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_IPC_PEER_REJECTED"))?
                .uid()
                != self.host_uid
            {
                return Err(NetworkError::new("HOST_MANAGEMENT_IPC_PEER_REJECTED"));
            }
            let mut frame = Vec::with_capacity(payload.len() + 4);
            frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
            frame.extend_from_slice(&payload);
            connection
                .stream
                .write_all(&frame)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let mut prefix = [0u8; 4];
            connection
                .stream
                .read_exact(&mut prefix)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let length = u32::from_be_bytes(prefix) as usize;
            if length == 0 || length > MAX_OBJECT_BYTES || length + 4 > MAX_RECEIVE_BYTES {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            let mut body = vec![0; length];
            connection
                .stream
                .read_exact(&mut body)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let response: LocalSourceResponse = serde_json::from_slice(&body)
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
            if response.kind != "local-source-response"
                || response.request_id != request_id
                || response.authority != authority
            {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            Ok(response.result)
        };
        let result = match tokio::time::timeout(Duration::from_secs(2), result).await {
            Ok(result) => result,
            Err(_) => Err(NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED")),
        };
        if result.is_err() {
            *slot = None;
        }
        result
    }

    async fn request_with_timeout(
        &self,
        channel_id: &str,
        request_id: CanonicalUuid,
        method: ManagementMethod,
        params: RequestParams,
        timeout: Duration,
    ) -> Result<ResponseResult, NetworkError> {
        let channel_id = CanonicalUuid::parse(channel_id)
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_CHANNEL_INVALID"))?;
        let message = ManagementMessage::Request {
            request_id,
            method,
            params,
        };
        Frame {
            namespace: NAMESPACE.into(),
            version: VERSION,
            sender_sequence: 1,
            channel_id,
            message: message.clone(),
        }
        .validate()
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"))?;
        let payload = serde_json::to_vec(&message)
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_REQUEST_INVALID"))?;
        if payload.is_empty() || payload.len() > MAX_OBJECT_BYTES {
            return Err(NetworkError::new("HOST_MANAGEMENT_REQUEST_TOO_LARGE"));
        }
        let mut slot = tokio::time::timeout(timeout, async {
            loop {
                let slot = self.connection.lock().await;
                if slot.is_some() {
                    return slot;
                }
                drop(slot);
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNAVAILABLE"))?;
        let connection = slot
            .as_mut()
            .ok_or_else(|| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
        let result = async {
            let uid = connection
                .stream
                .peer_cred()
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_IPC_PEER_REJECTED"))?
                .uid();
            if uid != self.host_uid {
                return Err(NetworkError::new("HOST_MANAGEMENT_IPC_PEER_REJECTED"));
            }
            let mut frame = Vec::with_capacity(payload.len() + 4);
            frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
            frame.extend_from_slice(&payload);
            connection
                .stream
                .write_all(&frame)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let mut prefix = [0u8; 4];
            connection
                .stream
                .read_exact(&mut prefix)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let length = u32::from_be_bytes(prefix) as usize;
            if length == 0 || length > MAX_OBJECT_BYTES {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            if length + 4 > MAX_RECEIVE_BYTES {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            let mut body = vec![0; length];
            connection
                .stream
                .read_exact(&mut body)
                .await
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED"))?;
            let response: ManagementMessage = serde_json::from_slice(&body)
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
            let ManagementMessage::Response {
                request_id: received_id,
                result,
            } = response
            else {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            };
            if received_id != request_id {
                return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
            }
            Frame {
                namespace: NAMESPACE.into(),
                version: VERSION,
                sender_sequence: 1,
                channel_id,
                message: ManagementMessage::Response {
                    request_id: received_id,
                    result: result.clone(),
                },
            }
            .validate()
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
            Ok(result)
        };
        let result = match tokio::time::timeout(timeout, result).await {
            Ok(result) => result,
            Err(_) => Err(NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED")),
        };
        if result.is_err() {
            *slot = None;
        }
        result
    }
}

fn remove_if_owned(path: &Path, dev: u64, ino: u64) {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_socket() && metadata.dev() == dev && metadata.ino() == ino {
            let _ = fs::remove_file(path);
        }
    }
}

impl Drop for ManagementIpc {
    fn drop(&mut self) {
        self.accept_tasks.abort_all();
        remove_if_owned(&self.socket, self.socket_dev, self.socket_ino);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use myagents_host_management_protocol::SnapshotParams;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn internal_ipc_has_closed_authority_envelope_and_24k_chunks_stay_below_frame_cap() {
        let scope = myagents_agent_network_protocol::DeviceScope {
            service_id: "service".into(),
            environment: "production".into(),
            network_id: "network".into(),
            principal_id: "principal".into(),
            device_id: "device".into(),
            key_generation: 1,
        };
        let authority = InternalAuthority {
            connection: myagents_agent_network_protocol::ConnectionScope {
                service_id: "service".into(),
                network_id: "network".into(),
                boot_epoch: "boot".into(),
                connection_epoch: "epoch".into(),
            },
            peer: scope.clone(),
            peer_epoch: "peer-epoch".into(),
            local: scope,
            account_binding: "binding".into(),
            management_binding: "binding".into(),
        };
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        let message = InternalRequest {
            kind: "internal-request".into(),
            request_id: id,
            authority: authority.clone(),
            operation: InternalOperation::StageChunk {
                agent_id: "agent-1".into(),
                session_id: "session-1".into(),
                asset_id: uuid::Uuid::new_v4().to_string(),
                offset: 0,
                data_base64: base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    vec![0u8; 24 * 1024],
                ),
                sha256: "a".repeat(64),
            },
        };
        let bytes = serde_json::to_vec(&message).unwrap();
        assert!(bytes.len() < MAX_OBJECT_BYTES);
        assert!(
            serde_json::from_slice::<InternalRequest>(&bytes)
                .unwrap()
                .authority
                == authority
        );
        let mut value: Value = serde_json::from_slice(&bytes).unwrap();
        value["arbitraryPath"] = Value::String("/etc/passwd".into());
        assert!(serde_json::from_value::<InternalRequest>(value).is_err());
    }

    fn private_test_base() -> PathBuf {
        let uid = unsafe { libc::geteuid() };
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .expect("tests require a private HOME directory");
        let canonical = home.canonicalize().expect("HOME must exist");
        assert_eq!(canonical, home, "HOME must not traverse a symlink");
        let mut current = PathBuf::from("/");
        for component in home.components().skip(1) {
            current.push(component);
            let metadata = fs::symlink_metadata(&current).expect("HOME ancestor must exist");
            assert!(metadata.is_dir() && !metadata.file_type().is_symlink());
            assert_eq!(metadata.mode() & 0o022, 0, "unsafe HOME ancestor");
            assert!(metadata.uid() == 0 || metadata.uid() == uid);
        }
        let metadata = fs::symlink_metadata(&home).expect("HOME must exist");
        assert_eq!(metadata.uid(), uid, "HOME must belong to current user");
        home
    }

    fn test_endpoint(expected_uid: u32) -> (tempfile::TempDir, ManagementIpcConfig) {
        let dir = tempfile::Builder::new()
            .prefix("mipc-")
            .tempdir_in(private_test_base())
            .unwrap();
        let parent = dir.path().canonicalize().unwrap();
        let gid = unsafe { libc::getegid() };
        let uid = unsafe { libc::geteuid() };
        let cpath = std::ffi::CString::new(parent.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::chown(cpath.as_ptr(), uid, gid) }, 0);
        fs::set_permissions(&parent, fs::Permissions::from_mode(0o750)).unwrap();
        let path = parent.join("management.sock");
        assert!(path.as_os_str().as_encoded_bytes().len() < 108);
        (
            dir,
            ManagementIpcConfig {
                socket: path,
                asset_root: parent.join("assets"),
                host_uid: expected_uid,
                management_gid: gid,
            },
        )
    }

    #[test]
    fn rejects_a_group_writable_ancestor_without_touching_shared_tmp() {
        let dir = tempfile::Builder::new()
            .prefix("mipc-unsafe-")
            .tempdir_in(private_test_base())
            .unwrap();
        let public_parent = dir.path().join("public");
        fs::create_dir(&public_parent).unwrap();
        let gid = unsafe { libc::getegid() };
        let uid = unsafe { libc::geteuid() };
        let cpath = std::ffi::CString::new(public_parent.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::chown(cpath.as_ptr(), uid, gid) }, 0);
        fs::set_permissions(&public_parent, fs::Permissions::from_mode(0o770)).unwrap();

        assert_eq!(
            validate_parent(&public_parent.join("management.sock"), gid)
                .unwrap_err()
                .code,
            "HOST_MANAGEMENT_IPC_PATH_INVALID"
        );
    }

    async fn read_message(stream: &mut UnixStream) -> serde_json::Value {
        let mut prefix = [0; 4];
        stream.read_exact(&mut prefix).await.unwrap();
        let size = u32::from_be_bytes(prefix) as usize;
        assert!(size > 0 && size <= MAX_OBJECT_BYTES);
        let mut body = vec![0; size];
        stream.read_exact(&mut body).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    async fn send_message(stream: &mut UnixStream, value: &serde_json::Value) {
        let body = serde_json::to_vec(value).unwrap();
        assert!(body.len() <= MAX_OBJECT_BYTES);
        stream
            .write_all(&(body.len() as u32).to_be_bytes())
            .await
            .unwrap();
        stream.write_all(&body).await.unwrap();
    }

    #[tokio::test]
    async fn authenticates_real_unix_peer_and_roundtrips_typed_response() {
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid);
        let ipc = Arc::new(ManagementIpc::bind_inner(&config, true).unwrap());
        let mut node = UnixStream::connect(&config.socket).await.unwrap();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        let request_future = ipc.request_with_timeout(
            "1f87cd98-788c-4f47-8a55-9db6d172c483",
            id,
            ManagementMethod::HostSnapshot,
            RequestParams::Snapshot(SnapshotParams {}),
            Duration::from_secs(2),
        );
        let responder = async {
            let request = read_message(&mut node).await;
            send_message(&mut node,&serde_json::json!({"kind":"response","requestId":request["requestId"],"result":{"kind":"error","code":"OWNER_OPERATION_FAILED"}})).await;
            request
        };
        let (result, request) = tokio::join!(request_future, responder);
        assert_eq!(request["kind"], "request");
        assert_eq!(request["method"], "host.snapshot");
        assert_eq!(
            result.unwrap(),
            ResponseResult::Error {
                code: "OWNER_OPERATION_FAILED".into()
            }
        );
    }

    #[tokio::test]
    async fn local_source_has_no_phone_peer_and_uses_original_uid_guarded_transport() {
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid);
        let ipc = Arc::new(ManagementIpc::bind_inner(&config, true).unwrap());
        let mut node = UnixStream::connect(&config.socket).await.unwrap();
        let binding = uuid::Uuid::new_v4().to_string();
        let authority = LocalSourceAuthority {
            connection: ConnectionScope {
                service_id: "service".into(),
                network_id: "network".into(),
                boot_epoch: "boot".into(),
                connection_epoch: uuid::Uuid::new_v4().to_string(),
            },
            local: DeviceScope {
                service_id: "service".into(),
                environment: "test".into(),
                network_id: "network".into(),
                principal_id: "principal".into(),
                device_id: "device".into(),
                key_generation: 1,
            },
            account_binding: binding.clone(),
            management_binding: binding,
        };
        let request = ipc.request_local_source(
            CanonicalUuid::new(uuid::Uuid::new_v4()),
            authority,
            LocalSourceOperation::Peek,
        );
        let responder = async {
            let request = read_message(&mut node).await;
            assert!(request["authority"].get("peer").is_none());
            assert!(request.get("requestId").is_some());
            assert_eq!(request["kind"], "local-source-request");
            send_message(&mut node,&serde_json::json!({"kind":"local-source-response","requestId":request["requestId"],"authority":request["authority"],"result":{"kind":"source.empty"}})).await;
        };
        let (result, _) = tokio::join!(request, responder);
        assert_eq!(result.unwrap(), serde_json::json!({"kind":"source.empty"}));
    }

    #[tokio::test]
    async fn catalog_query_uses_original_private_transport_and_closed_cursor() {
        use sha2::Digest;
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid);
        let ipc = ManagementIpc::bind_inner(&config, true).unwrap();
        let mut node = UnixStream::connect(&config.socket).await.unwrap();
        let binding = uuid::Uuid::new_v4().to_string();
        let authority = LocalSourceAuthority {
            connection: ConnectionScope {
                service_id: "s".into(),
                network_id: "n".into(),
                boot_epoch: "b".into(),
                connection_epoch: uuid::Uuid::new_v4().to_string(),
            },
            local: DeviceScope {
                service_id: "s".into(),
                environment: "t".into(),
                network_id: "n".into(),
                principal_id: "p".into(),
                device_id: "d".into(),
                key_generation: 1,
            },
            account_binding: binding.clone(),
            management_binding: binding,
        };
        assert!(serde_json::from_value::<LocalSourceOperation>(
            serde_json::json!({"kind":"catalog.snapshot","path":"/untrusted"})
        )
        .is_err());
        let operation = LocalSourceOperation::CatalogSnapshot { cursor: None };
        assert_eq!(
            serde_json::to_value(&operation).unwrap(),
            serde_json::json!({"kind":"catalog.snapshot"})
        );
        let request = ipc.request_local_source(
            CanonicalUuid::new(uuid::Uuid::new_v4()),
            authority.clone(),
            operation,
        );
        let result = serde_json::json!({"kind":"catalog.chunk","observation":format!("{:x}",sha2::Sha256::digest(b"[]")),"offset":0,"dataBase64":"W10=","nextCursor":null});
        let responder = async {
            let request = read_message(&mut node).await;
            assert_eq!(
                request["operation"],
                serde_json::json!({"kind":"catalog.snapshot"})
            );
            assert!(request["authority"].get("peer").is_none());
            send_message(&mut node,&serde_json::json!({"kind":"local-source-response","requestId":request["requestId"],"authority":request["authority"],"result":result})).await;
        };
        let (received, _) = tokio::join!(request, responder);
        assert_eq!(received.unwrap(), result);
        assert!(ipc
            .request_local_source(
                CanonicalUuid::new(uuid::Uuid::new_v4()),
                authority,
                LocalSourceOperation::CatalogSnapshot {
                    cursor: Some("x".repeat(129))
                }
            )
            .await
            .is_err());
    }

    #[tokio::test]
    async fn rejects_a_real_peer_credential_with_wrong_uid() {
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid + 1);
        let _ipc = ManagementIpc::bind_inner(&config, true).unwrap();
        let mut peer = UnixStream::connect(&config.socket).await.unwrap();
        let mut byte = [0u8; 1];
        let read = tokio::time::timeout(Duration::from_secs(2), peer.read(&mut byte))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            read, 0,
            "wrong-UID client must be closed before it can receive an operation"
        );
    }

    #[tokio::test]
    async fn lost_response_is_unconfirmed_and_never_replayed() {
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid);
        let ipc = Arc::new(ManagementIpc::bind_inner(&config, true).unwrap());
        let mut node = UnixStream::connect(&config.socket).await.unwrap();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        let request_future = ipc.request_with_timeout(
            "1f87cd98-788c-4f47-8a55-9db6d172c483",
            id,
            ManagementMethod::HostSnapshot,
            RequestParams::Snapshot(SnapshotParams {}),
            Duration::from_millis(40),
        );
        let (result, first) = tokio::join!(request_future, read_message(&mut node));
        assert_eq!(first["kind"], "request");
        assert_eq!(result.unwrap_err().code, "HOST_MANAGEMENT_UNCONFIRMED");
        let mut byte = [0; 1];
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(1), node.read(&mut byte))
                .await
                .unwrap()
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn oversized_response_frame_fails_closed() {
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid);
        let ipc = Arc::new(ManagementIpc::bind_inner(&config, true).unwrap());
        let mut node = UnixStream::connect(&config.socket).await.unwrap();
        let id = CanonicalUuid::new(uuid::Uuid::new_v4());
        let request_future = ipc.request_with_timeout(
            "1f87cd98-788c-4f47-8a55-9db6d172c483",
            id,
            ManagementMethod::HostSnapshot,
            RequestParams::Snapshot(SnapshotParams {}),
            Duration::from_secs(2),
        );
        let (result, ()) = tokio::join!(request_future, async {
            let _ = read_message(&mut node).await;
            node.write_all(&((MAX_OBJECT_BYTES as u32) + 1).to_be_bytes())
                .await
                .unwrap();
        });
        assert_eq!(result.unwrap_err().code, "HOST_MANAGEMENT_RESPONSE_INVALID");
    }

    #[tokio::test]
    async fn cleanup_preserves_a_replaced_non_socket_path() {
        let uid = unsafe { libc::geteuid() };
        let (_dir, config) = test_endpoint(uid);
        let ipc = ManagementIpc::bind_inner(&config, true).unwrap();
        fs::remove_file(&config.socket).unwrap();
        fs::write(&config.socket, b"operator replacement").unwrap();
        drop(ipc);
        assert_eq!(fs::read(&config.socket).unwrap(), b"operator replacement");
    }
}
