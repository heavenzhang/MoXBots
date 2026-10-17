// Independent regression coverage for the recovery review. Included in the
// existing tests module so these exercise the production control transitions.

fn review_ready_channel(
    f: &mut Fixture,
    source: &str,
    target: &str,
    source_hello: &Value,
    target_hello: &Value,
    now_ms: i64,
) -> String {
    let channel = Uuid::new_v4().to_string();
    let open = client_control(
        source_hello,
        "channel.open",
        json!({
            "channelId":channel,
            "targetDeviceId":target_hello["identity"]["deviceId"],
            "targetKeyGeneration":target_hello["identity"]["keyGeneration"],
            "targetConnectionEpoch":target_hello["connectionEpoch"],
            "targetBinding":null,
        }),
    );
    f.core
        .handle_control(
            source,
            &serde_json::to_vec(&open).unwrap(),
            None,
            f.now,
            now_ms,
        )
        .unwrap();
    for (offset, endpoint, hello) in [(1, source, source_hello), (2, target, target_hello)] {
        let binding = f.core.connections[endpoint].device.signed_binding.clone();
        let accept = client_control(
            hello,
            "channel.accept",
            json!({"channelId":channel,"signedBinding":binding}),
        );
        f.core
            .handle_control(
                endpoint,
                &serde_json::to_vec(&accept).unwrap(),
                None,
                f.now,
                now_ms + offset,
            )
            .unwrap();
    }
    for (endpoint, hello) in [(source, source_hello), (target, target_hello)] {
        let ready = client_control(hello, "channel.ready", json!({"channelId":channel}));
        f.core
            .handle_control(
                endpoint,
                &serde_json::to_vec(&ready).unwrap(),
                None,
                f.now,
                now_ms + 3,
            )
            .unwrap();
    }
    channel
}

fn review_repeat_permit(
    f: &mut Fixture,
    target: &str,
    hello: &Value,
    route: &str,
    mount: &str,
    op: &str,
    now_ms: i64,
) -> Result<Vec<Effect>, RelayError> {
    let permit = client_control(
        hello,
        "permit.acquire",
        json!({
            "opId":op,"attemptId":f.core.returns[route].attempt_id,
            "targetMountId":mount,"expectedMembershipRevision":7,"expectedEnableRevision":2,
        }),
    );
    f.core.handle_control_with_mount(
        target,
        &serde_json::to_vec(&permit).unwrap(),
        None,
        Some(mount_evidence(hello, mount)),
        f.now,
        now_ms,
    )
}

#[test]
fn review_duplicate_permit_revalidates_original_source_identity() {
    for change in ["session", "key", "certificate", "binding", "generation"] {
        let (mut f, source, target, _sh, th, route, mount, op) = route_fixture(true);
        let (replacement, _) = reconnect_endpoint(&mut f, &source, 3_000);
        let device = &mut f.core.connections.get_mut(&replacement).unwrap().device;
        match change {
            "session" => device.session_handle.push('x'),
            "key" => device.key_fingerprint.push('x'),
            "certificate" => device.certificate_fingerprint.push('x'),
            "binding" => device.binding_id.push('x'),
            _ => device.scope.key_generation += 1,
        }
        assert!(
            review_repeat_permit(&mut f, &target, &th, &route, &mount, &op, 3_100).is_err(),
            "changed {change}"
        );
    }
}

#[test]
fn review_duplicate_permit_cannot_cross_source_socket_replacement() {
    let (mut f, source, target, _sh, th, route, mount, op) = route_fixture(true);
    reconnect_endpoint(&mut f, &source, 3_000);
    assert!(review_repeat_permit(&mut f, &target, &th, &route, &mount, &op, 3_100).is_err());
}

#[test]
fn review_resume_without_rebind_preserves_original_outage_expiry() {
    let (mut f, source, target, _sh, th, route, mount, _op) = route_fixture(true);
    let (replacement, hello) = reconnect_endpoint(&mut f, &source, 3_000);
    let deadline = f.core.returns[&route].deadline_ms.unwrap();
    let resume = client_control(&hello, "route.resume", json!({"returnRouteId":route}));
    f.core
        .handle_control_with_mount(
            &replacement,
            &serde_json::to_vec(&resume).unwrap(),
            None,
            Some(mount_evidence(&th, &mount)),
            f.now,
            3_100,
        )
        .unwrap();
    assert_eq!(f.core.returns[&route].deadline_ms, Some(deadline));
    f.core.disconnect_at(&target, deadline - 1);
    assert_eq!(f.core.returns[&route].deadline_ms, Some(deadline));
    f.core.expire(f.now, deadline);
    assert!(!f.core.returns.contains_key(&route));
}

#[test]
fn review_successful_rebind_restarts_only_the_next_outage_window() {
    let (mut f, source, target, _sh, th, route, mount, op) = route_fixture(true);
    let (replacement, hello) = reconnect_endpoint(&mut f, &source, 3_000);
    let original_deadline = f.core.returns[&route].deadline_ms.unwrap();
    let resume = client_control(&hello, "route.resume", json!({"returnRouteId":route}));
    f.core
        .handle_control_with_mount(
            &replacement,
            &serde_json::to_vec(&resume).unwrap(),
            None,
            Some(mount_evidence(&th, &mount)),
            f.now,
            3_100,
        )
        .unwrap();
    let channel = review_ready_channel(&mut f, &replacement, &target, &hello, &th, 3_110);
    let rebind = client_control(
        &th,
        "route.rebind",
        json!({"returnRouteId":route,"channelId":channel}),
    );
    let effects = f
        .core
        .handle_control_with_mount(
            &target,
            &serde_json::to_vec(&rebind).unwrap(),
            None,
            Some(mount_evidence(&th, &mount)),
            f.now,
            3_120,
        )
        .unwrap();
    assert!(f.core.returns[&route].deadline_ms.is_none());
    assert!(effects
        .iter()
        .any(|effect| effect.target_id() == Some(replacement.as_str())
            && effect
                .control_json()
                .is_some_and(|v| v["type"] == "route.rebound")));
    assert!(effects
        .iter()
        .any(|effect| effect.target_id() == Some(target.as_str())
            && effect
                .control_json()
                .is_some_and(|v| v["type"] == "route.rebound")));
    // Return epoch migration must never migrate the original execution permit.
    assert!(review_repeat_permit(&mut f, &target, &th, &route, &mount, &op, 3_130).is_err());
    let next_outage = original_deadline + 5_000;
    f.core.disconnect_at(&replacement, next_outage);
    assert_eq!(
        f.core.returns[&route].deadline_ms,
        Some(next_outage + budget("returnRecoveryMs") as i64)
    );
}

#[test]
fn review_close_preserves_owner_reason_for_both_endpoints() {
    for reason in [
        "PERMIT_EXPIRED",
        "RETURN_CAPACITY",
        "WATCH_CANCELLED",
        "READ_COMPLETED",
        "RETURN_COMPLETED",
    ] {
        let (mut f, source, _target, sh, _th, route, _mount, _op) = route_fixture(true);
        let close = client_control(
            &sh,
            "route.close",
            json!({"returnRouteId":route,"reason":reason}),
        );
        let effects = f
            .core
            .handle_control(
                &source,
                &serde_json::to_vec(&close).unwrap(),
                None,
                f.now,
                3_000,
            )
            .unwrap();
        assert_eq!(effects.len(), 2);
        assert!(
            effects.iter().all(|effect| effect
                .control_json()
                .is_some_and(|v| v["type"] == "route.closed" && v["reason"] == reason)),
            "reason {reason}"
        );
        assert!(!f.core.returns.contains_key(&route));
    }
}
