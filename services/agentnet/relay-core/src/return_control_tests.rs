fn mount_evidence(hello: &Value, mount: &str) -> TrustedMountEvidence {
    TrustedMountEvidence {
        mount_id: mount.into(),
        device_id: hello["identity"]["deviceId"].as_str().unwrap().into(),
        key_generation: 1,
        connection_epoch: hello["connectionEpoch"].as_str().unwrap().into(),
        membership_revision: 7,
        enable_revision: 2,
    }
}

fn route_fixture(
    recovery: bool,
) -> (
    Fixture,
    String,
    String,
    Value,
    Value,
    String,
    String,
    String,
) {
    let mut f = Fixture::new();
    let (a, b, ah, bh, channel) = f.ready_pair(2_000);
    let caps = if recovery {
        json!({"capabilities":["permit-v1","return-v1","return-resume-v1"]})
    } else {
        json!({"capabilities":["permit-v1","return-v1"]})
    };
    f.core.negotiate_returns(&a, &caps).unwrap();
    f.core.negotiate_returns(&b, &caps).unwrap();
    let mount = Uuid::new_v4().to_string();
    let op = Uuid::new_v4().to_string();
    let prepare = client_control(
        &ah,
        "op.prepare",
        json!({"channelId":channel,"opId":op,"targetMountId":mount}),
    );
    let prepared = f
        .core
        .handle_control_with_mount(
            &a,
            &serde_json::to_vec(&prepare).unwrap(),
            None,
            Some(mount_evidence(&bh, &mount)),
            f.now,
            2_001,
        )
        .unwrap();
    assert_eq!(prepared[0].control_json().unwrap()["type"], "op.prepared");
    assert_eq!(
        prepared[0].control_json().unwrap()["controlId"],
        prepare["controlId"]
    );
    let permit = client_control(
        &bh,
        "permit.acquire",
        json!({"opId":op,"attemptId":Uuid::new_v4().to_string(),
        "targetMountId":mount,"expectedMembershipRevision":7,"expectedEnableRevision":2}),
    );
    let effects = f
        .core
        .handle_control_with_mount(
            &b,
            &serde_json::to_vec(&permit).unwrap(),
            None,
            Some(mount_evidence(&bh, &mount)),
            f.now,
            2_002,
        )
        .unwrap();
    assert_eq!(effects[0].control_json().unwrap()["type"], "route.opened");
    assert_eq!(effects[1].control_json().unwrap()["type"], "permit.result");
    assert_eq!(
        effects[1].control_json().unwrap()["controlId"],
        permit["controlId"]
    );
    assert_eq!(
        effects[1].control_json().unwrap()["recoverable"]
            .as_bool()
            .unwrap_or(false),
        recovery
    );
    let route = effects[1].control_json().unwrap()["returnRouteId"]
        .as_str()
        .unwrap()
        .to_owned();
    (f, a, b, ah, bh, route, mount, op)
}

fn reconnect_endpoint(f: &mut Fixture, id: &str, now_ms: i64) -> (String, Value) {
    let device = f.core.connections[id].device.clone();
    f.core.disconnect_at(id, now_ms);
    let (new_id, effects) = f.core.connect(device, f.now).unwrap();
    let hello = effects
        .iter()
        .find_map(|e| e.control_json().filter(|v| v["type"] == "hello.result"))
        .unwrap()
        .clone();
    f.core
        .negotiate_returns(
            &new_id,
            &json!({"capabilities":["permit-v1","return-v1","return-resume-v1"]}),
        )
        .unwrap();
    let proof = f
        .core
        .ready_proof(
            &new_id,
            TrustedReadyEvidence {
                scope: f.core.connections[&new_id].device.scope.clone(),
                connection_epoch: hello["connectionEpoch"].as_str().unwrap().into(),
                catalog_sequence: 1,
                acknowledged_sequence: 1,
                membership_revision: 7,
                policy_allows_relay: true,
            },
            f.now,
        )
        .unwrap();
    f.core
        .handle_control(
            &new_id,
            &serde_json::to_vec(&client_control(&hello, "ready", json!({"catalogSeq":1}))).unwrap(),
            Some(proof),
            f.now,
            now_ms + 1,
        )
        .unwrap();
    (new_id, hello)
}

#[test]
fn recoverable_route_rechecks_original_identity_and_rebinds_only_ready_exact_pair() {
    let (mut f, a, b, _ah, bh, route, mount, _op) = route_fixture(true);
    let (new_a, new_ah) = reconnect_endpoint(&mut f, &a, 3_000);
    let resume = client_control(&new_ah, "route.resume", json!({"returnRouteId":route}));
    let effects = f
        .core
        .handle_control_with_mount(
            &new_a,
            &serde_json::to_vec(&resume).unwrap(),
            None,
            Some(mount_evidence(&bh, &mount)),
            f.now,
            3_010,
        )
        .unwrap();
    assert_eq!(effects.len(), 2);
    for e in effects {
        let v = e.control_json().unwrap();
        assert_eq!(v["type"], "route.resumed");
        assert_eq!(v["sourceConnectionEpoch"], new_ah["connectionEpoch"]);
        assert_eq!(v["targetConnectionEpoch"], bh["connectionEpoch"]);
    }
    let rebind = client_control(
        &bh,
        "route.rebind",
        json!({"returnRouteId":route,"channelId":Uuid::new_v4().to_string()}),
    );
    assert_eq!(
        f.core.handle_control_with_mount(
            &b,
            &serde_json::to_vec(&rebind).unwrap(),
            None,
            Some(mount_evidence(&bh, &mount)),
            f.now,
            3_011
        ),
        Err(RelayError::Channel)
    );
    assert_eq!(
        f.core.returns[&route].deadline_ms,
        Some(3_000 + budget("returnRecoveryMs") as i64)
    );
}

#[test]
fn repeated_disconnects_do_not_extend_suspension_or_replay_closed_operation() {
    let (mut f, a, b, ah, bh, route, mount, op) = route_fixture(true);
    let effects = f.core.disconnect_at(&a, 3_000);
    assert!(effects.iter().any(|e| e
        .control_json()
        .is_some_and(|v| v["type"] == "route.suspended")));
    let deadline = f.core.returns[&route].deadline_ms.unwrap();
    f.core.disconnect_at(&b, 4_000);
    assert_eq!(f.core.returns[&route].deadline_ms, Some(deadline));
    f.core.expire(f.now, deadline);
    assert!(!f.core.returns.contains_key(&route));
    assert!(f.core.completed_ops.contains_key(&op));
    // No original body/request or retry queue exists in relay state.
    assert!(f.core.operations.is_empty());
    let _ = (ah, bh, mount);
}

#[test]
fn legacy_disconnect_revocation_and_policy_revision_close_returns() {
    let (mut f, a, _b, _ah, _bh, route, _mount, _op) = route_fixture(false);
    f.core.disconnect_at(&a, 3_000);
    assert!(!f.core.returns.contains_key(&route));
    let (mut f, a, _b, _ah, _bh, route, _mount, _op) = route_fixture(true);
    let device = f.core.connections[&a].device.scope.device_id.clone();
    f.core.disconnect_at(&a, 3_000);
    let effects = f.core.invalidate_device(&device);
    assert!(!f.core.returns.contains_key(&route));
    assert!(effects.iter().any(|e| e
        .control_json()
        .is_some_and(|v| v["type"] == "route.closed")));
    let (mut f, a, _b, _ah, bh, route, mount, _op) = route_fixture(true);
    let hello = f.core.connections[&a].connection_epoch.clone();
    let ah = json!({"serviceId":f.core.config.service_id,"networkId":f.core.config.network_id,"bootEpoch":f.core.boot_epoch,"connectionEpoch":hello});
    let resume = client_control(&ah, "route.resume", json!({"returnRouteId":route}));
    let mut evidence = mount_evidence(&bh, &mount);
    evidence.enable_revision += 1;
    let effects = f
        .core
        .handle_control_with_mount(
            &a,
            &serde_json::to_vec(&resume).unwrap(),
            None,
            Some(evidence),
            f.now,
            3_000,
        )
        .unwrap();
    assert_eq!(effects.len(), 2);
    assert!(!f.core.returns.contains_key(&route));
}

#[test]
fn reconnect_with_changed_session_key_certificate_or_binding_never_recovers() {
    for changed in ["session", "key", "certificate", "binding"] {
        let (mut f, a, b, _ah, bh, route, mount, _op) = route_fixture(true);
        let (new_a, _new_ah) = reconnect_endpoint(&mut f, &a, 3_000);
        let c = &mut f.core.connections.get_mut(&new_a).unwrap().device;
        match changed {
            "session" => c.session_handle.push('x'),
            "key" => c.key_fingerprint.push('x'),
            "certificate" => c.certificate_fingerprint.push('x'),
            _ => c.binding_id.push('x'),
        };
        let resume = client_control(&bh, "route.resume", json!({"returnRouteId":route}));
        assert_eq!(
            f.core.handle_control_with_mount(
                &b,
                &serde_json::to_vec(&resume).unwrap(),
                None,
                Some(mount_evidence(&bh, &mount)),
                f.now,
                3_010
            ),
            Err(RelayError::Unauthorized),
            "{changed}"
        );
    }
}

#[test]
fn permit_duplicate_reuses_exact_attempt_and_closed_op_cannot_be_prepared_again() {
    let (mut f, a, b, ah, bh, route, mount, op) = route_fixture(true);
    let attempt = f.core.returns[&route].attempt_id.clone();
    let permit = client_control(
        &bh,
        "permit.acquire",
        json!({"opId":op,"attemptId":attempt,"targetMountId":mount,
        "expectedMembershipRevision":7,"expectedEnableRevision":2}),
    );
    let same = f
        .core
        .handle_control_with_mount(
            &b,
            &serde_json::to_vec(&permit).unwrap(),
            None,
            Some(mount_evidence(&bh, &mount)),
            f.now,
            2_100,
        )
        .unwrap();
    assert_eq!(same.len(), 1);
    assert_eq!(same[0].control_json().unwrap()["returnRouteId"], route);
    let close = client_control(
        &ah,
        "route.close",
        json!({"returnRouteId":route,"reason":"RETURN_COMPLETED"}),
    );
    f.core
        .handle_control(&a, &serde_json::to_vec(&close).unwrap(), None, f.now, 2_101)
        .unwrap();
    let channel = f.core.channels.keys().next().unwrap().clone();
    let prepare = client_control(
        &ah,
        "op.prepare",
        json!({"channelId":channel,"opId":op,"targetMountId":mount}),
    );
    assert_eq!(
        f.core.handle_control_with_mount(
            &a,
            &serde_json::to_vec(&prepare).unwrap(),
            None,
            Some(mount_evidence(&bh, &mount)),
            f.now,
            2_102
        ),
        Err(RelayError::Replay)
    );
}
