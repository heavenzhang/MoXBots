// Actual AuthStore/DPoP, HTTP/catalog owner and WebSocket transport. Separate
// desktop tests cover Inbox settlement; these tests never substitute a mock
// relay handler or infer execution authority from a successful TLS handshake.
type RecoverySocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

#[tokio::test]
async fn actual_same_pair_open_race_and_absent_cleanup_do_not_disconnect_existing_channel() {
    let server = RealRelayServer::start().await;
    let a = server.joined_device().await;
    let b = server.joined_device().await;
    let (mut source, sh) = server.ready_device(&a).await;
    let (mut target, th) = server.ready_device(&b).await;
    let channel = establish_real_channel(&mut source, &sh, &mut target, &th).await;
    let rejected_channel = Uuid::new_v4().to_string();
    let open = scoped_control(
        &sh,
        "channel.open",
        json!({"channelId":rejected_channel,
        "targetDeviceId":b.context.device_id,"targetKeyGeneration":1,
        "targetConnectionEpoch":th["connectionEpoch"],"targetBinding":null}),
    );
    source
        .send(ClientMessage::Text(open.to_string().into()))
        .await
        .unwrap();
    let error = receive_control(&mut source, "error").await;
    assert_eq!(error["controlId"], open["controlId"]);
    assert_eq!(error["code"], "CHANNEL_PAIR_EXISTS");
    source
        .send(ClientMessage::Text(
            scoped_control(
                &sh,
                "channel.close",
                json!({"channelId":rejected_channel,
        "reason":"operation-finished"}),
            )
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    let bytes = encode_tls_frame(&channel, &[0x16, 0x03, 0x04, 0x31, 0x32]).unwrap();
    source
        .send(ClientMessage::Binary(bytes.clone().into()))
        .await
        .unwrap();
    let forwarded = tokio::time::timeout(Duration::from_secs(4), async {
        loop {
            if let ClientMessage::Binary(frame) = target.next().await.unwrap().unwrap() {
                return frame;
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(forwarded.as_ref(), bytes.as_slice());
    assert!(server.observed.disconnects.lock().unwrap().is_empty());
}

async fn recovery_device(
    server: &RealRelayServer,
    device: &Device,
    agent: bool,
) -> (RecoverySocket, Value, Option<String>) {
    let mut socket = server.ws(device).await;
    socket.send(ClientMessage::Text(json!({"version":1,"controlId":Uuid::new_v4().to_string(),"type":"hello",
        "clientVersion":"recovery-integration","capabilities":["tls13-mtls","typed-rpc","permit-v1","return-v1","return-resume-v1"]}).to_string().into())).await.unwrap();
    let hello = receive_control(&mut socket, "hello.result").await;
    let items = if agent {
        json!([{"localAgentId":"recovery-agent","localWorkspaceId":"recovery-workspace",
        "name":"Recovery acceptance","path":"/synthetic/recovery","lifecycle":"active","exposureRevision":1}])
    } else {
        json!([])
    };
    let path = "/v1/devices/self/catalog";
    let nonce = server.nonce(device, "PUT", path);
    let proof = server.fixture.proof(device, "PUT", path, Some(&nonce));
    let response = reqwest::Client::new()
        .put(format!("{}{}", server.http_url, path))
        .bearer_auth(device.access.as_str())
        .header("dpop", proof)
        .json(&json!({"version":1,
            "connectionEpoch":hello["connectionEpoch"],"catalogSeq":1,"items":items}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    socket
        .send(ClientMessage::Text(
            scoped_control(&hello, "ready", json!({"catalogSeq":1}))
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    receive_control(&mut socket, "ready.result").await;
    let mount = if agent {
        let page = server
            .fixture
            .service
            .metadata
            .list_agents(&device.context, &device.context.device_id, None, 10)
            .unwrap();
        Some(page["items"][0]["mountId"].as_str().unwrap().into())
    } else {
        None
    };
    (socket, hello, mount)
}

async fn recovery_permit(
    source: &mut RecoverySocket,
    sh: &Value,
    target: &mut RecoverySocket,
    th: &Value,
    mount: &str,
) -> (String, String, Value) {
    let channel = establish_real_channel(source, sh, target, th).await;
    let op = Uuid::new_v4().to_string();
    source
        .send(ClientMessage::Text(
            scoped_control(
                sh,
                "op.prepare",
                json!({"channelId":channel,"opId":op,
        "targetMountId":mount}),
            )
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    let prepared = receive_control(source, "op.prepared").await;
    assert_eq!(prepared["target"], th["identity"]);
    // Caller-side request bytes cross the encrypted channel in the native
    // endpoint campaign. Permit submission is the target owner boundary here.
    target
        .send(ClientMessage::Text(
            scoped_control(
                th,
                "permit.acquire",
                json!({"opId":op,
        "attemptId":Uuid::new_v4().to_string(),"targetMountId":mount,"expectedMembershipRevision":1,
        "expectedEnableRevision":1}),
            )
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    let opened = receive_control(source, "route.opened").await;
    let permit = receive_control(target, "permit.result").await;
    assert_eq!(opened["returnRouteId"], permit["returnRouteId"]);
    assert_eq!(permit["recoverable"], true);
    (channel, op, permit)
}

#[tokio::test]
async fn actual_owned_sockets_recover_exact_route_after_either_peer_disconnects_without_reissuing_permit()
 {
    for disconnect_source in [true, false] {
        let server = RealRelayServer::start().await;
        let a = server.joined_device().await;
        let b = server.joined_device().await;
        let (mut source, mut sh, _) = recovery_device(&server, &a, false).await;
        let (mut target, mut th, mount) = recovery_device(&server, &b, true).await;
        let mount = mount.unwrap();
        let enabled = server
            .fixture
            .service
            .metadata
            .mutate_mount(
                &a.context,
                &mount,
                &json!({"mutationId":Uuid::new_v4().to_string(),
            "expectedMembershipRevision":1,"expectedEnableRevision":0,"enabled":true}),
            )
            .unwrap();
        assert_eq!(enabled["enableRevision"], 1);
        let (_channel, op, permit) =
            recovery_permit(&mut source, &sh, &mut target, &th, &mount).await;
        let route = permit["returnRouteId"].as_str().unwrap().to_owned();
        if disconnect_source {
            source.close(None).await.unwrap();
            receive_control(&mut target, "route.suspended").await;
            (source, sh, _) = recovery_device(&server, &a, false).await;
        } else {
            target.close(None).await.unwrap();
            receive_control(&mut source, "route.suspended").await;
            (target, th, _) = recovery_device(&server, &b, true).await;
        }
        source
            .send(ClientMessage::Text(
                scoped_control(&sh, "route.resume", json!({"returnRouteId":route}))
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        let resumed = receive_control(&mut source, "route.resumed").await;
        receive_control(&mut target, "route.resumed").await;
        assert_eq!(resumed["sourceConnectionEpoch"], sh["connectionEpoch"]);
        assert_eq!(resumed["targetConnectionEpoch"], th["connectionEpoch"]);
        let new_channel = establish_real_channel(&mut source, &sh, &mut target, &th).await;
        target
            .send(ClientMessage::Text(
                scoped_control(
                    &th,
                    "route.rebind",
                    json!({"returnRouteId":route,
            "channelId":new_channel}),
                )
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
        let rebound = receive_control(&mut target, "route.rebound").await;
        assert_eq!(rebound["channelId"], new_channel);
        target
            .send(ClientMessage::Text(
                scoped_control(
                    &th,
                    "route.close",
                    json!({"returnRouteId":route,
            "reason":"RETURN_COMPLETED"}),
                )
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
        assert_eq!(
            receive_control(&mut source, "route.closed").await["reason"],
            "RETURN_COMPLETED"
        );
        receive_control(&mut target, "route.closed").await;
        // Fresh transport identity does not mint a second execution permit.
        target.send(ClientMessage::Text(scoped_control(&th,"permit.acquire",json!({"opId":op,
            "attemptId":Uuid::new_v4().to_string(),"targetMountId":mount,"expectedMembershipRevision":1,
            "expectedEnableRevision":1})).to_string().into())).await.unwrap();
        assert_eq!(
            receive_control(&mut target, "error").await["retryable"],
            false
        );
    }
}

#[tokio::test]
async fn actual_owned_sockets_revoke_mount_before_resume_and_keep_transport_alive() {
    let server = RealRelayServer::start().await;
    let a = server.joined_device().await;
    let b = server.joined_device().await;
    let (mut source, sh, _) = recovery_device(&server, &a, false).await;
    let (mut target, th, mount) = recovery_device(&server, &b, true).await;
    let mount = mount.unwrap();
    server
        .fixture
        .service
        .metadata
        .mutate_mount(
            &a.context,
            &mount,
            &json!({"mutationId":Uuid::new_v4().to_string(),
        "expectedMembershipRevision":1,"expectedEnableRevision":0,"enabled":true}),
        )
        .unwrap();
    let (_, _, permit) = recovery_permit(&mut source, &sh, &mut target, &th, &mount).await;
    let route = permit["returnRouteId"].as_str().unwrap().to_owned();
    source.close(None).await.unwrap();
    receive_control(&mut target, "route.suspended").await;
    server
        .fixture
        .service
        .metadata
        .mutate_mount(
            &b.context,
            &mount,
            &json!({"mutationId":Uuid::new_v4().to_string(),
        "expectedMembershipRevision":1,"expectedEnableRevision":1,"enabled":false}),
        )
        .unwrap();
    let (mut source, sh, _) = recovery_device(&server, &a, false).await;
    source
        .send(ClientMessage::Text(
            scoped_control(&sh, "route.resume", json!({"returnRouteId":route}))
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    assert_eq!(
        receive_control(&mut source, "error").await["retryable"],
        false
    );
}

fn recovery_peer(
    server: &RealRelayServer,
    device: &Device,
) -> myagents_agentnet_peer_core::PeerSnapshot {
    let access = crate::relay_http::tests::controller_access(
        &server.controller,
        &server.fixture,
        device,
        "GET",
        "/v1/ws",
    );
    server
        .fixture
        .service
        .peers
        .lookup(
            &device.context,
            access.access_jti(),
            access.key_generation(),
            access.public_key_fingerprint(),
        )
        .unwrap()
        .unwrap()
}

async fn flush_recovery_tls(
    socket: &mut RecoverySocket,
    tls: &mut myagents_agent_network_crypto::InnerTls,
    channel: &str,
) {
    while let Some(bytes) = tls.drain_chunk().unwrap() {
        socket
            .send(ClientMessage::Binary(
                encode_tls_frame(channel, &bytes).unwrap().into(),
            ))
            .await
            .unwrap();
    }
}

async fn recovery_tls_pair(
    server: &RealRelayServer,
    a: &Device,
    b: &Device,
    source: &mut RecoverySocket,
    target: &mut RecoverySocket,
    hellos: (&Value, &Value),
    channel: &str,
) -> (
    myagents_agent_network_crypto::InnerTls,
    myagents_agent_network_crypto::InnerTls,
) {
    use myagents_agent_network_crypto::{InnerTls, TlsIdentity, certificate_chain, private_roots};
    let (sh, th) = hellos;
    let ap = recovery_peer(server, a);
    let bp = recovery_peer(server, b);
    let identity = |p: &myagents_agentnet_peer_core::PeerSnapshot, key: Arc<DevicePrivateKey>| {
        let mut chain = certificate_chain(&p.certificate).unwrap();
        for pem in &p.certificate_chain {
            chain.extend(certificate_chain(pem).unwrap());
        }
        TlsIdentity::new(chain, key).unwrap()
    };
    let ai = identity(&ap, a.key.clone());
    let bi = identity(&bp, b.key.clone());
    let san = |p: &myagents_agentnet_peer_core::PeerSnapshot| {
        format!("{}.devices.{}.invalid", p.identity_binding_id, p.service_id)
    };
    let roots = || private_roots(ap.certificate_chain.last().unwrap()).unwrap();
    let (mut at, mut bt) = if a.context.device_id < b.context.device_id {
        (
            InnerTls::client(&ai, roots(), san(&bp), bp.certificate_fingerprint.clone()).unwrap(),
            InnerTls::server(&bi, roots(), san(&ap), ap.certificate_fingerprint.clone()).unwrap(),
        )
    } else {
        (
            InnerTls::server(&ai, roots(), san(&bp), bp.certificate_fingerprint.clone()).unwrap(),
            InnerTls::client(&bi, roots(), san(&ap), ap.certificate_fingerprint.clone()).unwrap(),
        )
    };
    tokio::time::timeout(Duration::from_secs(5),async {
        while !at.verified() || !bt.verified() {
            flush_recovery_tls(source,&mut at,channel).await;flush_recovery_tls(target,&mut bt,channel).await;
            let (side,message)=tokio::select! { message=source.next()=>(true,message),message=target.next()=>(false,message) };
            if let ClientMessage::Binary(frame)=message.unwrap().unwrap() {
                let (id,bytes)=decode_tls_frame(&frame).unwrap();assert_eq!(id,channel);
                assert!(if side {at.feed(bytes).unwrap()}else{bt.feed(bytes).unwrap()}.is_empty());
            }
        }
    }).await.unwrap();
    flush_recovery_tls(source, &mut at, channel).await;
    flush_recovery_tls(target, &mut bt, channel).await;
    for (tls, from, to) in [(&mut at, sh, th), (&mut bt, th, sh)] {
        let hello = myagents_agent_network_protocol::BusinessObject::Hello(
            myagents_agent_network_protocol::ChannelHello {
                version: 1,
                sender_sequence: 1,
                channel_id: channel.into(),
                source: serde_json::from_value(from["identity"].clone()).unwrap(),
                target: serde_json::from_value(to["identity"].clone()).unwrap(),
                source_connection_epoch: from["connectionEpoch"].as_str().unwrap().into(),
                target_connection_epoch: to["connectionEpoch"].as_str().unwrap().into(),
            },
        );
        tls.write_plaintext(
            &myagents_agent_network_protocol::encode_object(&serde_json::to_value(hello).unwrap())
                .unwrap(),
        )
        .unwrap();
    }
    flush_recovery_tls(source, &mut at, channel).await;
    flush_recovery_tls(target, &mut bt, channel).await;
    for (socket, tls) in [(&mut *source, &mut at), (&mut *target, &mut bt)] {
        let hello = receive_recovery_object(socket, tls, channel).await;
        assert_eq!(hello["kind"], "channel.hello");
    }
    (at, bt)
}

async fn receive_recovery_object(
    socket: &mut RecoverySocket,
    tls: &mut myagents_agent_network_crypto::InnerTls,
    channel: &str,
) -> Value {
    let mut decoder = myagents_agent_network_protocol::ObjectDecoder::default();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match socket.next().await.unwrap().unwrap() {
                ClientMessage::Binary(frame) => {
                    let (id, bytes) = decode_tls_frame(&frame).unwrap();
                    assert_eq!(id, channel);
                    let plain = tls.feed(bytes).unwrap();
                    if let Some(value) = decoder.push(&plain).unwrap().into_iter().next() {
                        return value;
                    }
                }
                ClientMessage::Ping(bytes) => {
                    socket.send(ClientMessage::Pong(bytes)).await.unwrap();
                }
                _ => {}
            }
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn actual_owned_socket_recovery_delivers_original_terminal_and_ack_through_fresh_pinned_mtls()
{
    use myagents_agent_network_protocol::{
        BusinessObject, ReturnAck, ReturnEvent, ReturnSettlement,
    };
    let server = RealRelayServer::start().await;
    let a = server.joined_device().await;
    let b = server.joined_device().await;
    let (mut source, sh, _) = recovery_device(&server, &a, false).await;
    let (mut target, th, mount) = recovery_device(&server, &b, true).await;
    let mount = mount.unwrap();
    server
        .fixture
        .service
        .metadata
        .mutate_mount(
            &a.context,
            &mount,
            &json!({"mutationId":Uuid::new_v4().to_string(),
        "expectedMembershipRevision":1,"expectedEnableRevision":0,"enabled":true}),
        )
        .unwrap();
    let (_, op, permit) = recovery_permit(&mut source, &sh, &mut target, &th, &mount).await;
    let route = permit["returnRouteId"].as_str().unwrap().to_owned();
    let event_id = Uuid::new_v4().to_string();
    let request_id = Uuid::new_v4().to_string();
    // A completed terminal belongs to the original operation. Retain the same
    // event, correlation and 128KiB body throughout the physical socket outage.
    let body = "原任务完成结果".repeat(8_192);
    let event = ReturnEvent {
        version: 1,
        op_id: op.clone(),
        return_route_id: route.clone(),
        sender_sequence: 2,
        source: serde_json::from_value(sh["identity"].clone()).unwrap(),
        target: serde_json::from_value(th["identity"].clone()).unwrap(),
        target_local_session_id: "target-session".into(),
        event: json!({"version":1,"type":"send.result","eventId":event_id,
            "requestEventId":request_id,"sourceSessionId":"target-session","sourceLabel":"Agent","targetSessionId":"caller-session",
            "status":"ok","terminalReason":"completed","createdAt":"2026-10-17T00:00:00Z","payload":body}),
    };
    source.close(None).await.unwrap();
    receive_control(&mut target, "route.suspended").await;
    let (mut source, sh, _) = recovery_device(&server, &a, false).await;
    source
        .send(ClientMessage::Text(
            scoped_control(&sh, "route.resume", json!({"returnRouteId":route}))
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    receive_control(&mut source, "route.resumed").await;
    receive_control(&mut target, "route.resumed").await;
    let channel = establish_real_channel(&mut source, &sh, &mut target, &th).await;
    let (mut source_tls, mut target_tls) = recovery_tls_pair(
        &server,
        &a,
        &b,
        &mut source,
        &mut target,
        (&sh, &th),
        &channel,
    )
    .await;
    target
        .send(ClientMessage::Text(
            scoped_control(
                &th,
                "route.rebind",
                json!({"returnRouteId":route,"channelId":channel}),
            )
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    receive_control(&mut source, "route.rebound").await;
    receive_control(&mut target, "route.rebound").await;
    let value = serde_json::to_value(BusinessObject::Event(event)).unwrap();
    let encoded = myagents_agent_network_protocol::encode_object(&value).unwrap();
    target_tls.write_plaintext(&encoded).unwrap();
    flush_recovery_tls(&mut target, &mut target_tls, &channel).await;
    let result = receive_recovery_object(&mut source, &mut source_tls, &channel).await;
    assert_eq!(result, value);
    assert_eq!(result["event"]["payload"], body);
    let ack = serde_json::to_value(BusinessObject::Ack(ReturnAck {
        version: 1,
        sender_sequence: 2,
        op_id: op,
        return_route_id: route.clone(),
        event_id,
        settlement: ReturnSettlement::Delivered,
    }))
    .unwrap();
    source_tls
        .write_plaintext(&myagents_agent_network_protocol::encode_object(&ack).unwrap())
        .unwrap();
    flush_recovery_tls(&mut source, &mut source_tls, &channel).await;
    assert_eq!(
        receive_recovery_object(&mut target, &mut target_tls, &channel).await,
        ack
    );
    target
        .send(ClientMessage::Text(
            scoped_control(
                &th,
                "route.close",
                json!({"returnRouteId":route,"reason":"RETURN_COMPLETED"}),
            )
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    assert_eq!(
        receive_control(&mut source, "route.closed").await["reason"],
        "RETURN_COMPLETED"
    );
}
