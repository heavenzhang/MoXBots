//! Optional generic hint publisher. Never owns or replays Session commands.
use crate::{
    agent_network::{account::NetworkAccountSession, identity::NetworkIdentity, NetworkError},
    management_admission::ManagementBinding,
    management_ipc::{LocalSourceAuthority, LocalSourceOperation, ManagementIpc},
    owned::Connection,
};
use myagents_host_management_protocol::CanonicalUuid;
use serde::Deserialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
#[derive(Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Hint {
    kind: String,
    source_event_id: String,
    connection_epoch: String,
    agent_id: String,
    session_id: String,
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
struct Confirm {
    version: u8,
    event_id: String,
}
fn uuid(s: &str) -> bool {
    uuid::Uuid::parse_str(s).is_ok_and(|id| id.to_string() == s)
}
fn invalid() -> NetworkError {
    NetworkError::new("HOST_NOTIFICATION_SOURCE_INVALID")
}
fn same_key_scope(
    key: &myagents_agent_network_crypto::KeyScope,
    local: &myagents_agent_network_protocol::DeviceScope,
) -> bool {
    key.service_id == local.service_id
        && key.environment == local.environment
        && key.principal_id == local.principal_id
        && key.device_id == local.device_id
        && key.key_generation == local.key_generation
}
fn current(
    identity: &NetworkIdentity,
    binding: &ManagementBinding,
    a: &LocalSourceAuthority,
) -> Result<(), NetworkError> {
    identity.account.ensure_current()?;
    binding.verify()?;
    let NetworkAccountSession::Owned(account) = &identity.account else {
        return Err(invalid());
    };
    if !same_key_scope(&identity.scope, &a.local)
        || account.session.network_id != a.local.network_id
        || a.connection.network_id != a.local.network_id
        || a.connection.service_id != a.local.service_id
    {
        return Err(invalid());
    }
    if identity.account.binding_id() != a.account_binding
        || binding.account_binding() != a.management_binding
        || a.account_binding != a.management_binding
    {
        return Err(invalid());
    }
    Ok(())
}
async fn peek(ipc: &ManagementIpc, a: &LocalSourceAuthority) -> Result<Option<Hint>, NetworkError> {
    let value = ipc
        .request_local_source(
            CanonicalUuid::new(uuid::Uuid::new_v4()),
            a.clone(),
            LocalSourceOperation::Peek,
        )
        .await?;
    if value == serde_json::json!({"kind":"source.empty"}) {
        return Ok(None);
    }
    let item: Hint = serde_json::from_value(value).map_err(|_| invalid())?;
    if item.kind != "source.hint"
        || !uuid(&item.source_event_id)
        || !uuid(&item.connection_epoch)
        || !uuid(&item.session_id)
        || item.agent_id.is_empty()
        || item.agent_id.len() > 256
        || !item
            .agent_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
    {
        return Err(invalid());
    }
    Ok(Some(item))
}
async fn publish(
    connection: &Connection,
    ipc: &ManagementIpc,
    binding: &ManagementBinding,
    identity: &NetworkIdentity,
    a: &LocalSourceAuthority,
) -> Result<bool, NetworkError> {
    current(identity, binding, a)?;
    let Some(item) = peek(ipc, a).await? else {
        return Ok(false);
    };
    current(identity, binding, a)?;
    // Read the original Rust-owned credential store afresh, never use WSS token.
    let account = connection.account(false).await?;
    current(identity, binding, a)?;
    let NetworkAccountSession::Owned(account) = account else {
        return Err(invalid());
    };
    if account.connection_id != a.account_binding {
        return Err(invalid());
    }
    let value=connection.client.notification_source_request("/api/mobile-notify/v1/source/challenges",serde_json::json!({"version":1,"sourceEventId":item.source_event_id,"connectionEpoch":item.connection_epoch,"agentId":item.agent_id,"sessionId":item.session_id}),&account.session.access_token).await?;
    current(identity, binding, a)?;
    let challenge: Challenge = serde_json::from_value(value).map_err(|_| invalid())?;
    if challenge.version != 1
        || !uuid(&challenge.challenge_id)
        || challenge.nonce.is_empty()
        || challenge.nonce.len() > 1024
        || challenge.expires_at <= jsonwebtoken::get_current_timestamp()
        || challenge.expires_at > jsonwebtoken::get_current_timestamp() + 120
    {
        return Err(invalid());
    }
    // Re-read origin projection after the asynchronous challenge before signing.
    if peek(ipc, a).await?.as_ref() != Some(&item) {
        return Err(invalid());
    }
    current(identity, binding, a)?;
    let proof = identity
        .device_key()
        .sign_proof(&challenge.challenge_id, &challenge.nonce)?;
    let value = connection
        .client
        .notification_source_request(
            "/api/mobile-notify/v1/source/hints",
            serde_json::json!({"version":1,"challengeId":challenge.challenge_id,"proof":proof}),
            &account.session.access_token,
        )
        .await?;
    current(identity, binding, a)?;
    let confirm: Confirm = serde_json::from_value(value).map_err(|_| invalid())?;
    if confirm.version != 1 || !uuid(&confirm.event_id) {
        return Err(invalid());
    }
    let ack = ipc
        .request_local_source(
            CanonicalUuid::new(uuid::Uuid::new_v4()),
            a.clone(),
            LocalSourceOperation::Ack {
                source_event_id: item.source_event_id.clone(),
                event_id: confirm.event_id,
            },
        )
        .await?;
    current(identity, binding, a)?;
    if ack != serde_json::json!({"kind":"source.ack","sourceEventId":item.source_event_id}) {
        return Err(invalid());
    }
    Ok(true)
}
/// This future is polled alongside the original socket and dropped on every
/// disconnect, logout, revocation or shutdown. IPC locks end before HTTPS.
pub(crate) async fn run(
    connection: &Connection,
    ipc: &ManagementIpc,
    binding: &ManagementBinding,
    identity: Arc<NetworkIdentity>,
    authority: LocalSourceAuthority,
    ready: Arc<AtomicBool>,
) {
    let mut failures = 0u32;
    loop {
        let delay = if failures == 0 {
            2
        } else {
            (2u64.saturating_pow(failures.min(6))).min(60)
        };
        tokio::time::sleep(Duration::from_secs(delay)).await;
        if !ready.load(Ordering::Acquire) {
            continue;
        }
        if current(&identity, binding, &authority).is_err() {
            return;
        }
        let result = tokio::time::timeout(
            Duration::from_secs(20),
            publish(connection, ipc, binding, &identity, &authority),
        )
        .await;
        match result {
            Ok(Ok(_)) => failures = 0,
            _ => failures = failures.saturating_add(1),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publisher_rejects_another_device_or_generation_before_signing() {
        let key = myagents_agent_network_crypto::KeyScope {
            issuer: "https://issuer.test".into(),
            service_id: "service".into(),
            environment: "development".into(),
            principal_id: "principal".into(),
            device_id: "device".into(),
            key_generation: 7,
        };
        let local = myagents_agent_network_protocol::DeviceScope {
            service_id: "service".into(),
            environment: "development".into(),
            network_id: "network".into(),
            principal_id: "principal".into(),
            device_id: "device".into(),
            key_generation: 7,
        };
        assert!(same_key_scope(&key, &local));
        for changed in [
            myagents_agent_network_protocol::DeviceScope {
                key_generation: 8,
                ..local.clone()
            },
            myagents_agent_network_protocol::DeviceScope {
                device_id: "other".into(),
                ..local.clone()
            },
            myagents_agent_network_protocol::DeviceScope {
                principal_id: "other".into(),
                ..local.clone()
            },
            myagents_agent_network_protocol::DeviceScope {
                service_id: "other".into(),
                ..local.clone()
            },
        ] {
            assert!(!same_key_scope(&key, &changed));
        }
    }
}

#[cfg(test)]
#[path = "notification_source_combined_test.rs"]
mod combined_test;
