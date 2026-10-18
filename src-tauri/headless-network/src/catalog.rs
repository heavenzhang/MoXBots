//! Initial managed Host registry; no partial/failed read is an empty catalog.
use crate::{
    agent_network::{account::NetworkAccountSession, identity::NetworkIdentity, NetworkError},
    management_admission::ManagementBinding,
    management_ipc::{LocalSourceAuthority, LocalSourceOperation, ManagementIpc},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use myagents_agent_network_protocol::{
    budget, CatalogItem, CatalogSnapshot, ConnectionScope, DeviceScope,
};
use myagents_host_management_protocol::CanonicalUuid;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashSet, time::Duration};

const CHUNK_BYTES: usize = 24 * 1024;
fn invalid() -> NetworkError {
    NetworkError::new("NETWORK_CATALOG_INVALID")
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(super) fn verify_current(
    binding: &ManagementBinding,
    identity: &NetworkIdentity,
    connection: &ConnectionScope,
    local: &DeviceScope,
) -> Result<(), NetworkError> {
    identity.account.ensure_current()?;
    binding.verify()?;
    let NetworkAccountSession::Owned(account) = &identity.account else {
        return Err(invalid());
    };
    let key = &identity.scope;
    if key.service_id != local.service_id
        || key.environment != local.environment
        || key.principal_id != local.principal_id
        || key.device_id != local.device_id
        || key.key_generation != local.key_generation
        || account.session.network_id != local.network_id
        || connection.network_id != local.network_id
        || connection.service_id != local.service_id
        || identity.account.binding_id() != binding.account_binding()
    {
        return Err(NetworkError::new("NETWORK_CATALOG_OWNER_CHANGED"));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Chunk {
    kind: String,
    observation: String,
    offset: usize,
    data_base64: String,
    next_cursor: Option<String>,
}
#[derive(Default)]
struct Read {
    bytes: Vec<u8>,
    observation: Option<String>,
    cursor: Option<String>,
    seen: HashSet<String>,
    chunks: usize,
    complete: bool,
}
impl Read {
    fn accept(&mut self, value: Value) -> Result<bool, NetworkError> {
        if self.complete
            || value
                .as_object()
                .is_none_or(|m| m.len() != 5 || !m.contains_key("nextCursor"))
        {
            return Err(invalid());
        }
        if serde_json::to_vec(&value).map_err(|_| invalid())?.len() > 48 * 1024 {
            return Err(invalid());
        }
        let chunk: Chunk = serde_json::from_value(value).map_err(|_| invalid())?;
        if chunk.kind != "catalog.chunk"
            || chunk.observation.len() != 64
            || !chunk
                .observation
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            || chunk.offset != self.bytes.len()
            || chunk.data_base64.len() > CHUNK_BYTES.div_ceil(3) * 4
        {
            return Err(invalid());
        }
        if self
            .observation
            .as_ref()
            .is_some_and(|h| h != &chunk.observation)
        {
            return Err(NetworkError::new("NETWORK_CATALOG_CHANGED"));
        }
        let bytes = STANDARD.decode(&chunk.data_base64).map_err(|_| invalid())?;
        if bytes.is_empty()
            || bytes.len() > CHUNK_BYTES
            || STANDARD.encode(&bytes) != chunk.data_base64
        {
            return Err(invalid());
        }
        if self.bytes.len() + bytes.len() > budget("catalogBytes") {
            return Err(NetworkError::new("NETWORK_CATALOG_TOO_LARGE"));
        }
        self.chunks += 1;
        if self.chunks > budget("catalogBytes") / CHUNK_BYTES + 1 {
            return Err(invalid());
        }
        self.bytes.extend_from_slice(&bytes);
        self.observation = Some(chunk.observation.clone());
        if let Some(cursor) = chunk.next_cursor {
            if bytes.len() != CHUNK_BYTES
                || cursor.len() > 128
                || cursor != format!("{}:{}", chunk.observation, self.bytes.len())
                || !self.seen.insert(cursor.clone())
            {
                return Err(invalid());
            }
            self.cursor = Some(cursor);
            Ok(false)
        } else {
            if hash(&self.bytes) != chunk.observation {
                return Err(NetworkError::new("NETWORK_CATALOG_CHANGED"));
            }
            self.complete = true;
            self.cursor = None;
            Ok(true)
        }
    }
    fn finish(self, epoch: String) -> Result<Value, NetworkError> {
        if !self.complete {
            return Err(invalid());
        }
        let items: Vec<CatalogItem> = serde_json::from_slice(&self.bytes).map_err(|_| invalid())?;
        if items.len() > budget("catalogItems") {
            return Err(NetworkError::new("NETWORK_CATALOG_TOO_LARGE"));
        }
        let mut agents = HashSet::new();
        let mut workspaces = HashSet::new();
        let mut paths = HashSet::new();
        for item in &items {
            if !agents.insert(&item.local_agent_id)
                || !workspaces.insert(&item.local_workspace_id)
                || !paths.insert(&item.path)
            {
                return Err(invalid());
            }
        }
        let value = serde_json::to_value(CatalogSnapshot {
            version: 1,
            connection_epoch: epoch,
            catalog_seq: 1,
            items,
        })
        .map_err(|_| invalid())?;
        if serde_json::to_vec(&value).map_err(|_| invalid())?.len() > budget("catalogBytes") {
            return Err(NetworkError::new("NETWORK_CATALOG_TOO_LARGE"));
        }
        myagents_agent_network_protocol::validate_catalog(&value).map_err(|_| invalid())?;
        Ok(value)
    }
}
pub(super) async fn read_initial_catalog(
    ipc: &ManagementIpc,
    binding: &ManagementBinding,
    identity: &NetworkIdentity,
    connection: &ConnectionScope,
    local: &DeviceScope,
) -> Result<Value, NetworkError> {
    tokio::time::timeout(Duration::from_secs(30), async {
        let authority = LocalSourceAuthority {
            connection: connection.clone(),
            local: local.clone(),
            account_binding: identity.account.binding_id().into(),
            management_binding: binding.account_binding().into(),
        };
        let mut read = Read::default();
        loop {
            verify_current(binding, identity, connection, local)?;
            let value = ipc
                .request_local_source(
                    CanonicalUuid::new(uuid::Uuid::new_v4()),
                    authority.clone(),
                    LocalSourceOperation::CatalogSnapshot {
                        cursor: read.cursor.clone(),
                    },
                )
                .await?;
            verify_current(binding, identity, connection, local)?;
            if read.accept(value)? {
                break;
            }
        }
        verify_current(binding, identity, connection, local)?;
        read.finish(connection.connection_epoch.clone())
    })
    .await
    .map_err(|_| NetworkError::new("NETWORK_CATALOG_UNAVAILABLE"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(id: &str) -> Value {
        serde_json::json!({"localAgentId":id,"localWorkspaceId":format!("w-{id}"),"name":"Agent","path":format!("/workspace/{id}"),"lifecycle":"active","exposureRevision":0,"icon":null})
    }
    fn chunks(items: Value) -> Vec<Value> {
        let bytes = serde_json::to_vec(&items).unwrap();
        let observation = hash(&bytes);
        bytes.chunks(CHUNK_BYTES).enumerate().map(|(n,b)|{let end=n*CHUNK_BYTES+b.len();serde_json::json!({"kind":"catalog.chunk","observation":observation,"offset":n*CHUNK_BYTES,"dataBase64":STANDARD.encode(b),"nextCursor":if end==bytes.len(){None}else{Some(format!("{observation}:{end}"))}})}).collect()
    }
    fn epoch() -> String {
        uuid::Uuid::new_v4().to_string()
    }
    #[test]
    fn accepts_complete_original_catalog_and_large_single_item_crossing_chunks() {
        let mut large = item("one");
        large["name"] = Value::String("\u{0001}".repeat(4096));
        large["path"] = Value::String("\u{0002}".repeat(16000));
        let pages = chunks(serde_json::json!([large, item("two")]));
        assert!(pages.len() > 2);
        let mut read = Read::default();
        for p in pages {
            read.accept(p).unwrap();
        }
        let result = read.finish(epoch()).unwrap();
        assert_eq!(result["catalogSeq"], 1);
        assert_eq!(result["items"].as_array().unwrap().len(), 2);
    }
    #[test]
    fn rejects_partial_duplicate_extra_fields_invalid_base64_and_changed_hash() {
        assert!(Read::default().finish(epoch()).is_err());
        let mut duplicate = Read::default();
        duplicate
            .accept(chunks(serde_json::json!([item("a"), item("a")])).remove(0))
            .unwrap();
        assert!(duplicate.finish(epoch()).is_err());
        for field in ["path", "catalogSeq", "connectionEpoch"] {
            let mut p = chunks(serde_json::json!([])).remove(0);
            p[field] = serde_json::json!("untrusted");
            assert!(Read::default().accept(p).is_err());
        }
        let mut p = chunks(serde_json::json!([])).remove(0);
        p["dataBase64"] = serde_json::json!("W10=\n");
        assert!(Read::default().accept(p).is_err());
        let mut p = chunks(serde_json::json!([])).remove(0);
        p["observation"] = serde_json::json!("0".repeat(64));
        assert!(Read::default().accept(p).is_err());
    }
    #[test]
    fn rejects_offset_gaps_repeat_cursor_and_observation_drift() {
        let mut a = item("a");
        a["name"] = Value::String("x".repeat(CHUNK_BYTES * 2));
        let pages = chunks(serde_json::json!([a]));
        let mut r = Read::default();
        r.accept(pages[0].clone()).unwrap();
        assert!(r.accept(pages[0].clone()).is_err());
        let mut r = Read::default();
        r.accept(pages[0].clone()).unwrap();
        let mut p = pages[1].clone();
        p["observation"] = serde_json::json!("0".repeat(64));
        assert!(r.accept(p).is_err());
        let mut p = pages[0].clone();
        p["offset"] = serde_json::json!(1);
        assert!(Read::default().accept(p).is_err());
        let mut p = pages[0].clone();
        p["nextCursor"] = serde_json::json!("0".repeat(64) + ":24576");
        assert!(Read::default().accept(p).is_err());
    }

    #[test]
    fn decodes_utf8_only_after_all_chunks_and_preserves_original_budgets() {
        let mut unicode = item("unicode");
        unicode["path"] = Value::String("🧪".repeat(8000));
        let pages = chunks(serde_json::json!([unicode]));
        assert!(pages.len() > 1);
        let mut read = Read::default();
        for p in pages {
            read.accept(p).unwrap();
        }
        assert_eq!(
            read.finish(epoch()).unwrap()["items"][0]["path"],
            "🧪".repeat(8000)
        );
        let many = Value::Array((0..5001).map(|n| item(&n.to_string())).collect());
        let mut read = Read::default();
        for p in chunks(many) {
            read.accept(p).unwrap();
        }
        assert!(read.finish(epoch()).is_err());
        let large = Value::Array(
            (0..2100)
                .map(|n| {
                    let mut i = item(&n.to_string());
                    i["name"] = Value::String("x".repeat(4096));
                    i
                })
                .collect(),
        );
        let mut read = Read::default();
        let failure = chunks(large)
            .into_iter()
            .find_map(|p| read.accept(p).err())
            .unwrap();
        assert_eq!(failure.code, "NETWORK_CATALOG_TOO_LARGE");
    }
}
