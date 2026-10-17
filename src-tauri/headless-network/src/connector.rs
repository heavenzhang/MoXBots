#[path = "catalog.rs"]
pub(crate) mod catalog;
#[path = "../../src/agent_network/catalog_ack.rs"]
pub(crate) mod catalog_ack;

use crate::bot_execution::BotExecution;
use crate::{
    agent_network::{
        account::NetworkAccountSession,
        channel::ManagementEvent,
        connection::{initial_hello, send},
        identity::NetworkIdentity,
        memory::MemoryBudget,
        pairs::{Offer, Pairs},
        policy,
        reconnect::ReconnectBackoff,
        transport::{NetworkRoute, NetworkTransport},
        NetworkError,
    },
    state::Owner,
    status::{self, Status},
};
use futures_util::{SinkExt, StreamExt};
use myagents_agent_network_protocol::{
    budget, CatalogSnapshot, ChangeScope, ClientMessage, ServerEnvelope, ServerMessage,
};
use myagents_host_management_protocol::{ManagementMessage, PeerRole};
use sha2::Digest;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio_tungstenite::tungstenite::Message;
fn publish(
    owner: &Owner,
    path: Option<&Path>,
    state: &str,
    network: Option<&str>,
    ready: bool,
    error: Option<&str>,
) -> Result<(), NetworkError> {
    status::write(
        path,
        &Status {
            state,
            device_id: &owner.device_id,
            network_id: network,
            ready,
            error_code: error,
        },
    )
}
pub(crate) fn hello() -> ClientMessage {
    ClientMessage::Hello {
        client_version: env!("CARGO_PKG_VERSION").into(),
        capabilities: ["tls13-mtls", "typed-rpc", "permit-v1", "return-v1"]
            .map(str::to_owned)
            .to_vec(),
        previous_connection: None,
    }
}
pub(crate) fn empty_catalog(epoch: String) -> Result<serde_json::Value, NetworkError> {
    // Unmanaged headless owners explicitly expose no registry. Managed owners
    // must read their original Host registry and never fall back after failure.
    let value = serde_json::to_value(CatalogSnapshot {
        version: 1,
        connection_epoch: epoch,
        catalog_seq: 1,
        items: vec![],
    })
    .map_err(|_| NetworkError::new("CATALOG_INVALID"))?;
    myagents_agent_network_protocol::validate_catalog(&value)
        .map_err(|_| NetworkError::new("CATALOG_INVALID"))?;
    Ok(value)
}
pub(crate) fn control_gate(
    message: &ServerMessage,
    scope: &myagents_agent_network_protocol::ConnectionScope,
    catalog_confirmed: bool,
    policy_confirmed: bool,
) -> Result<(), NetworkError> {
    if message.scope().is_some_and(|current| current != scope) {
        return Err(NetworkError::new("CONTROL_SCOPE_MISMATCH"));
    }
    if let ServerMessage::Ready { catalog_seq, .. } = message {
        if *catalog_seq != 1 || !catalog_confirmed || !policy_confirmed {
            return Err(NetworkError::new("READY_PRECONDITION_FAILED"));
        }
    }
    Ok(())
}
fn consume_join_grant(run: &AtomicBool, connection: &AtomicBool) -> bool {
    let run_granted = run.swap(false, Ordering::AcqRel);
    let connection_granted = connection.swap(false, Ordering::AcqRel);
    run_granted && connection_granted
}
struct ExecutionFence {
    live: Arc<AtomicBool>,
    execution: Arc<BotExecution>,
    task: Option<tokio::task::JoinHandle<()>>,
}
impl Drop for ExecutionFence {
    fn drop(&mut self) {
        self.live.store(false, Ordering::Release);
        self.execution.cancel_pending();
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}
fn start_execution(
    execution: &Option<Arc<BotExecution>>,
    identity: Arc<NetworkIdentity>,
    transport: Arc<NetworkTransport>,
    scope: &myagents_agent_network_protocol::ConnectionScope,
    local: &myagents_agent_network_protocol::DeviceScope,
    policy: &policy::LocalPolicy,
) -> Result<Option<ExecutionFence>, NetworkError> {
    let Some(execution) = execution else {
        return Ok(None);
    };
    let execution = execution.clone();
    let live = Arc::new(AtomicBool::new(true));
    let current = live.clone();
    let source = execution.clone();
    let scope = scope.clone();
    let local = local.clone();
    let policy = policy.clone();
    let runtime = tokio::runtime::Handle::try_current()
        .map_err(|_| NetworkError::new("BOT_EXECUTION_RUNTIME_REQUIRED"))?;
    let task = runtime.spawn(async move {
        while current.load(Ordering::Acquire) {
            let result = source
                .poll_once(&identity, &transport, &scope, &local, &policy, 1, &current)
                .await;
            if !current.load(Ordering::Acquire) {
                break;
            }
            // Only fixed error codes cross diagnostics; no proof, token, body or model key.
            if let Err(error) = result {
                if error.code != "BOT_EXECUTION_BUSY" {
                    eprintln!(
                        "{}",
                        serde_json::json!({"code":error.code,"component":"finite-bot-poll"})
                    );
                }
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
    Ok(Some(ExecutionFence {
        live,
        execution,
        task: Some(task),
    }))
}

fn is_management_enabled(owned_profile: bool, listener_enabled: bool) -> bool {
    owned_profile && listener_enabled
}
fn require_captured_binding(actual: &str, captured: &str) -> Result<(), NetworkError> {
    if actual == captured {
        Ok(())
    } else {
        Err(NetworkError::new("ACCOUNT_BINDING_CHANGED"))
    }
}
fn verify_binding_snapshot(
    account_binding: &str,
    management_binding: &str,
    captured_binding: &str,
) -> Result<(), NetworkError> {
    require_captured_binding(account_binding, captured_binding)?;
    require_captured_binding(management_binding, captured_binding)
}
fn mobile_asset_scope(
    identity: &NetworkIdentity,
    peer: &myagents_agent_network_protocol::DeviceScope,
    local: &myagents_agent_network_protocol::DeviceScope,
    connection: &myagents_agent_network_protocol::ConnectionScope,
    agent_id: &str,
) -> Result<moxbots_asset_store::AssetScope, NetworkError> {
    use myagents_host_management_protocol::CanonicalUuid;
    if peer.network_id != local.network_id
        || connection.network_id != local.network_id
        || peer.service_id != local.service_id
        || connection.service_id != local.service_id
        || peer.environment != local.environment
    {
        return Err(NetworkError::new("ASSET_SCOPE_MISMATCH"));
    }
    Ok(moxbots_asset_store::AssetScope {
        issuer: identity.account.issuer().to_owned(),
        service_id: CanonicalUuid::parse(&local.service_id)
            .map_err(|_| NetworkError::new("ASSET_SCOPE_INVALID"))?,
        environment: local.environment.clone(),
        network_id: CanonicalUuid::parse(&local.network_id)
            .map_err(|_| NetworkError::new("ASSET_SCOPE_INVALID"))?,
        principal_id: identity.account.principal_id()?.to_owned(),
        controller_device_id: CanonicalUuid::parse(&peer.device_id)
            .map_err(|_| NetworkError::new("ASSET_SCOPE_INVALID"))?,
        controller_key_generation: peer.key_generation,
        target_device_id: CanonicalUuid::parse(&local.device_id)
            .map_err(|_| NetworkError::new("ASSET_SCOPE_INVALID"))?,
        agent_id: agent_id.to_owned(),
    })
}
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OwnerItem {
    source_id: String,
    name: String,
    mime_type: String,
    size_bytes: u64,
    sha256: String,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OwnerPage {
    kind: String,
    agent_id: String,
    session_id: String,
    items: Vec<OwnerItem>,
    has_more: bool,
    next_before: Option<String>,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OwnerChunk {
    kind: String,
    source_id: String,
    offset: u64,
    data_base64: String,
    sha256: String,
    eof: bool,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StageAck {
    kind: String,
    asset_id: String,
    received_bytes: u64,
    ready: bool,
}
fn validate_stage_ack(
    value: serde_json::Value,
    asset_id: &str,
    received: u64,
    ready: bool,
) -> Result<(), NetworkError> {
    if value.get("kind").and_then(serde_json::Value::as_str) == Some("error") {
        return Err(NetworkError::new("ASSET_STAGE_FAILED"));
    }
    let ack: StageAck = serde_json::from_value(value)
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
    if ack.kind != "stage"
        || ack.asset_id != asset_id
        || ack.received_bytes != received
        || ack.ready != ready
    {
        return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
    }
    Ok(())
}
async fn store_execute(
    store: std::sync::Arc<moxbots_asset_store::AssetStore>,
    scope: moxbots_asset_store::AssetScope,
    request: myagents_host_management_protocol::RemoteAssetRequest,
) -> Result<myagents_host_management_protocol::RemoteAssetResult, NetworkError> {
    tokio::task::spawn_blocking(move || store.execute(&scope, &request))
        .await
        .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?
        .map_err(|error| NetworkError::new(error.code))
}

fn verify_mobile_authority(
    runtime: ManagementRuntime<'_>,
    identity: &NetworkIdentity,
    captured_binding: &str,
) -> Result<(), NetworkError> {
    identity.account.ensure_current()?;
    runtime.binding.verify()?;
    verify_binding_snapshot(
        identity.account.binding_id(),
        runtime.binding.account_binding(),
        captured_binding,
    )
}

async fn mobile_internal_request(
    runtime: ManagementRuntime<'_>,
    identity: &NetworkIdentity,
    captured_binding: &str,
    request_id: myagents_host_management_protocol::CanonicalUuid,
    authority: crate::management_ipc::InternalAuthority,
    operation: crate::management_ipc::InternalOperation,
) -> Result<serde_json::Value, NetworkError> {
    verify_mobile_authority(runtime, identity, captured_binding)?;
    let result = runtime
        .ipc
        .request_internal(request_id, authority, operation)
        .await;
    // Preserve the post-call authority gate even when Node/IPC returned an
    // error. Any account switch or revoked local grant takes precedence.
    verify_mobile_authority(runtime, identity, captured_binding)?;
    result
}

async fn owner_list(
    runtime: ManagementRuntime<'_>,
    identity: &NetworkIdentity,
    captured_binding: &str,
    request_id: myagents_host_management_protocol::CanonicalUuid,
    authority: crate::management_ipc::InternalAuthority,
    scope: moxbots_asset_store::AssetScope,
    request: myagents_host_management_protocol::RemoteAssetRequest,
) -> Result<myagents_host_management_protocol::RemoteAssetResult, NetworkError> {
    use myagents_host_management_protocol::{
        CanonicalUuid, RemoteAssetRequest as R, RemoteAssetResult as O,
    };
    let R::List {
        agent_id,
        session_id,
        limit,
        before,
        ..
    } = request
    else {
        return Err(NetworkError::new("ASSET_REQUEST_INVALID"));
    };
    let store = runtime.ipc.asset_store();
    let scope_copy = scope.clone();
    let session_copy = session_id.clone();
    let page_value = mobile_internal_request(
        runtime,
        identity,
        captured_binding,
        request_id,
        authority.clone(),
        crate::management_ipc::InternalOperation::OwnerList {
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
            limit,
            before,
        },
    )
    .await?;
    if page_value.get("kind").and_then(serde_json::Value::as_str) == Some("error") {
        let code = page_value
            .get("code")
            .and_then(serde_json::Value::as_str)
            .filter(|v| {
                !v.is_empty()
                    && v.len() <= 128
                    && v.bytes()
                        .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
            })
            .unwrap_or("REMOTE_ASSET_OWNER_FAILED");
        return Ok(O::Error {
            version: 1,
            code: code.into(),
        });
    }
    let page: OwnerPage = serde_json::from_value(page_value)
        .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
    if page.kind != "owner-page"
        || page.agent_id != agent_id
        || page.session_id != session_id
        || page.items.len() > limit as usize
        || page.has_more != page.next_before.is_some()
    {
        return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
    }
    let mut items = Vec::with_capacity(page.items.len());
    for item in page.items {
        CanonicalUuid::parse(&item.source_id)
            .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
        let store_for_find = store.clone();
        let scope_for_find = scope_copy.clone();
        let session_for_find = session_copy.clone();
        let metadata = item.clone();
        let existing = tokio::task::spawn_blocking(move || {
            store_for_find.find_owner_source(
                &scope_for_find,
                &session_for_find,
                moxbots_asset_store::OwnerSourceMetadata {
                    source_id: &metadata.source_id,
                    name: &metadata.name,
                    mime_type: &metadata.mime_type,
                    size_bytes: metadata.size_bytes,
                    sha256: &metadata.sha256,
                },
            )
        })
        .await
        .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?
        .map_err(|error| NetworkError::new(error.code))?;
        let descriptor = if let Some(existing) = existing {
            existing
        } else {
            let upload = CanonicalUuid::new(uuid::Uuid::new_v4());
            store_execute(
                store.clone(),
                scope_copy.clone(),
                R::UploadBegin {
                    version: 1,
                    agent_id: agent_id.clone(),
                    upload_id: upload,
                    name: item.name.clone(),
                    mime_type: item.mime_type.clone(),
                    size_bytes: item.size_bytes,
                    sha256: item.sha256.clone(),
                },
            )
            .await?;
            let mut offset = 0u64;
            while offset < item.size_bytes {
                let chunk_value = mobile_internal_request(
                    runtime,
                    identity,
                    captured_binding,
                    request_id,
                    authority.clone(),
                    crate::management_ipc::InternalOperation::OwnerRead {
                        agent_id: agent_id.clone(),
                        session_id: session_id.clone(),
                        source_id: item.source_id.clone(),
                        offset,
                        max_bytes: 24 * 1024,
                    },
                )
                .await?;
                let chunk: OwnerChunk = serde_json::from_value(chunk_value)
                    .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
                if chunk.kind != "owner-chunk"
                    || chunk.source_id != item.source_id
                    || chunk.offset != offset
                {
                    return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
                }
                let bytes = base64::Engine::decode(
                    &base64::engine::general_purpose::STANDARD,
                    &chunk.data_base64,
                )
                .map_err(|_| NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))?;
                if bytes.is_empty()
                    || bytes.len() > 24 * 1024
                    || format!("{:x}", sha2::Sha256::digest(&bytes)) != chunk.sha256
                    || offset + bytes.len() as u64 > item.size_bytes
                    || chunk.eof != (offset + bytes.len() as u64 == item.size_bytes)
                {
                    return Err(NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"));
                }
                store_execute(
                    store.clone(),
                    scope_copy.clone(),
                    R::UploadChunk {
                        version: 1,
                        agent_id: agent_id.clone(),
                        upload_id: upload,
                        offset,
                        data_base64: chunk.data_base64,
                        sha256: chunk.sha256,
                    },
                )
                .await?;
                offset += bytes.len() as u64;
            }
            store_execute(
                store.clone(),
                scope_copy.clone(),
                R::UploadFinish {
                    version: 1,
                    agent_id: agent_id.clone(),
                    upload_id: upload,
                },
            )
            .await?;
            let store_for_bind = store.clone();
            let scope_for_bind = scope_copy.clone();
            let sess = session_copy.clone();
            let source_id = item.source_id.clone();
            tokio::task::spawn_blocking(move || {
                store_for_bind.bind_ready_upload(&scope_for_bind, &sess, upload, &source_id)
            })
            .await
            .map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?
            .map_err(|error| NetworkError::new(error.code))?
        };
        items.push(descriptor);
    }
    Ok(O::List {
        version: 1,
        agent_id,
        session_id,
        items,
        has_more: page.has_more,
        next_before: page.next_before,
    })
}
#[derive(Clone, Copy)]
struct ManagementRuntime<'a> {
    ipc: &'a crate::management_ipc::ManagementIpc,
    binding: &'a crate::management_admission::ManagementBinding,
}
struct ConnectionFeatures<'a> {
    management: Option<ManagementRuntime<'a>>,
    execution: &'a Option<Arc<BotExecution>>,
}
async fn connect(
    owner: &Owner,
    path: Option<&Path>,
    backoff: &mut ReconnectBackoff,
    owned: Option<&crate::owned::Connection>,
    join_authorized: &AtomicBool,
    admission_failed: &mut bool,
    features: ConnectionFeatures<'_>,
) -> Result<(), NetworkError> {
    let management = features.management;
    let execution = features.execution;
    let account = if let Some(owned) = owned {
        owned
            .account(join_authorized.load(Ordering::Acquire))
            .await?
    } else {
        let official = crate::auth::OfficialAccountSession::capture()?;
        official.upsert_device().await?;
        NetworkAccountSession::Official(official)
    };
    if let Some(runtime) = management {
        runtime.binding.verify()?;
        require_captured_binding(account.binding_id(), runtime.binding.account_binding())?;
    }
    publish(owner, path, "initializing", None, false, None)?;
    let mut identity =
        Arc::new(NetworkIdentity::initialize_with_store(account, None, owner.store.clone()).await?);
    let memory = MemoryBudget::default();
    let transport = Arc::new(NetworkTransport::new_with_public_ca(
        &identity.network_url,
        identity.device_key(),
        memory.clone(),
        identity.account.public_tls_ca(),
    )?);
    if let NetworkAccountSession::Owned(account) = &identity.account {
        // One operator grant belongs to this run, not each reconnect.
        let grant = consume_join_grant(join_authorized, &account.join_authorized);
        if let Err(error) =
            crate::agent_network::owned_admission::enroll(&identity, &transport, grant).await
        {
            *admission_failed = true;
            return Err(error);
        }
    }
    let mut socket = transport.websocket(&identity.token).await?;
    send(
        &mut socket,
        if owned.is_some() {
            management_hello()
        } else {
            hello()
        },
    )
    .await?;
    let (scope, local, _) = initial_hello(&mut socket, &identity).await?;
    publish(owner, path, "catalog", Some(&scope.network_id), false, None)?;
    let initial_catalog = if let Some(runtime) = management {
        catalog::read_initial_catalog(runtime.ipc, runtime.binding, &identity, &scope, &local)
            .await?
    } else {
        empty_catalog(scope.connection_epoch.clone())?
    };
    let uploaded = transport
        .json(
            NetworkRoute::Catalog,
            &identity.token,
            Some(initial_catalog),
        )
        .await?;
    if let Some(runtime) = management {
        catalog::verify_current(runtime.binding, &identity, &scope, &local)?;
    }
    catalog_ack::validate_catalog_ack(&uploaded, &scope.connection_epoch, 1).map_err(|error| {
        NetworkError::new(match error {
            catalog_ack::CatalogAckError::Invalid => "CATALOG_INVALID",
            catalog_ack::CatalogAckError::NotCurrent => "CATALOG_NOT_CURRENT",
        })
    })?;
    let mut policy = if owned.is_some() {
        policy::hydrate_owned(&transport, &identity.token, &local).await?
    } else {
        policy::hydrate(&transport, &identity.token, &local).await?
    };
    send(
        &mut socket,
        ClientMessage::Ready {
            scope: scope.clone(),
            catalog_seq: 1,
        },
    )
    .await?;
    let source_ready = Arc::new(AtomicBool::new(false));
    let source_signal = source_ready.clone();
    let source_identity = identity.clone();
    let source_scope = scope.clone();
    let source_local = local.clone();
    let source_publisher = async move {
        if let (Some(connection), Some(runtime)) = (owned, management) {
            let authority = crate::management_ipc::LocalSourceAuthority {
                connection: source_scope,
                local: source_local,
                account_binding: source_identity.account.binding_id().into(),
                management_binding: runtime.binding.account_binding().into(),
            };
            crate::notification_source::run(
                connection,
                runtime.ipc,
                runtime.binding,
                source_identity,
                authority,
                source_signal,
            )
            .await;
        }
        std::future::pending::<()>().await;
    };
    tokio::pin!(source_publisher);
    let mut ready = false;
    let mut execution_fence: Option<ExecutionFence> = None;
    let management_enabled =
        is_management_enabled(identity.account.is_management_only(), management.is_some());
    let mut pairs = management_enabled.then(|| Pairs::new_management(memory, PeerRole::Host));
    let mut pending_offers = std::collections::HashMap::<String, Offer>::new();
    let mut last_status = Instant::now();
    let mut last_server = Instant::now();
    let mut last_ping = Instant::now();
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    loop {
        identity.account.ensure_current()?;
        tokio::select! {
        _=&mut source_publisher=>{},
        incoming=socket.next()=>{
        last_server=Instant::now();
        match incoming{
        Some(Ok(Message::Ping(bytes)))=>socket.send(Message::Pong(bytes)).await.map_err(|_|NetworkError::new("NETWORK_CONNECTION_CLOSED"))?,
        Some(Ok(Message::Pong(_)))=>{},
        Some(Ok(Message::Text(text)))=>{
        if text=="ma-network-pong"{continue;}
        let envelope=ServerEnvelope::parse(text.as_bytes()).map_err(|_|NetworkError::new("CONTROL_INVALID"))?;
        if owned.is_some() { crate::agent_network::owned_profile::control(&envelope.message)?; }
        control_gate(&envelope.message,&scope,true,true)?;
        match envelope.message{
        ServerMessage::Ready{catalog_seq:1,..} if !ready=>{ready=true;source_ready.store(true,Ordering::Release);backoff.recovered();publish(owner,path,"ready",Some(&scope.network_id),true,None)?;execution_fence=start_execution(execution,identity.clone(),transport.clone(),&scope,&local,&policy)?;},
        ServerMessage::Changed{change:ChangeScope::Settings|ChangeScope::Catalog,..}=>{drop(execution_fence.take());publish(owner,path,"hydrating",Some(&scope.network_id),false,None)?;policy=if owned.is_some(){policy::hydrate_owned(&transport,&identity.token,&local).await?}else{policy::hydrate(&transport,&identity.token,&local).await?};if identity.account.is_management_only()&&!policy.joined{return Err(NetworkError::new("OWNED_MEMBERSHIP_REQUIRED"));}publish(owner,path,if ready{"ready"}else{"hydrating"},Some(&scope.network_id),ready,None)?;if ready{execution_fence=start_execution(execution,identity.clone(),transport.clone(),&scope,&local,&policy)?;}},
        ServerMessage::Changed{..} if identity.account.is_management_only()=>{
            drop(execution_fence.take());
            policy=policy::hydrate_owned(&transport,&identity.token,&local).await?;
            if !policy.joined{return Err(NetworkError::new("OWNED_MEMBERSHIP_REQUIRED"));}
            if ready{execution_fence=start_execution(execution,identity.clone(),transport.clone(),&scope,&local,&policy)?;}
        },
        ServerMessage::Changed{..}|ServerMessage::RouteClosed{..}=>{},
        ServerMessage::ChannelOffer{channel_id,initiator,responder,initiator_connection_epoch,responder_connection_epoch,initiator_binding,responder_binding,..}=>{
            if !ready {
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"HOST_NOT_READY".into()}).await?;
                continue;
            }
            let Some(pairs) = pairs.as_mut() else {
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"TARGET_UNAVAILABLE".into()}).await?;
                continue;
            };
            let offer=Offer{channel_id:channel_id.clone(),initiator,responder,initiator_epoch:initiator_connection_epoch,responder_epoch:responder_connection_epoch,initiator_binding,responder_binding};
            if offer.validate_scope(&local,&scope.connection_epoch).is_err() || pending_offers.contains_key(&channel_id) || pairs.has_channel(&channel_id) {
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"CHANNEL_SCOPE_MISMATCH".into()}).await?;
                continue;
            }
            if let Err(error) = pairs.reserve(&channel_id) {
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:error.code}).await?;
                continue;
            }
            identity=Arc::new(identity.as_ref().clone().ensure_peer().await?);
            let binding=identity.peer.as_ref().ok_or_else(||NetworkError::new("NETWORK_CERTIFICATE_INVALID"))?.signed_binding.clone();
            pending_offers.insert(channel_id.clone(),offer);
            if let Err(error)=send(&mut socket,ClientMessage::Accept{scope:scope.clone(),channel_id:channel_id.clone(),signed_binding:binding}).await {
                pairs.remove(&channel_id); pending_offers.remove(&channel_id); return Err(error);
            }
        },
        ServerMessage::ChannelAccepted{channel_id,initiator_binding,responder_binding,..}=>{
            let (Some(pairs),Some(mut offer))=(pairs.as_mut(),pending_offers.remove(&channel_id)) else {
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"CHANNEL_OFFER_MISSING".into()}).await?;
                continue;
            };
            let result=async {
                pairs.accepted(&channel_id)?;
                offer.initiator_binding=Some(initiator_binding); offer.responder_binding=Some(responder_binding);
                let verified=offer.verify(&identity,&local,&scope.connection_epoch).await?;
                pairs.install(verified,&local,&scope.connection_epoch)?;
                Ok::<(),NetworkError>(())
            }.await;
            if result.is_err() {
                pairs.remove(&channel_id);
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"CHANNEL_BINDING_INVALID".into()}).await?;
            }
        },
        ServerMessage::Credit{channel_id,sequence,received_bytes,..}=>{
            if let Some(pairs)=pairs.as_mut(){ if pairs.has_channel(&channel_id){ if let Err(error)=pairs.credit(&channel_id,sequence,received_bytes){pairs.remove(&channel_id);send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:error.code}).await?;} } }
        },
        ServerMessage::ChannelReady{channel_id,..}=>{
            if let Some(pairs)=pairs.as_mut(){ if pairs.has_channel(&channel_id){ if let Err(error)=pairs.ready(&channel_id){pairs.remove(&channel_id);send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:error.code}).await?;} else { let (events,allocation)=pairs.feed_management(&channel_id,&[]) ?; handle_management_events(&mut socket,pairs,&scope,&local,&channel_id,events,management,&identity).await?; drop(allocation); } } else { send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"CHANNEL_NOT_FOUND".into()}).await?; } }
        },
        ServerMessage::ChannelClosed{channel_id,..}=>{if let Some(pairs)=pairs.as_mut(){pairs.remove(&channel_id);} pending_offers.remove(&channel_id);},
        ServerMessage::Error{code,retryable}=>{let mut e=NetworkError::cloud(&code,400);e.retryable=retryable;return Err(e);},
        _=>return Err(NetworkError::new("CONTROL_UNEXPECTED")),
        }
        },Some(Ok(Message::Binary(bytes)))=>{
            let (channel_id,payload)=myagents_agent_network_protocol::decode_tls_frame(&bytes).map_err(|_|NetworkError::new("CHANNEL_FRAME_INVALID"))?;
            let Some(pairs)=pairs.as_mut() else { continue; };
            if !pairs.has_channel(&channel_id) {
                pairs.remove(&channel_id);
                pending_offers.remove(&channel_id);
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:"CHANNEL_NOT_FOUND".into()}).await?;
                continue;
            }
            identity.account.ensure_current()?;
            let (events,allocation)=match pairs.feed_management(&channel_id,payload){Ok(value)=>value,Err(error)=>{pairs.remove(&channel_id);send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:error.code}).await?;continue;}};
            handle_management_events(&mut socket,pairs,&scope,&local,&channel_id,events,management,&identity).await?;
            if pairs.has_channel(&channel_id) {
                let (sequence,received_bytes)=pairs.release_credit(&channel_id,bytes.len())?;
                send(&mut socket,ClientMessage::Credit{scope:scope.clone(),channel_id,sequence,received_bytes}).await?;
            }
            drop(allocation);
        },_=>return Err(NetworkError::new("NETWORK_CONNECTION_CLOSED"))}
        if let Some(pairs)=pairs.as_mut(){ drain_management(&mut socket,pairs,&scope).await?; }
        },_=tick.tick()=>{
        if identity.access.exp<=jsonwebtoken::get_current_timestamp(){return Err(NetworkError::new("NETWORK_TOKEN_EXPIRED"));}
        if last_server.elapsed()>Duration::from_millis(budget("offlineMs")as u64){return Err(NetworkError::new("NETWORK_CONNECTION_TIMEOUT"));}
        if last_ping.elapsed()>=Duration::from_millis(budget("pingMs")as u64){socket.send(Message::Text("ma-network-ping".into())).await.map_err(|_|NetworkError::new("NETWORK_CONNECTION_CLOSED"))?;last_ping=Instant::now();}
        // Reading the real relay policy is a Ready precondition; zero mounts do not
        // waive hydration or create local invocation authority.
        if last_status.elapsed()>=Duration::from_secs(10){publish(owner,path,if ready{"ready"}else{"hydrating"},Some(&scope.network_id),ready,None)?;last_status=Instant::now();}
        let _=(&policy.device_name,policy.joined,policy.membership_revision,policy.mounts.len());
        if let Some(pairs)=pairs.as_mut(){ drain_management(&mut socket,pairs,&scope).await?; }
        if let Some(pairs)=pairs.as_mut(){
            for (channel_id,reason) in pairs.expired(){
                pairs.remove(&channel_id);
                pending_offers.remove(&channel_id);
                send(&mut socket,ClientMessage::Close{scope:scope.clone(),channel_id,reason:reason.into()}).await?;
            }
        }
        }}
    }
}

async fn handle_management_events(
    socket: &mut crate::agent_network::transport::NetworkSocket,
    pairs: &mut Pairs,
    scope: &myagents_agent_network_protocol::ConnectionScope,
    local: &myagents_agent_network_protocol::DeviceScope,
    channel_id: &str,
    events: Vec<ManagementEvent>,
    management: Option<ManagementRuntime<'_>>,
    identity: &NetworkIdentity,
) -> Result<(), NetworkError> {
    for event in events {
        match event {
            ManagementEvent::Ready => {}
            ManagementEvent::Response { .. } => {
                pairs.remove(channel_id);
                send(
                    socket,
                    ClientMessage::Close {
                        scope: scope.clone(),
                        channel_id: channel_id.into(),
                        reason: "HOST_MANAGEMENT_UNEXPECTED_RESPONSE".into(),
                    },
                )
                .await?;
            }
            ManagementEvent::Request {
                request_id,
                method,
                params,
            } => {
                identity.account.ensure_current()?;
                if let Some(runtime) = management {
                    runtime.binding.verify()?;
                    require_captured_binding(
                        identity.account.binding_id(),
                        runtime.binding.account_binding(),
                    )?;
                }
                let result = match management {
                    Some(runtime) => {
                        match (method, params) {
                            (
                                myagents_host_management_protocol::ManagementMethod::RemoteAssets,
                                myagents_host_management_protocol::RequestParams::RemoteAssets {
                                    remote_assets,
                                },
                            ) => {
                                let (peer, peer_epoch) = pairs.peer(channel_id)?;
                                let captured_binding = identity.account.binding_id().to_owned();
                                let authority = crate::management_ipc::InternalAuthority {
                                    connection: scope.clone(),
                                    peer: peer.clone(),
                                    peer_epoch: peer_epoch.to_owned(),
                                    local: local.clone(),
                                    account_binding: captured_binding.clone(),
                                    management_binding: runtime
                                        .binding
                                        .account_binding()
                                        .to_owned(),
                                };
                                if matches!(
                                    remote_assets,
                                    myagents_host_management_protocol::RemoteAssetRequest::List { .. }
                                ) {
                                    let asset_scope = mobile_asset_scope(
                                        identity,
                                        peer,
                                        local,
                                        scope,
                                        remote_assets.agent_id(),
                                    )?;
                                    owner_list(runtime,identity,&captured_binding,request_id,authority,asset_scope,remote_assets).await
                                    .map(|data|myagents_host_management_protocol::ResponseResult::RemoteAssets{data})
                                } else {
                                    let asset_scope = mobile_asset_scope(
                                        identity,
                                        peer,
                                        local,
                                        scope,
                                        remote_assets.agent_id(),
                                    )?;
                                    let store = runtime.ipc.asset_store();
                                    let request = remote_assets.clone();
                                    let data = tokio::task::spawn_blocking(move || store.execute(&asset_scope, &request))
                                    .await.map_err(|_| NetworkError::new("ASSET_STORE_UNAVAILABLE"))?
                                    .unwrap_or_else(|error| myagents_host_management_protocol::RemoteAssetResult::Error { version:1, code:error.code.into() });
                                    Ok(myagents_host_management_protocol::ResponseResult::RemoteAssets { data })
                                }
                            }
                            (
                                myagents_host_management_protocol::ManagementMethod::RemoteMobile,
                                myagents_host_management_protocol::RequestParams::RemoteMobile {
                                    remote_mobile,
                                },
                            ) => {
                                let (peer, peer_epoch) = pairs.peer(channel_id)?;
                                let captured_binding = identity.account.binding_id().to_owned();
                                let authority = crate::management_ipc::InternalAuthority {
                                    connection: scope.clone(),
                                    peer: peer.clone(),
                                    peer_epoch: peer_epoch.to_owned(),
                                    local: local.clone(),
                                    account_binding: captured_binding.clone(),
                                    management_binding: runtime
                                        .binding
                                        .account_binding()
                                        .to_owned(),
                                };
                                let staged_mobile = match &remote_mobile {
                                    myagents_host_management_protocol::RemoteMobileRequest::Start{agent_id,operation_id,asset_ids,..} => Some((agent_id, operation_id.as_uuid().to_string(), asset_ids)),
                                    myagents_host_management_protocol::RemoteMobileRequest::Send{agent_id,session_id,asset_ids,..} => Some((agent_id, session_id.clone(), asset_ids)),
                                    _ => None,
                                };
                                if let Some((agent_id, session_id, asset_ids)) = staged_mobile {
                                    if !asset_ids.is_empty() {
                                        let asset_scope = mobile_asset_scope(
                                            identity, peer, local, scope, agent_id,
                                        )?;
                                        let store = runtime.ipc.asset_store();
                                        for asset in asset_ids {
                                            let store = store.clone();
                                            let scope_for_lease = asset_scope.clone();
                                            let asset_id = *asset;
                                            let lease = tokio::task::spawn_blocking(move || {
                                                store.ready_asset_lease(&scope_for_lease, asset_id)
                                            })
                                            .await
                                            .map_err(|_| {
                                                NetworkError::new("ASSET_STORE_UNAVAILABLE")
                                            })?
                                            .map_err(|error| NetworkError::new(error.code))?;
                                            let asset_id = asset.as_uuid().to_string();
                                            let stage=crate::management_ipc::InternalOperation::StageBegin{agent_id:agent_id.clone(),session_id:session_id.clone(),asset_id:asset_id.clone(),name:lease.name.clone(),mime_type:lease.mime_type.clone(),size_bytes:lease.size_bytes,sha256:lease.sha256.clone()};
                                            let begin_ack = mobile_internal_request(
                                                runtime,
                                                identity,
                                                &captured_binding,
                                                request_id,
                                                authority.clone(),
                                                stage,
                                            )
                                            .await?;
                                            validate_stage_ack(begin_ack, &asset_id, 0, false)?;
                                            let mut file =
                                                lease.file().try_clone().map_err(|_| {
                                                    NetworkError::new("ASSET_IO_FAILED")
                                                })?;
                                            use std::io::{Read, Seek, SeekFrom};
                                            file.seek(SeekFrom::Start(0)).map_err(|_| {
                                                NetworkError::new("ASSET_IO_FAILED")
                                            })?;
                                            let mut offset = 0u64;
                                            while offset < lease.size_bytes {
                                                let len = (lease.size_bytes - offset).min(24 * 1024)
                                                    as usize;
                                                let mut bytes = vec![0u8; len];
                                                file.read_exact(&mut bytes).map_err(|_| {
                                                    NetworkError::new("ASSET_IO_FAILED")
                                                })?;
                                                let sha256 =
                                                    format!("{:x}", sha2::Sha256::digest(&bytes));
                                                let data_base64 = base64::Engine::encode(
                                                    &base64::engine::general_purpose::STANDARD,
                                                    &bytes,
                                                );
                                                offset += len as u64;
                                                let ack=mobile_internal_request(runtime,identity,&captured_binding,request_id,authority.clone(),crate::management_ipc::InternalOperation::StageChunk{agent_id:agent_id.clone(),session_id:session_id.clone(),asset_id:asset_id.clone(),offset:offset-len as u64,data_base64,sha256}).await?;
                                                validate_stage_ack(ack, &asset_id, offset, false)?;
                                            }
                                            let finish_ack=mobile_internal_request(runtime,identity,&captured_binding,request_id,authority.clone(),crate::management_ipc::InternalOperation::StageFinish{agent_id:agent_id.clone(),session_id:session_id.clone(),asset_id:asset_id.clone()}).await?;
                                            validate_stage_ack(
                                                finish_ack, &asset_id, offset, true,
                                            )?;
                                        }
                                    }
                                }
                                mobile_internal_request(
                                        runtime,
                                        identity,
                                        &captured_binding,
                                        request_id,
                                        authority,
                                        crate::management_ipc::InternalOperation::Mobile {
                                            request: remote_mobile,
                                        },
                                    )
                                    .await
                                    .and_then(|value| {
                                        if value.get("kind").and_then(serde_json::Value::as_str)==Some("error") {
                                            let code=value.get("code").and_then(serde_json::Value::as_str)
                                                .filter(|v|!v.is_empty()&&v.len()<=128&&v.bytes().all(|b|b.is_ascii_uppercase()||b.is_ascii_digit()||b==b'_'))
                                                .unwrap_or("REMOTE_MOBILE_OPERATION_FAILED");
                                            Ok(myagents_host_management_protocol::ResponseResult::RemoteMobile{
                                                data:myagents_host_management_protocol::RemoteMobileResult::Error{version:1,code:code.into()},
                                            })
                                        } else {
                                            serde_json::from_value(value).map_err(|_|NetworkError::new("HOST_MANAGEMENT_RESPONSE_INVALID"))
                                        }
                                    })
                            }
                            (method, params) => {
                                runtime
                                    .ipc
                                    .request(channel_id, request_id, method, params)
                                    .await
                            }
                        }
                    }
                    None => Err(NetworkError::new("HOST_MANAGEMENT_UNCONFIRMED")),
                };
                if identity.account.ensure_current().is_err() {
                    pairs.remove(channel_id);
                    return Err(NetworkError::new("ACCOUNT_BINDING_CHANGED"));
                }
                if management.is_some_and(|runtime| runtime.binding.verify().is_err()) {
                    pairs.remove(channel_id);
                    return Err(NetworkError::new("HOST_MANAGEMENT_REBIND_REQUIRED"));
                }
                match result {
                    Ok(result) => {
                        if let Err(error) = pairs.send_management(
                            channel_id,
                            ManagementMessage::Response { request_id, result },
                        ) {
                            pairs.remove(channel_id);
                            send(
                                socket,
                                ClientMessage::Close {
                                    scope: scope.clone(),
                                    channel_id: channel_id.into(),
                                    reason: error.code,
                                },
                            )
                            .await?;
                        }
                    }
                    Err(_) => {
                        // The local operation may have committed before its response was lost.
                        // Never replay it; the owner can later query receipt.get.
                        pairs.remove(channel_id);
                        send(
                            socket,
                            ClientMessage::Close {
                                scope: scope.clone(),
                                channel_id: channel_id.into(),
                                reason: "HOST_MANAGEMENT_UNCONFIRMED".into(),
                            },
                        )
                        .await?;
                    }
                }
            }
        }
    }
    Ok(())
}

async fn drain_management(
    socket: &mut crate::agent_network::transport::NetworkSocket,
    pairs: &mut Pairs,
    scope: &myagents_agent_network_protocol::ConnectionScope,
) -> Result<(), NetworkError> {
    for channel_id in pairs.announce_ready() {
        send(
            socket,
            ClientMessage::ChannelReady {
                scope: scope.clone(),
                channel_id,
            },
        )
        .await?;
    }
    for _ in 0..256 {
        let failures = pairs.take_failures();
        for (channel_id, error) in failures {
            pairs.remove(&channel_id);
            send(
                socket,
                ClientMessage::Close {
                    scope: scope.clone(),
                    channel_id,
                    reason: error.code,
                },
            )
            .await?;
        }
        let Some(frame) = pairs.next_frame()? else {
            break;
        };
        socket
            .send(Message::Binary(frame))
            .await
            .map_err(|_| NetworkError::new("NETWORK_CONNECTION_CLOSED"))?;
    }
    let failures = pairs.take_failures();
    for (channel_id, error) in failures {
        pairs.remove(&channel_id);
        send(
            socket,
            ClientMessage::Close {
                scope: scope.clone(),
                channel_id,
                reason: error.code,
            },
        )
        .await?;
    }
    Ok(())
}
pub(crate) async fn run(owner: Arc<Owner>, path: Option<&Path>) -> Result<(), NetworkError> {
    run_context(owner, None, path, false, None, None, None).await
}
pub(crate) async fn run_owned(
    owner: Arc<Owner>,
    connection: &crate::owned::Connection,
    path: Option<&Path>,
    join_authorized: bool,
    execution: Option<Arc<BotExecution>>,
    management: Option<&crate::management_ipc::ManagementIpcConfig>,
) -> Result<(), NetworkError> {
    // Pin this run to the encrypted local account generation before creating
    // the reverse listener. A later login must start a new operator run.
    let management_binding = if management.is_some() {
        let account = connection.account(false).await?;
        Some(crate::management_admission::authorize(
            &connection.owner,
            &account,
        )?)
    } else {
        None
    };
    let ipc = management
        .map(crate::management_ipc::ManagementIpc::bind)
        .transpose()?;
    run_context(
        owner,
        Some(connection),
        path,
        join_authorized,
        ipc.as_ref(),
        management_binding.as_ref(),
        execution,
    )
    .await
}
fn management_hello() -> ClientMessage {
    ClientMessage::Hello {
        client_version: env!("CARGO_PKG_VERSION").into(),
        capabilities: vec!["tls13-mtls".into()],
        previous_connection: None,
    }
}
async fn run_context(
    owner: Arc<Owner>,
    owned: Option<&crate::owned::Connection>,
    path: Option<&Path>,
    join_authorized: bool,
    management_ipc: Option<&crate::management_ipc::ManagementIpc>,
    management_binding: Option<&crate::management_admission::ManagementBinding>,
    execution: Option<Arc<BotExecution>>,
) -> Result<(), NetworkError> {
    if management_ipc.is_some() != management_binding.is_some() {
        return Err(NetworkError::new("HOST_MANAGEMENT_BINDING_INVALID"));
    }
    let management = management_ipc
        .zip(management_binding)
        .map(|(ipc, binding)| ManagementRuntime { ipc, binding });
    let join_authorized = AtomicBool::new(join_authorized);
    let mut admission_failed = false;
    let mut backoff = ReconnectBackoff::default();
    loop {
        publish(&owner, path, "connecting", None, false, None)?;
        let result = tokio::select! {r=connect(&owner,path,&mut backoff,owned,&join_authorized,&mut admission_failed,ConnectionFeatures {management,execution:&execution})=>r,_=crate::shutdown()=>{publish(&owner,path,"stopped",None,false,None)?;return Ok(());}};
        let error = result.unwrap_err();
        let state = if [
            "SPACE_REAUTH_REQUIRED",
            "OWNED_REAUTH_REQUIRED",
            "ACCOUNT_AUTH_REVOKED",
            "NOT_AUTHENTICATED",
        ]
        .contains(&error.code.as_str())
        {
            "signedOut"
        } else if ["NETWORK_TOKEN_EXPIRED", "ACCOUNT_SESSION_EXPIRED"]
            .contains(&error.code.as_str())
        {
            "expired"
        } else {
            "unavailable"
        };
        publish(&owner, path, state, None, false, Some(&error.code))?;
        if management_ipc.is_some()
            && [
                "OWNED_REAUTH_REQUIRED",
                "OWNED_SESSION_INVALID",
                "ACCOUNT_BINDING_CHANGED",
                "ACCOUNT_SESSION_EXPIRED",
                "ACCOUNT_AUTH_REVOKED",
                "NOT_AUTHENTICATED",
                "SPACE_REAUTH_REQUIRED",
                "NETWORK_TRUST_CHANGED",
                "HOST_MANAGEMENT_REBIND_REQUIRED",
                "HOST_MANAGEMENT_GRANT_MISSING",
                "HOST_MANAGEMENT_GRANT_CORRUPT",
            ]
            .contains(&error.code.as_str())
        {
            // The reverse listener is pinned to this run's owned account. A
            // revoked/replaced binding ends the run instead of inheriting it.
            return Err(error);
        }
        // An uncertain enrollment mutation is not a transport retry.
        if admission_failed {
            return Err(error);
        }
        let id = uuid::Uuid::new_v4();
        let delay = backoff.next(
            u16::from_le_bytes([id.as_bytes()[0], id.as_bytes()[1]]),
            error.retry_after,
        );
        tokio::select! {_=tokio::time::sleep(delay)=>{},_=crate::shutdown()=>{publish(&owner,path,"stopped",None,false,None)?;return Ok(());}}
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn owned_hello_does_not_advertise_agent_execution_and_join_is_not_replayed() {
        let owned = serde_json::to_value(management_hello()).unwrap();
        assert_eq!(owned["capabilities"], serde_json::json!(["tls13-mtls"]));
        let official = serde_json::to_value(hello()).unwrap();
        assert_eq!(official["capabilities"].as_array().unwrap().len(), 4);
        let run = AtomicBool::new(true);
        let first_connection = AtomicBool::new(true);
        assert!(consume_join_grant(&run, &first_connection));
        assert!(!first_connection.load(Ordering::Acquire));
        // Even a newly constructed connection cannot reuse the old operator grant.
        let reconnected = AtomicBool::new(true);
        assert!(!consume_join_grant(&run, &reconnected));
        assert!(!reconnected.load(Ordering::Acquire));
        assert!(!consume_join_grant(
            &AtomicBool::new(false),
            &AtomicBool::new(true)
        ));
    }
    #[test]
    fn management_requires_both_owned_profile_and_explicit_operator_listener() {
        assert!(is_management_enabled(true, true));
        assert!(!is_management_enabled(false, true));
        assert!(!is_management_enabled(true, false));
        assert!(!is_management_enabled(false, false));
    }
    #[test]
    fn empty_catalog_is_real_explicit_zero_and_validated() {
        let value = empty_catalog(uuid::Uuid::new_v4().to_string()).unwrap();
        assert_eq!(value["items"], serde_json::json!([]));
        assert_eq!(value["catalogSeq"], 1);
    }
    #[test]
    fn ready_requires_scope_catalog_ack_and_hydrated_policy() {
        use myagents_agent_network_protocol::ConnectionScope;
        let scope = ConnectionScope {
            service_id: crate::state::SERVICE_ID.into(),
            network_id: uuid::Uuid::new_v4().to_string(),
            boot_epoch: uuid::Uuid::new_v4().to_string(),
            connection_epoch: uuid::Uuid::new_v4().to_string(),
        };
        let value = serde_json::json!({"version":1,"controlId":uuid::Uuid::new_v4().to_string(),"type":"ready.result","serviceId":scope.service_id,"networkId":scope.network_id,"bootEpoch":scope.boot_epoch,"connectionEpoch":scope.connection_epoch,"catalogSeq":1});
        let envelope = ServerEnvelope::parse(&serde_json::to_vec(&value).unwrap()).unwrap();
        for (catalog, policy) in [(false, false), (true, false), (false, true)] {
            assert_eq!(
                control_gate(&envelope.message, &scope, catalog, policy)
                    .unwrap_err()
                    .code,
                "READY_PRECONDITION_FAILED"
            );
        }
        control_gate(&envelope.message, &scope, true, true).unwrap();
        let mut newer = scope.clone();
        newer.connection_epoch = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            control_gate(&envelope.message, &newer, true, true)
                .unwrap_err()
                .code,
            "CONTROL_SCOPE_MISMATCH"
        );
        let wrong = ServerMessage::Ready {
            scope,
            catalog_seq: 2,
        };
        assert_eq!(
            control_gate(&wrong, &newer, true, true).unwrap_err().code,
            "CONTROL_SCOPE_MISMATCH"
        );
    }

    #[test]
    fn management_run_rejects_replaced_encrypted_account_binding() {
        let captured = uuid::Uuid::new_v4().to_string();
        assert!(require_captured_binding(&captured, &captured).is_ok());
        assert_eq!(
            require_captured_binding(&uuid::Uuid::new_v4().to_string(), &captured)
                .unwrap_err()
                .code,
            "ACCOUNT_BINDING_CHANGED"
        );
    }

    #[test]
    fn binding_change_after_staging_prevents_mobile_dispatch() {
        let captured = uuid::Uuid::new_v4().to_string();
        let management = captured.clone();
        assert!(verify_binding_snapshot(&captured, &management, &captured).is_ok());
        let account = uuid::Uuid::new_v4().to_string();
        let mut dispatched = false;
        // Staging may have completed under the original binding. The final
        // dispatch gate must observe a subsequent account replacement.
        if verify_binding_snapshot(&account, &management, &captured).is_ok() {
            dispatched = true;
        }
        assert!(!dispatched);
        assert_eq!(
            verify_binding_snapshot(&account, &management, &captured)
                .unwrap_err()
                .code,
            "ACCOUNT_BINDING_CHANGED"
        );
    }
}
