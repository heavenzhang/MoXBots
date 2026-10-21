//! Existing owned source proof protocol; no provider tokens or Session mutations.
use super::super::{
    account::NetworkAccountSession,
    catalog::read_local_catalog,
    identity::NetworkIdentity,
    local_owner::TargetIdentity,
    memory::MemoryBudget,
    owned_login::OwnedClient,
    policy::LocalPolicy,
    remote_session_target::{global, post, session},
    NetworkError,
};
use super::{Activation, DesktopNotificationSource, Observation, PolicyLease, SourceScope};
use crate::sidecar::ManagedSidecarManager;
use myagents_agent_network_protocol::{
    CatalogItem, CatalogLifecycle, ConnectionScope, DeviceScope,
};
use serde::Deserialize;
use serde_json::json;
use std::{path::Path, sync::Arc};

fn invalid() -> NetworkError {
    NetworkError::new("DESKTOP_NOTIFICATION_SOURCE_INVALID")
}
fn uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}

pub(in crate::agent_network) fn activation(
    identity: &NetworkIdentity,
    local: &DeviceScope,
    connection: &ConnectionScope,
    generation: u64,
) -> Result<Activation, NetworkError> {
    identity.account.ensure_current()?;
    let NetworkAccountSession::Owned(account) = &identity.account else {
        return Err(invalid());
    };
    let key = &identity.scope;
    if key.issuer != account.descriptor.issuer
        || key.service_id != local.service_id
        || key.environment != local.environment
        || key.principal_id != local.principal_id
        || key.device_id != local.device_id
        || key.key_generation != local.key_generation
        || account.session.principal_id != local.principal_id
        || account.device_id != local.device_id
        || account.session.network_id != local.network_id
        || connection.service_id != local.service_id
        || connection.network_id != local.network_id
    {
        return Err(invalid());
    }
    Ok(Activation {
        scope: SourceScope {
            issuer: account.descriptor.issuer.clone(),
            local: local.clone(),
            account_binding: identity.account.binding_id().into(),
        },
        connection: connection.clone(),
        generation,
    })
}

fn current(
    source: &DesktopNotificationSource,
    expected: &Activation,
    identity: &NetworkIdentity,
    lease: &PolicyLease,
) -> Result<(), NetworkError> {
    if !lease.current()
        || !source.current(expected)
        || activation(
            identity,
            &expected.scope.local,
            &expected.connection,
            expected.generation,
        )?
        .scope
            != expected.scope
    {
        return Err(invalid());
    }
    Ok(())
}

fn unique_agent<'a>(
    catalog: &'a [CatalogItem],
    policy: &LocalPolicy,
    workspace: &Path,
) -> Option<&'a str> {
    if !policy.joined {
        return None;
    }
    let path = crate::cron_task::normalize_path(&workspace.to_string_lossy());
    let mut matched = catalog.iter().filter(|item| {
        matches!(item.lifecycle, CatalogLifecycle::Active)
            && crate::cron_task::normalize_path(&item.path) == path
    });
    let item = matched.next()?;
    if matched.next().is_some()
        || !policy
            .mounts
            .values()
            .any(|m| m.enabled && m.agent_id == item.local_agent_id)
    {
        return None;
    }
    Some(item.local_agent_id.as_str())
}

async fn validate_pointer(
    manager: &ManagedSidecarManager,
    memory: &MemoryBudget,
    item: &Observation,
    agent_id: &str,
) -> Result<(), NetworkError> {
    let dispatch = global(manager)?;
    let (value, _allocation) = post(
        &dispatch,
        "/api/admin/agent/network-precheck",
        json!({"localAgentId":agent_id,"localSessionId":item.session_id}),
        memory,
    )
    .await?;
    let identity: TargetIdentity = serde_json::from_value(value).map_err(|_| invalid())?;
    if identity.local_agent_id != agent_id
        || identity.local_session_id.as_deref() != Some(&item.session_id)
        || crate::cron_task::normalize_path(&identity.workspace_path)
            != crate::cron_task::normalize_path(&item.workspace_path.to_string_lossy())
    {
        return Err(invalid());
    }
    Ok(())
}

/// Pending observations read the original, still-live Session projection. No
/// sidecar is started, no execution/approval is dispatched and no UI card is authority.
async fn observe_pending(
    source: &Arc<DesktopNotificationSource>,
    manager: &ManagedSidecarManager,
    identity: &NetworkIdentity,
    expected: &Activation,
    catalog: &[CatalogItem],
    policy: &LocalPolicy,
    memory: &MemoryBudget,
    lease: &PolicyLease,
) -> Result<(), NetworkError> {
    use myagents_host_management_protocol::{
        RemoteSessionRequest, RemoteSessionResult, RemoteSessionState,
    };
    let mut sessions: Vec<_> = manager
        .lock()
        .map_err(|_| invalid())?
        .live_sidecar_set()
        .into_iter()
        .collect();
    sessions.sort();
    // Deterministic rotation bounds work even when many user sessions are live.
    let offset = (jsonwebtoken::get_current_timestamp() / 2) as usize % sessions.len().max(1);
    for (session_id, generation) in sessions
        .iter()
        .cycle()
        .skip(offset)
        .take(sessions.len().min(4))
    {
        current(source, expected, identity, lease)?;
        let workspace = manager
            .lock()
            .map_err(|_| invalid())?
            .resolve_session_process_source(session_id, *generation)
            .map(|s| s.workspace_path);
        let Some(workspace) = workspace else {
            continue;
        };
        let Some(agent_id) = unique_agent(catalog, policy, &workspace) else {
            continue;
        };
        let Some(dispatch) = session(manager, session_id)? else {
            continue;
        };
        if dispatch.generation() != *generation {
            continue;
        }
        let request = RemoteSessionRequest::Get {
            agent_id: agent_id.into(),
            session_id: session_id.clone(),
            limit: 1,
            before: None,
        };
        let (value, _allocation) = post(
            &dispatch,
            "/api/remote-session",
            json!({"request":request,"generation":generation.to_string()}),
            memory,
        )
        .await?;
        let result: RemoteSessionResult = serde_json::from_value(value).map_err(|_| invalid())?;
        result.validate().map_err(|_| invalid())?;
        current(source, expected, identity, lease)?;
        if !manager
            .lock()
            .map_err(|_| invalid())?
            .is_live(session_id, *generation)
        {
            continue;
        }
        if let RemoteSessionResult::Snapshot {
            agent_id: actual_agent,
            session_id: actual_session,
            generation: Some(actual_generation),
            turn_id: Some(turn),
            state: RemoteSessionState::WaitingUserAction,
            interactions,
            ..
        } = result
        {
            if actual_agent != agent_id
                || actual_session != *session_id
                || actual_generation != generation.to_string()
            {
                return Err(invalid());
            }
            for interaction in interactions
                .into_iter()
                .filter(|i| i.actionable && i.turn_id == turn && i.generation == actual_generation)
            {
                let observation =
                    format!("interactive:{generation}:{turn}:{}", interaction.request_id);
                let source = source.clone();
                let expected = expected.clone();
                let session_id = session_id.clone();
                let workspace = workspace.clone();
                let original_manager = manager.clone();
                let original_generation = *generation;
                tokio::task::spawn_blocking(move || {
                    source.observe_guarded(&expected, &session_id, &workspace, &observation, || {
                        original_manager
                            .lock()
                            .is_ok_and(|m| m.is_live(&session_id, original_generation))
                    })
                })
                .await
                .map_err(|_| invalid())??;
            }
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Challenge {
    version: u8,
    challenge_id: String,
    nonce: String,
    expires_at: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Confirmation {
    version: u8,
    event_id: String,
}

pub(in crate::agent_network) async fn publish_once(
    source: Arc<DesktopNotificationSource>,
    manager: ManagedSidecarManager,
    identity: NetworkIdentity,
    expected: Activation,
    policy: LocalPolicy,
    memory: MemoryBudget,
    lease: PolicyLease,
) -> Result<(), NetworkError> {
    current(&source, &expected, &identity, &lease)?;
    let catalog = read_local_catalog(&manager).await?;
    current(&source, &expected, &identity, &lease)?;
    let pending_status = observe_pending(
        &source, &manager, &identity, &expected, &catalog, &policy, &memory, &lease,
    )
    .await;
    let source_read = source.clone();
    let captured = expected.clone();
    let items = tokio::task::spawn_blocking(move || source_read.candidates(&captured))
        .await
        .map_err(|_| invalid())??;
    let selected = select_pointer(&manager, &memory, items, &catalog, &policy).await?;
    let Some((item, agent_id)) = selected else {
        return pending_status;
    };
    publish_selected(
        source, manager, identity, expected, memory, item, agent_id, lease,
    )
    .await
}

async fn select_pointer(
    manager: &ManagedSidecarManager,
    memory: &MemoryBudget,
    items: Vec<Observation>,
    catalog: &[CatalogItem],
    policy: &LocalPolicy,
) -> Result<Option<(Observation, String)>, NetworkError> {
    let mut selected = None;
    for item in items {
        let Some(agent) = unique_agent(catalog, policy, &item.workspace_path) else {
            continue;
        };
        match validate_pointer(manager, memory, &item, agent).await {
            Ok(()) => {
                selected = Some((item, agent.to_owned()));
                break;
            }
            Err(e) if matches!(e.code.as_str(), "SESSION_NOT_FOUND" | "AGENT_NOT_AVAILABLE") => {
                continue
            }
            Err(e) => return Err(e),
        }
    }
    Ok(selected)
}

async fn publish_selected(
    source: Arc<DesktopNotificationSource>,
    manager: ManagedSidecarManager,
    identity: NetworkIdentity,
    expected: Activation,
    memory: MemoryBudget,
    item: Observation,
    agent_id: String,
    lease: PolicyLease,
) -> Result<(), NetworkError> {
    current(&source, &expected, &identity, &lease)?;
    let NetworkAccountSession::Owned(account) = &identity.account else {
        return Err(invalid());
    };
    let (client, discovered) =
        OwnedClient::discover(&account.descriptor.issuer, account.public_tls_ca.as_deref()).await?;
    account.descriptor.ensure_same_trust(&discovered)?;
    current(&source, &expected, &identity, &lease)?;
    let response = client.notification_source_request("/api/mobile-notify/v1/source/challenges", json!({
        "version":1,"sourceEventId":item.source_event_id,"connectionEpoch":expected.connection.connection_epoch,
        "agentId":agent_id,"sessionId":item.session_id
    }), &account.session.access_token).await?;
    current(&source, &expected, &identity, &lease)?;
    let challenge: Challenge = serde_json::from_value(response).map_err(|_| invalid())?;
    let now = jsonwebtoken::get_current_timestamp();
    if challenge.version != 1
        || !uuid(&challenge.challenge_id)
        || challenge.nonce.is_empty()
        || challenge.nonce.len() > 1024
        || challenge.expires_at <= now
        || challenge.expires_at > now + 120
    {
        return Err(invalid());
    }
    // Async discovery/challenge cannot turn a stale or moved Session into proof.
    validate_pointer(&manager, &memory, &item, &agent_id).await?;
    current(&source, &expected, &identity, &lease)?;
    let proof = identity
        .device_key()
        .sign_proof(&challenge.challenge_id, &challenge.nonce)?;
    current(&source, &expected, &identity, &lease)?;
    let response = client
        .notification_source_request(
            "/api/mobile-notify/v1/source/hints",
            json!({"version":1,"challengeId":challenge.challenge_id,"proof":proof}),
            &account.session.access_token,
        )
        .await?;
    current(&source, &expected, &identity, &lease)?;
    let confirmation: Confirmation = serde_json::from_value(response).map_err(|_| invalid())?;
    if confirmation.version != 1 || !uuid(&confirmation.event_id) {
        return Err(invalid());
    }
    tokio::task::spawn_blocking(move || {
        source.acknowledge_guarded(&expected, &item, &confirmation.event_id, || lease.current())
    })
    .await
    .map_err(|_| invalid())??;
    Ok(())
}
