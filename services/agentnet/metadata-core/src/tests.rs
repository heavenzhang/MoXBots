use super::*;
use base64::Engine;
use std::{
    os::unix::fs::{symlink, PermissionsExt},
    sync::Arc,
    thread,
    time::Duration,
};

fn context(device_id: String) -> SessionContext {
    SessionContext {
        principal_id: Uuid::new_v4().to_string(),
        network_id: Uuid::new_v4().to_string(),
        device_id,
        session_handle: Uuid::new_v4().to_string(),
        expires_at: now_seconds().unwrap() + 3600,
    }
}

fn profile() -> MetadataProfile {
    MetadataProfile {
        service_id: Uuid::new_v4().to_string(),
        environment: "development".into(),
        network_name: "local test network".into(),
    }
}

fn private_dir() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
    dir
}

fn record(context: &SessionContext, generation: u64, fingerprint: &str) -> DeviceRecord {
    DeviceRecord {
        principal_id: context.principal_id.clone(),
        network_id: context.network_id.clone(),
        device_id: context.device_id.clone(),
        identity_binding_id: Uuid::new_v4().to_string(),
        key_generation: generation,
        key_fingerprint: fingerprint.into(),
        csr_pem: "internal verified CSR fixture".into(),
    }
}

fn info() -> DeviceInfo {
    DeviceInfo {
        name: "Linux Host".into(),
        platform: "linux".into(),
        os_version: "test".into(),
        app_version: "test".into(),
    }
}

fn fingerprint() -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode([7u8; 32])
}

fn register(store: &MetadataStore, context: &SessionContext) -> DeviceRecord {
    let record = record(context, 1, &fingerprint());
    store.register_device(context, &record, &info()).unwrap();
    record
}

fn snapshot(
    epoch: &str,
    seq: u64,
    items: Vec<myagents_agent_network_protocol::CatalogItem>,
) -> CatalogSnapshot {
    CatalogSnapshot {
        version: 1,
        connection_epoch: epoch.into(),
        catalog_seq: seq,
        items,
    }
}

fn catalog_item(
    n: usize,
    lifecycle: myagents_agent_network_protocol::CatalogLifecycle,
) -> myagents_agent_network_protocol::CatalogItem {
    myagents_agent_network_protocol::CatalogItem {
        local_agent_id: format!("agent-{n}"),
        local_workspace_id: format!("workspace-{n}"),
        name: format!("Agent {n}"),
        path: format!("/srv/agent-{n}"),
        lifecycle,
        exposure_revision: 0,
        icon: None,
    }
}

#[test]
fn registration_starts_offline_unjoined_and_owner_partitioned() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    register(&store, &own);
    let network = store.get_network(&own).unwrap();
    validate_metadata(MetadataKind::Network, &network).unwrap();
    let devices = store.list_devices(&own, None, 200).unwrap();
    validate_metadata(MetadataKind::Devices, &devices).unwrap();
    assert_eq!(devices["complete"], true);
    let item = &devices["items"][0];
    assert_eq!(item["joined"], false);
    assert_eq!(item["membershipRevision"], 0);
    assert_eq!(item["connectionState"], "offline");
    assert_eq!(item["catalogEpoch"], Value::Null);
    assert_eq!(item["onlineAgentCount"], Value::Null);

    let foreign = SessionContext {
        principal_id: Uuid::new_v4().to_string(),
        ..own.clone()
    };
    assert_eq!(
        store.get_network(&foreign).unwrap_err(),
        MetadataError::DeviceNotRegistered
    );
    assert_eq!(
        store
            .list_agents(&foreign, &own.device_id, None, 200)
            .unwrap_err(),
        MetadataError::DeviceNotRegistered
    );
    assert_eq!(
        store
            .register_device(&foreign, &record(&foreign, 1, &fingerprint()), &info())
            .unwrap_err(),
        MetadataError::DeviceOwnerMismatch,
        "one network cannot claim the same device UUID under another principal"
    );
}

#[test]
fn mutation_cas_receipts_are_atomic_and_scoped() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let context = context(Uuid::new_v4().to_string());
    let identity = register(&store, &context);
    let mutation_id = Uuid::new_v4().to_string();
    let joined = store
        .mutate_membership(&context, &context.device_id, true, 0, &mutation_id)
        .unwrap();
    validate_metadata(MetadataKind::Membership, &joined).unwrap();
    assert_eq!(joined["joined"], true);
    assert_eq!(joined["membershipRevision"], 1);
    assert_eq!(
        store
            .mutate_membership(&context, &context.device_id, true, 0, &mutation_id)
            .unwrap(),
        joined
    );
    assert_eq!(
        store
            .mutate_membership(&context, &context.device_id, false, 1, &mutation_id)
            .unwrap_err(),
        MetadataError::ReceiptConflict
    );
    assert_eq!(store.get_receipt(&context, &mutation_id).unwrap(), joined);

    let rename_id = Uuid::new_v4().to_string();
    let renamed = store
        .rename_device(
            &context,
            &context.device_id,
            "New name",
            "Linux Host",
            &rename_id,
        )
        .unwrap();
    validate_metadata(MetadataKind::DeviceName, &renamed).unwrap();
    assert_eq!(renamed["name"], "New name");
    assert_eq!(
        store.get_device_name(&context, &context.device_id).unwrap(),
        renamed
    );
    store.register_device(&context, &identity, &info()).unwrap();
    let devices = store.list_devices(&context, None, 200).unwrap();
    assert_eq!(
        devices["items"][0]["name"], "New name",
        "reconnect metadata must not overwrite a remote CAS rename"
    );
    assert_eq!(
        store
            .rename_device(
                &context,
                &context.device_id,
                "Other",
                "Linux Host",
                &Uuid::new_v4().to_string()
            )
            .unwrap_err(),
        MetadataError::NameConflict
    );
    assert_eq!(
        store
            .mutate_membership(
                &context,
                &context.device_id,
                false,
                0,
                &Uuid::new_v4().to_string()
            )
            .unwrap_err(),
        MetadataError::MembershipConflict
    );

    let foreign = SessionContext {
        principal_id: Uuid::new_v4().to_string(),
        ..context.clone()
    };
    assert_eq!(
        store.get_receipt(&foreign, &mutation_id).unwrap_err(),
        MetadataError::ReceiptNotFound
    );
    store
        .connection
        .lock()
        .unwrap()
        .execute(
            "UPDATE mutation_receipts SET expires_at=?1 WHERE mutation_id=?2",
            params![now_seconds().unwrap() - 1, mutation_id],
        )
        .unwrap();
    assert_eq!(
        store.get_receipt(&context, &mutation_id).unwrap_err(),
        MetadataError::ReceiptExpired
    );
}

#[test]
fn expired_mutation_ids_remain_anti_replay_tombstones_across_restart() {
    let dir = private_dir();
    let metadata_profile = profile();
    let context = context(Uuid::new_v4().to_string());
    let mutation_a = Uuid::new_v4().to_string();
    let mutation_b = Uuid::new_v4().to_string();
    {
        let store = MetadataStore::open(dir.path(), metadata_profile.clone()).unwrap();
        register(&store, &context);
        store
            .mutate_membership(&context, &context.device_id, true, 0, &mutation_a)
            .unwrap();
        store
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE mutation_receipts SET expires_at=?1 WHERE mutation_id=?2",
                params![now_seconds().unwrap() - 1, mutation_a],
            )
            .unwrap();
        store
            .mutate_membership(&context, &context.device_id, false, 1, &mutation_b)
            .unwrap();
    }

    let store = MetadataStore::open(dir.path(), metadata_profile).unwrap();
    assert_eq!(
        store
            .mutate_membership(&context, &context.device_id, true, 0, &mutation_a)
            .unwrap_err(),
        MetadataError::ReceiptExpired
    );
    assert_eq!(
        store
            .mutate_membership(&context, &context.device_id, true, 2, &mutation_a)
            .unwrap_err(),
        MetadataError::ReceiptExpired,
        "an expired UUID stays rejected even with a different request body"
    );
    let devices = store.list_devices(&context, None, 200).unwrap();
    assert_eq!(devices["items"][0]["joined"], false);
    assert_eq!(devices["items"][0]["membershipRevision"], 2);
    let tombstone: (String, String) = store
        .connection
        .lock()
        .unwrap()
        .query_row(
            "SELECT payload_hash,response_json FROM mutation_receipts WHERE mutation_id=?1",
            params![mutation_a],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!(!tombstone.0.is_empty());
    assert_eq!(tombstone.1, "");
}

#[test]
fn catalog_requires_trusted_epoch_and_exact_sequence_before_ready() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let context = context(Uuid::new_v4().to_string());
    register(&store, &context);
    let epoch = Uuid::new_v4().to_string();
    let zero = snapshot(&epoch, 1, vec![]);
    assert_eq!(
        store
            .upload_catalog(&context, 1, &epoch, &zero)
            .unwrap_err(),
        MetadataError::CatalogStale,
        "a caller-supplied epoch is not authority until relay Syncing establishes it"
    );
    store
        .set_presence(&context, 1, &epoch, Presence::Syncing, None)
        .unwrap();
    let ack = store.upload_catalog(&context, 1, &epoch, &zero).unwrap();
    validate_metadata(MetadataKind::Catalog, &ack).unwrap();
    assert_eq!(ack["connectionEpoch"], epoch);
    assert_eq!(ack["catalogSeq"], 1);
    assert_eq!(
        store.upload_catalog(&context, 1, &epoch, &zero).unwrap(),
        ack
    );
    assert_eq!(
        store
            .upload_catalog(
                &context,
                1,
                &epoch,
                &snapshot(
                    &epoch,
                    1,
                    vec![catalog_item(
                        1,
                        myagents_agent_network_protocol::CatalogLifecycle::Active
                    )]
                )
            )
            .unwrap_err(),
        MetadataError::CatalogConflict
    );
    assert_eq!(
        store
            .upload_catalog(&context, 1, &Uuid::new_v4().to_string(), &zero)
            .unwrap_err(),
        MetadataError::CatalogStale
    );
    assert_eq!(
        store
            .set_presence(&context, 1, &epoch, Presence::Ready, Some(2))
            .unwrap_err(),
        MetadataError::CatalogStale
    );
    store
        .set_presence(&context, 1, &epoch, Presence::Ready, Some(1))
        .unwrap();
    let devices = store.list_devices(&context, None, 200).unwrap();
    validate_metadata(MetadataKind::Devices, &devices).unwrap();
    assert_eq!(devices["items"][0]["connectionState"], "ready");
    assert_eq!(devices["items"][0]["onlineAgentCount"], 0);
    assert_eq!(
        store.upload_catalog(&context, 1, &epoch, &zero).unwrap(),
        ack
    );
    let devices = store.list_devices(&context, None, 200).unwrap();
    assert_eq!(
        devices["items"][0]["connectionState"], "ready",
        "identical same-sequence retransmission does not clear Ready"
    );
    let agents = store
        .list_agents(&context, &context.device_id, None, 200)
        .unwrap();
    validate_metadata(MetadataKind::Agents, &agents).unwrap();
    assert_eq!(agents["complete"], true);
    assert_eq!(agents["items"], json!([]));

    let seq_two = snapshot(
        &epoch,
        2,
        vec![catalog_item(
            2,
            myagents_agent_network_protocol::CatalogLifecycle::Active,
        )],
    );
    store.upload_catalog(&context, 1, &epoch, &seq_two).unwrap();
    assert_eq!(
        store.set_presence(&context, 1, &epoch, Presence::Ready, Some(1)),
        Err(MetadataError::CatalogStale)
    );
    let devices = store.list_devices(&context, None, 200).unwrap();
    assert_eq!(devices["items"][0]["connectionState"], "syncing");
    assert_eq!(devices["items"][0]["onlineAgentCount"], Value::Null);
    assert_eq!(
        store
            .list_agents(&context, &context.device_id, None, 200)
            .unwrap_err(),
        MetadataError::CatalogStale
    );
    store
        .set_presence(&context, 1, &epoch, Presence::Ready, Some(2))
        .unwrap();
    let agents = store
        .list_agents(&context, &context.device_id, None, 200)
        .unwrap();
    assert_eq!(agents["items"].as_array().unwrap().len(), 1);

    let next_epoch = Uuid::new_v4().to_string();
    store
        .set_presence(&context, 1, &next_epoch, Presence::Syncing, None)
        .unwrap();
    assert_eq!(
        store
            .set_presence(&context, 1, &epoch, Presence::Offline, None)
            .unwrap_err(),
        MetadataError::CatalogStale,
        "a delayed old socket cannot take the new connection offline"
    );
    store
        .upload_catalog(
            &context,
            1,
            &next_epoch,
            &snapshot(
                &next_epoch,
                1,
                vec![catalog_item(
                    9,
                    myagents_agent_network_protocol::CatalogLifecycle::Active,
                )],
            ),
        )
        .unwrap();
    let devices = store.list_devices(&context, None, 200).unwrap();
    assert_eq!(devices["items"][0]["connectionState"], "syncing");
    assert_eq!(devices["items"][0]["onlineAgentCount"], Value::Null);
    store
        .set_presence(&context, 1, &next_epoch, Presence::Ready, Some(1))
        .unwrap();
    let agents = store
        .list_agents(&context, &context.device_id, None, 200)
        .unwrap();
    validate_metadata(MetadataKind::Agents, &agents).unwrap();
    assert_eq!(agents["items"].as_array().unwrap().len(), 1);
    assert_eq!(agents["items"][0]["enabled"], false);
}

#[test]
fn relay_state_and_self_policy_use_only_complete_current_durable_catalog() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    let identity = register(&store, &own);
    let joined = store
        .mutate_membership(&own, &own.device_id, true, 0, &Uuid::new_v4().to_string())
        .unwrap();
    assert_eq!(joined["membershipRevision"], 1);

    let offline = store.read_relay_state(&own, &own.device_id).unwrap();
    assert_eq!(offline.key_generation, 1);
    assert_eq!(offline.identity_binding_id, identity.identity_binding_id);
    assert_eq!(offline.key_fingerprint, identity.key_fingerprint);
    assert!(offline.joined);
    assert_eq!(offline.membership_revision, 1);
    assert_eq!(offline.network_revision, 2);
    assert_eq!(offline.connection_epoch, None);
    assert_eq!(offline.catalog_epoch, None);
    assert_eq!(offline.durable_ack_seq, None);
    assert_eq!(offline.presence, Presence::Offline);

    let epoch = Uuid::new_v4().to_string();
    store
        .set_presence(&own, 1, &epoch, Presence::Syncing, None)
        .unwrap();
    assert_eq!(
        store.list_self_policy(&own, &epoch, None, 1).unwrap_err(),
        MetadataError::CatalogStale,
        "Syncing by itself is not a durable catalog acknowledgement"
    );
    assert_eq!(
        store
            .list_agents(&own, &own.device_id, None, 1)
            .unwrap_err(),
        MetadataError::CatalogStale,
        "ordinary agent directories remain Ready-only"
    );
    let syncing = store.read_relay_state(&own, &own.device_id).unwrap();
    assert_eq!(syncing.connection_epoch.as_deref(), Some(epoch.as_str()));
    assert_eq!(syncing.durable_ack_seq, None);
    assert_eq!(syncing.presence, Presence::Syncing);

    let empty_catalog = snapshot(&epoch, 1, vec![]);
    store
        .upload_catalog(&own, 1, &epoch, &empty_catalog)
        .unwrap();
    let empty_state = store.read_relay_state(&own, &own.device_id).unwrap();
    assert_eq!(empty_state.durable_ack_seq, Some(1));
    let empty_policy = store.list_self_policy(&own, &epoch, None, 1).unwrap();
    assert!(empty_policy.items.is_empty());
    assert!(empty_policy.complete);

    let full_catalog = snapshot(
        &epoch,
        4,
        vec![
            catalog_item(1, myagents_agent_network_protocol::CatalogLifecycle::Active),
            catalog_item(2, myagents_agent_network_protocol::CatalogLifecycle::Active),
        ],
    );
    store
        .upload_catalog(&own, 1, &epoch, &full_catalog)
        .unwrap();
    let state = store.read_relay_state(&own, &own.device_id).unwrap();
    assert_eq!(state.connection_epoch.as_deref(), Some(epoch.as_str()));
    assert_eq!(state.catalog_epoch.as_deref(), Some(epoch.as_str()));
    assert_eq!(state.catalog_seq, 4);
    assert_eq!(state.durable_ack_seq, Some(4));
    assert_eq!(state.presence, Presence::Syncing);

    let first_page = store.list_self_policy(&own, &epoch, None, 1).unwrap();
    validate_metadata(
        MetadataKind::Agents,
        &serde_json::to_value(&first_page).unwrap(),
    )
    .unwrap();
    assert_eq!(first_page.items.len(), 1);
    assert!(!first_page.complete);
    let old_cursor = first_page.next_cursor.unwrap();
    let second_page = store
        .list_self_policy(&own, &epoch, Some(&old_cursor), 1)
        .unwrap();
    assert_eq!(second_page.items.len(), 1);
    assert!(second_page.complete);
    assert_eq!(
        store
            .list_self_policy(&own, &Uuid::new_v4().to_string(), None, 1)
            .unwrap_err(),
        MetadataError::CatalogStale
    );

    let same_account_other_device = context(Uuid::new_v4().to_string());
    let same_account_other_device = SessionContext {
        principal_id: own.principal_id.clone(),
        network_id: own.network_id.clone(),
        ..same_account_other_device
    };
    register(&store, &same_account_other_device);
    assert_eq!(
        store
            .list_self_policy(&same_account_other_device, &epoch, None, 1)
            .unwrap_err(),
        MetadataError::CatalogStale,
        "a device cannot hydrate another device's relay policy"
    );
    assert_eq!(
        store
            .read_relay_state(&own, &same_account_other_device.device_id)
            .unwrap()
            .presence,
        Presence::Offline,
        "same-account relay state remains a scoped owner projection"
    );
    let foreign = SessionContext {
        principal_id: Uuid::new_v4().to_string(),
        ..own.clone()
    };
    assert_eq!(
        store
            .read_relay_state(&foreign, &own.device_id)
            .unwrap_err(),
        MetadataError::DeviceNotRegistered
    );

    store
        .set_presence(&own, 1, &epoch, Presence::Ready, Some(4))
        .unwrap();
    assert_eq!(
        store.list_agents(&own, &own.device_id, None, 10).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );

    let next_epoch = Uuid::new_v4().to_string();
    store
        .set_presence(&own, 1, &next_epoch, Presence::Syncing, None)
        .unwrap();
    assert_eq!(
        store
            .read_relay_state(&own, &own.device_id)
            .unwrap()
            .durable_ack_seq,
        None,
        "a previous epoch's persisted catalog is not a current ACK"
    );
    assert_eq!(
        store
            .list_self_policy(&own, &epoch, Some(&old_cursor), 1)
            .unwrap_err(),
        MetadataError::CatalogStale
    );
    store
        .upload_catalog(
            &own,
            1,
            &next_epoch,
            &snapshot(&next_epoch, 1, full_catalog.items.clone()),
        )
        .unwrap();
    assert_eq!(
        store
            .list_self_policy(&own, &next_epoch, Some(&old_cursor), 1)
            .unwrap_err(),
        MetadataError::InvalidCursor,
        "self-policy cursors are bound to the current connection epoch"
    );
    let new_page = store.list_self_policy(&own, &next_epoch, None, 10).unwrap();
    assert_eq!(new_page.items.len(), 2);
    assert!(new_page.complete);

    let mut expired = own.clone();
    expired.expires_at = now_seconds().unwrap() - 1;
    assert_eq!(
        store
            .read_relay_state(&expired, &own.device_id)
            .unwrap_err(),
        MetadataError::InvalidSession
    );
}

#[test]
fn lifecycle_close_connection_only_offlines_exact_current_identity_epoch() {
    use myagents_agent_network_protocol::DeviceScope;

    let dir = private_dir();
    let metadata_profile = profile();
    let store = MetadataStore::open(dir.path(), metadata_profile.clone()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    let identity = register(&store, &own);
    store
        .mutate_membership(&own, &own.device_id, true, 0, &Uuid::new_v4().to_string())
        .unwrap();
    let epoch = Uuid::new_v4().to_string();
    store
        .set_presence(&own, 1, &epoch, Presence::Syncing, None)
        .unwrap();
    store
        .upload_catalog(
            &own,
            1,
            &epoch,
            &snapshot(
                &epoch,
                7,
                vec![catalog_item(
                    3,
                    myagents_agent_network_protocol::CatalogLifecycle::Active,
                )],
            ),
        )
        .unwrap();
    store
        .set_presence(&own, 1, &epoch, Presence::Ready, Some(7))
        .unwrap();

    let scope = DeviceScope {
        service_id: metadata_profile.service_id.clone(),
        environment: metadata_profile.environment.clone(),
        network_id: own.network_id.clone(),
        principal_id: own.principal_id.clone(),
        device_id: own.device_id.clone(),
        key_generation: identity.key_generation,
    };
    assert!(store
        .close_connection(&scope, &identity.key_fingerprint, &epoch)
        .unwrap());
    assert!(!store
        .close_connection(&scope, &identity.key_fingerprint, &epoch)
        .unwrap());
    let offline = store.read_relay_state(&own, &own.device_id).unwrap();
    assert_eq!(offline.presence, Presence::Offline);
    assert!(offline.joined);
    assert_eq!(offline.membership_revision, 1);
    assert_eq!(offline.connection_epoch.as_deref(), Some(epoch.as_str()));
    assert_eq!(offline.catalog_epoch.as_deref(), Some(epoch.as_str()));
    assert_eq!(offline.catalog_seq, 7);
    assert_eq!(offline.durable_ack_seq, Some(7));

    let next_epoch = Uuid::new_v4().to_string();
    store
        .set_presence(&own, 1, &next_epoch, Presence::Syncing, None)
        .unwrap();
    assert!(
        !store
            .close_connection(&scope, &identity.key_fingerprint, &epoch)
            .unwrap(),
        "old EOF must not take a replacement offline"
    );
    assert_eq!(
        store
            .read_relay_state(&own, &own.device_id)
            .unwrap()
            .presence,
        Presence::Syncing
    );

    let mut wrong = scope.clone();
    wrong.key_generation += 1;
    assert!(!store
        .close_connection(&wrong, &identity.key_fingerprint, &next_epoch)
        .unwrap());
    let wrong_fingerprint = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode([8u8; 32]);
    assert!(!store
        .close_connection(&scope, &wrong_fingerprint, &next_epoch)
        .unwrap());
    let mut wrong_owner = scope.clone();
    wrong_owner.principal_id = Uuid::new_v4().to_string();
    assert!(!store
        .close_connection(&wrong_owner, &identity.key_fingerprint, &next_epoch)
        .unwrap());
    let mut wrong_service = scope.clone();
    wrong_service.service_id = Uuid::new_v4().to_string();
    assert!(!store
        .close_connection(&wrong_service, &identity.key_fingerprint, &next_epoch)
        .unwrap());
    assert_eq!(
        store
            .read_relay_state(&own, &own.device_id)
            .unwrap()
            .presence,
        Presence::Syncing
    );
}

#[test]
fn device_directory_pages_are_frozen_complete_and_cursor_scoped() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let first = context(Uuid::new_v4().to_string());
    for _ in 0..205 {
        let row_context = SessionContext {
            principal_id: first.principal_id.clone(),
            network_id: first.network_id.clone(),
            ..context(Uuid::new_v4().to_string())
        };
        let identity = record(&row_context, 1, &fingerprint());
        store
            .register_device(&row_context, &identity, &info())
            .unwrap();
    }
    register(&store, &first);
    let page_one = store.list_devices(&first, None, 200).unwrap();
    validate_metadata(MetadataKind::Devices, &page_one).unwrap();
    assert_eq!(page_one["complete"], false);
    assert_eq!(page_one["items"].as_array().unwrap().len(), 200);
    let cursor = page_one["nextCursor"].as_str().unwrap().to_owned();
    let page_two = store.list_devices(&first, Some(&cursor), 200).unwrap();
    validate_metadata(MetadataKind::Devices, &page_two).unwrap();
    assert_eq!(page_two["complete"], true);
    assert_eq!(page_two["nextCursor"], Value::Null);
    assert_eq!(page_two["items"].as_array().unwrap().len(), 6);
    assert_eq!(
        store.list_devices(&first, Some(&cursor), 200).unwrap(),
        page_two,
        "cursor replay returns the same frozen page"
    );
    let foreign = SessionContext {
        principal_id: Uuid::new_v4().to_string(),
        device_id: Uuid::new_v4().to_string(),
        ..first.clone()
    };
    register(&store, &foreign);
    assert_eq!(
        store
            .list_devices(&foreign, Some(&cursor), 200)
            .unwrap_err(),
        MetadataError::InvalidCursor
    );
    store
        .connection
        .lock()
        .unwrap()
        .execute(
            "UPDATE directory_snapshots SET expires_at=?1",
            params![now_seconds().unwrap() - 1],
        )
        .unwrap();
    assert_eq!(
        store.list_devices(&first, Some(&cursor), 200).unwrap_err(),
        MetadataError::InvalidCursor
    );
}

#[test]
fn expired_session_waiting_for_owner_lock_cannot_read_directory() {
    let dir = private_dir();
    let store = Arc::new(MetadataStore::open(dir.path(), profile()).unwrap());
    let context = context(Uuid::new_v4().to_string());
    register(&store, &context);
    let mut expiring = context.clone();
    expiring.session_handle = Uuid::new_v4().to_string();
    expiring.expires_at = now_seconds().unwrap() + 1;
    let guard = store.connection.lock().unwrap();
    let worker = store.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    let thread = thread::spawn(move || {
        tx.send(()).unwrap();
        worker.list_devices(&expiring, None, 200)
    });
    rx.recv().unwrap();
    thread::sleep(Duration::from_millis(100));
    assert!(!thread.is_finished());
    thread::sleep(Duration::from_secs(2));
    drop(guard);
    assert_eq!(
        thread.join().unwrap().unwrap_err(),
        MetadataError::InvalidSession
    );
}

#[test]
fn registration_identity_is_immutable_and_database_private() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let context = context(Uuid::new_v4().to_string());
    let identity = register(&store, &context);
    let changed_binding = DeviceRecord {
        identity_binding_id: Uuid::new_v4().to_string(),
        ..identity.clone()
    };
    assert_eq!(
        store
            .register_device(&context, &changed_binding, &info())
            .unwrap_err(),
        MetadataError::IdentityConflict
    );
    let path = dir.path().join(DB_NAME);
    let metadata = fs::metadata(path).unwrap();
    assert_eq!(metadata.permissions().mode() & 0o777, 0o600);
    assert_eq!(metadata.nlink(), 1);
    assert_eq!(metadata.uid(), nix::unistd::Uid::effective().as_raw());
}

#[test]
fn database_nofollow_uses_canonical_secure_directory_and_rejects_terminal_symlink() {
    let dir = private_dir();
    let alias = dir.path().with_extension("alias");
    symlink(dir.path(), &alias).unwrap();
    assert!(matches!(
        MetadataStore::open(&alias, profile()),
        Err(MetadataError::UnsafePath)
    ));
    // TempDir on macOS is typically reached through /var -> /private/var.
    // Opening via its canonical path keeps the SQLite NOFOLLOW flag enabled.
    let canonical = dir.path().canonicalize().unwrap();
    MetadataStore::open(canonical, profile()).unwrap();
}

#[test]
fn device_name_and_membership_survive_store_restart() {
    let dir = private_dir();
    let profile = profile();
    let context = context(Uuid::new_v4().to_string());
    {
        let store = MetadataStore::open(dir.path(), profile.clone()).unwrap();
        register(&store, &context);
        store
            .rename_device(
                &context,
                &context.device_id,
                "Persistent name",
                "Linux Host",
                &Uuid::new_v4().to_string(),
            )
            .unwrap();
        store
            .mutate_membership(
                &context,
                &context.device_id,
                true,
                0,
                &Uuid::new_v4().to_string(),
            )
            .unwrap();
    }
    let reopened = MetadataStore::open(dir.path(), profile).unwrap();
    let page = reopened.list_devices(&context, None, 200).unwrap();
    assert_eq!(page["items"][0]["name"], "Persistent name");
    assert_eq!(page["items"][0]["joined"], true);
    assert_eq!(page["items"][0]["membershipRevision"], 1);
}

#[test]
fn human_owner_projection_does_not_require_browser_device_enrollment_or_grant_relay() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let host = context(Uuid::new_v4().to_string());
    let device = register(&store, &host);
    let mut browser = host.clone();
    browser.device_id = Uuid::new_v4().to_string();
    browser.session_handle = Uuid::new_v4().to_string();
    let owned = store.read_owned_target(&browser, &host.device_id).unwrap();
    assert_eq!(owned.identity_binding_id, device.identity_binding_id);
    assert_eq!(owned.key_generation, device.key_generation);
    assert!(store.read_relay_state(&browser, &host.device_id).is_err());
    let mut other = browser.clone();
    other.principal_id = Uuid::new_v4().to_string();
    assert_eq!(
        store
            .read_owned_target(&other, &host.device_id)
            .unwrap_err(),
        MetadataError::DeviceOwnerMismatch
    );
    browser.expires_at = now_seconds().unwrap() - 1;
    assert_eq!(
        store
            .read_owned_target(&browser, &host.device_id)
            .unwrap_err(),
        MetadataError::InvalidSession
    );
}

fn ready_mounts(
    store: &MetadataStore,
    own: &SessionContext,
    count: usize,
) -> (String, Vec<String>) {
    use myagents_agent_network_protocol::CatalogLifecycle::Active;
    register(store, own);
    store
        .mutate_membership(own, &own.device_id, true, 0, &Uuid::new_v4().to_string())
        .unwrap();
    let epoch = Uuid::new_v4().to_string();
    store
        .set_presence(own, 1, &epoch, Presence::Syncing, None)
        .unwrap();
    store
        .upload_catalog(
            own,
            1,
            &epoch,
            &snapshot(
                &epoch,
                1,
                (0..count).map(|n| catalog_item(n, Active)).collect(),
            ),
        )
        .unwrap();
    store
        .set_presence(own, 1, &epoch, Presence::Ready, Some(1))
        .unwrap();
    let mounts = store.list_agents(own, &own.device_id, None, 200).unwrap()["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["mountId"].as_str().unwrap().to_owned())
        .collect();
    (epoch, mounts)
}

fn enable_request(revision: u64, enabled: bool) -> Value {
    json!({"mutationId":Uuid::new_v4().to_string(),"expectedMembershipRevision":1,"expectedEnableRevision":revision,"enabled":enabled})
}

#[test]
fn mount_mutations_cas_receipts_and_principal_isolation() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    let (_, mounts) = ready_mounts(&store, &own, 1);
    let mount = &mounts[0];
    assert!(store.list_callable(&own, None, 200).unwrap()["items"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(
        store.with_callable_mount(&own, mount, |_| ()).unwrap_err(),
        MetadataError::MountUnavailable
    );
    let request = enable_request(0, true);
    let result = store.mutate_mount(&own, mount, &request).unwrap();
    validate_metadata(MetadataKind::Mount, &result).unwrap();
    assert_eq!(result["enableRevision"], 1);
    assert_eq!(store.mutate_mount(&own, mount, &request).unwrap(), result);
    assert_eq!(
        store
            .get_receipt(&own, request["mutationId"].as_str().unwrap())
            .unwrap(),
        result
    );
    let mut reused = request.clone();
    reused["enabled"] = json!(false);
    assert_eq!(
        store.mutate_mount(&own, mount, &reused).unwrap_err(),
        MetadataError::ReceiptConflict
    );
    assert_eq!(
        store
            .mutate_mount(&own, mount, &enable_request(0, false))
            .unwrap_err(),
        MetadataError::EnableConflict
    );
    let description = json!({"mutationId":Uuid::new_v4().to_string(),"expectedMembershipRevision":1,"expectedDescriptionRevision":0,"description":"Verified description"});
    let described = store.mutate_mount(&own, mount, &description).unwrap();
    assert_eq!(described["descriptionRevision"], 1);
    assert_eq!(
        store.mutate_mount(&own, mount, &description).unwrap(),
        described
    );
    let mut stale_description = description.clone();
    stale_description["mutationId"] = json!(Uuid::new_v4().to_string());
    assert_eq!(
        store
            .mutate_mount(&own, mount, &stale_description)
            .unwrap_err(),
        MetadataError::DescriptionConflict
    );
    let mut stale_member = enable_request(1, false);
    stale_member["expectedMembershipRevision"] = json!(0);
    assert_eq!(
        store.mutate_mount(&own, mount, &stale_member).unwrap_err(),
        MetadataError::MembershipConflict
    );
    let foreign = SessionContext {
        principal_id: Uuid::new_v4().to_string(),
        device_id: Uuid::new_v4().to_string(),
        ..own.clone()
    };
    register(&store, &foreign);
    assert_eq!(
        store.resolve_callable(&foreign, mount).unwrap_err(),
        MetadataError::MountNotFound
    );
    assert_eq!(
        store
            .mutate_mount(&foreign, mount, &enable_request(1, false))
            .unwrap_err(),
        MetadataError::MountNotFound
    );
    assert_eq!(
        store
            .get_receipt(&foreign, request["mutationId"].as_str().unwrap())
            .unwrap_err(),
        MetadataError::ReceiptNotFound
    );
    assert!(store.list_callable(&foreign, None, 200).unwrap()["items"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn callable_resolve_selector_pagination_revalidates_current_permission() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    let (epoch, mounts) = ready_mounts(&store, &own, 3);
    for mount in &mounts {
        store
            .mutate_mount(&own, mount, &enable_request(0, true))
            .unwrap();
    }
    let page = store.list_callable(&own, None, 1).unwrap();
    validate_metadata(MetadataKind::Callable, &page).unwrap();
    let resolved = store.resolve_callable(&own, &mounts[0]).unwrap();
    let reference = myagents_agent_network_protocol::AgentReference::parse(
        resolved["selector"].as_str().unwrap(),
    )
    .unwrap();
    assert_eq!(reference.mount_id, mounts[0]);
    assert_eq!(reference.service_id, store.profile.service_id);
    assert_eq!(reference.network_id, own.network_id);
    assert_eq!(resolved["connectionEpoch"], epoch);
    assert_eq!(resolved["signedBinding"], Value::Null);
    let current = store
        .with_callable_mount(&own, &mounts[0], |mount| {
            assert!(matches!(
                store.connection.try_lock(),
                Err(std::sync::TryLockError::WouldBlock)
            ));
            mount
        })
        .unwrap();
    assert_eq!(current.device_id, own.device_id);
    assert_eq!(current.enable_revision, 1);
    // A frozen directory cursor never returns a newly disabled permission.
    for mount in &mounts {
        store
            .mutate_mount(&own, mount, &enable_request(1, false))
            .unwrap();
    }
    let next = store
        .list_callable(&own, page["nextCursor"].as_str(), 200)
        .unwrap();
    assert!(next["items"].as_array().unwrap().is_empty());
    assert_eq!(next["complete"], true);
    assert_eq!(
        store.resolve_callable(&own, &mounts[0]).unwrap_err(),
        MetadataError::MountUnavailable
    );
    assert_eq!(
        store.resolve_callable(&own, "bad").unwrap_err(),
        MetadataError::InvalidInput
    );
    assert_eq!(
        store
            .list_agents(&own, &own.device_id, page["nextCursor"].as_str(), 1)
            .unwrap_err(),
        MetadataError::InvalidCursor
    );
}

#[test]
fn callable_requires_ready_intact_ack_and_leave_clears_enabled_policy() {
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    let (epoch, mounts) = ready_mounts(&store, &own, 1);
    let mount = &mounts[0];
    store
        .mutate_mount(&own, mount, &enable_request(0, true))
        .unwrap();
    store
        .set_presence(&own, 1, &epoch, Presence::Offline, None)
        .unwrap();
    assert_eq!(
        store
            .with_callable_mount(&own, mount, |_| panic!("offline cannot commit"))
            .unwrap_err(),
        MetadataError::MountUnavailable
    );
    store
        .set_presence(&own, 1, &epoch, Presence::Ready, Some(1))
        .unwrap();
    {
        let connection = store.connection.lock().unwrap();
        connection
            .execute("UPDATE catalogs SET payload_hash='corrupt'", [])
            .unwrap();
    }
    assert_eq!(
        store.resolve_callable(&own, mount).unwrap_err(),
        MetadataError::MountUnavailable
    );
    let description = json!({"mutationId":Uuid::new_v4().to_string(),"expectedMembershipRevision":1,"expectedDescriptionRevision":0,"description":"Retained"});
    store.mutate_mount(&own, mount, &description).unwrap();
    store
        .mutate_membership(&own, &own.device_id, false, 1, &Uuid::new_v4().to_string())
        .unwrap();
    store
        .mutate_membership(&own, &own.device_id, true, 2, &Uuid::new_v4().to_string())
        .unwrap();
    let policy = MetadataStore::self_policy_rows(&store.connection.lock().unwrap(), &own).unwrap();
    assert_eq!(policy[0]["enabled"], false);
    assert_eq!(policy[0]["enableRevision"], 2);
    assert_eq!(policy[0]["description"], "Retained");
}

#[test]
fn catalog_removal_and_exposure_changes_require_explicit_reenable() {
    use myagents_agent_network_protocol::CatalogLifecycle::Active;
    let dir = private_dir();
    let store = MetadataStore::open(dir.path(), profile()).unwrap();
    let own = context(Uuid::new_v4().to_string());
    let (epoch, mounts) = ready_mounts(&store, &own, 1);
    let mount = &mounts[0];
    store
        .mutate_mount(&own, mount, &enable_request(0, true))
        .unwrap();
    let mut item = catalog_item(0, Active);
    item.exposure_revision = 1;
    store
        .upload_catalog(&own, 1, &epoch, &snapshot(&epoch, 2, vec![item]))
        .unwrap();
    store
        .set_presence(&own, 1, &epoch, Presence::Ready, Some(2))
        .unwrap();
    let policy = store.list_agents(&own, &own.device_id, None, 200).unwrap();
    assert_eq!(policy["items"][0]["enabled"], false);
    assert_eq!(policy["items"][0]["enableRevision"], 2);
    assert_eq!(
        store.resolve_callable(&own, mount).unwrap_err(),
        MetadataError::MountUnavailable
    );
    store
        .mutate_mount(&own, mount, &enable_request(2, true))
        .unwrap();
    store
        .upload_catalog(&own, 1, &epoch, &snapshot(&epoch, 3, vec![]))
        .unwrap();
    store
        .set_presence(&own, 1, &epoch, Presence::Ready, Some(3))
        .unwrap();
    assert_eq!(
        store
            .mutate_mount(&own, mount, &enable_request(4, true))
            .unwrap_err(),
        MetadataError::MountUnavailable
    );
    let mut restored = catalog_item(0, Active);
    restored.exposure_revision = 1;
    store
        .upload_catalog(&own, 1, &epoch, &snapshot(&epoch, 4, vec![restored]))
        .unwrap();
    store
        .set_presence(&own, 1, &epoch, Presence::Ready, Some(4))
        .unwrap();
    let policy = store.list_agents(&own, &own.device_id, None, 200).unwrap();
    assert_eq!(policy["items"][0]["mountId"], *mount);
    assert_eq!(policy["items"][0]["enabled"], false);
    assert_eq!(policy["items"][0]["enableRevision"], 4);
}
