//! Only compiled by the service test binary. No fixture route enters production.
use super::*;
use crate::{AuthConfig, VerifiedSubject};
use axum::{Json, routing::get};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    time::Duration,
};

fn write_private(path: &std::path::Path, value: &Value) {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(&temporary)
        .unwrap();
    file.write_all(&serde_json::to_vec(value).unwrap()).unwrap();
    drop(file);
    fs::rename(temporary, path).unwrap();
}
async fn pause_hint_response(root: &std::path::Path, phase: &str) {
    let flag = root.join(format!("pause-hint-{phase}"));
    write_private(
        &root.join("hint-pause-entered.json"),
        &json!({"phase":phase}),
    );
    let start = std::time::Instant::now();
    while flag.exists() {
        assert!(
            start.elapsed() < Duration::from_secs(15),
            "explicit fixture HTTP pause timed out"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}
#[tokio::test]
#[ignore = "explicit isolated loopback fixture spawned by actual Host publish acceptance"]
async fn actual_host_source_service_fixture() {
    let root = std::path::PathBuf::from(
        std::env::var_os("MOXBOTS_SOURCE_COMBINED_ROOT").expect("explicit private fixture root"),
    );
    let config: Value =
        serde_json::from_slice(&fs::read(root.join("service-config.json")).unwrap()).unwrap();
    let state = root.join("service-state");
    fs::create_dir(&state).unwrap();
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
    let network = config["instance"]["networkId"].as_str().unwrap();
    let auth = Arc::new(
        AuthStore::open(
            &state,
            &AuthConfig {
                network_id: network.into(),
                login_ttl: Duration::from_secs(60),
                session_ttl: Duration::from_secs(900),
            },
        )
        .unwrap(),
    );
    let devices = Arc::new(DeviceStore::open(&state).unwrap());
    let store = Arc::new(Store::open(&state).unwrap());
    let device = config["deviceId"].as_str().unwrap();
    let token = auth
        .issue_session(
            &VerifiedSubject::from_verified_claims(
                "https://isolated-fixture.invalid".into(),
                "isolated-source-owner".into(),
            )
            .unwrap(),
            device,
        )
        .unwrap()
        .into_token();
    let session = auth.validate_session(&token).unwrap();
    let record = devices
        .claim_initial(&session_context(&session), config["csr"].as_str().unwrap())
        .unwrap();
    let service = MobileNotificationService::new(auth.clone(), devices, store, network);
    let projection = json!({"principalId":session.account.principal_id,"networkId":session.account.network_id,"deviceId":session.device_id,"expiresAt":session.expires_at});
    // These two test-only adapters use the actual AuthStore for credential freshness.
    let router=service.router().merge(Router::new().route("/api/agent-network/instance",get({let instance=config["instance"].clone();move||{let instance=instance.clone();async move{([(header::CACHE_CONTROL,"no-store")],Json(instance))}}}))).merge(Router::new().route("/auth/session",get({let auth=auth.clone();move|headers:HeaderMap|{let auth=auth.clone();async move{let result=bearer_token(&headers).and_then(|bearer|auth.validate_session(&bearer).map_err(|_|MobileHttpError::unauthorized()));match result{Ok(s)=>(StatusCode::OK,[(header::CACHE_CONTROL,"no-store")],Json(json!({"principalId":s.account.principal_id,"networkId":s.account.network_id,"deviceId":s.device_id,"expiresAt":s.expires_at}))).into_response(),Err(e)=>e.into_response()}}}})));
    let router = router.layer(axum::middleware::from_fn(no_store));
    let router = router.layer(axum::middleware::from_fn({
        let root = root.clone();
        move |request: axum::extract::Request, next: axum::middleware::Next| {
            let root = root.clone();
            async move {
                let hint = request.uri().path() == "/api/mobile-notify/v1/source/hints";
                // Capture this request's test gates before processing: a late old
                // request must never adopt a subsequent case's pause flag.
                let before = hint && root.join("pause-hint-before").exists();
                let after = hint && root.join("pause-hint-after").exists();
                if before {
                    pause_hint_response(&root, "before").await;
                }
                let response = next.run(request).await;
                if after {
                    pause_hint_response(&root, "after").await;
                }
                response
            }
        }
    }));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    write_private(
        &root.join("service-ready.json"),
        &json!({"address":listener.local_addr().unwrap().to_string(),"token":token.as_str(),"session":projection,"deviceGeneration":record.key_generation,"identityBindingId":record.identity_binding_id}),
    );
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let start = std::time::Instant::now();
    let mut last_id = Value::Null;
    while start.elapsed() < Duration::from_secs(180) {
        if root.join("service-stop").exists() {
            break;
        }
        if let Ok(bytes) = fs::read(root.join("service-command.json")) {
            let command: Value = serde_json::from_slice(&bytes).unwrap();
            if command["id"] != last_id {
                if command["operation"] == "revoke" {
                    auth.revoke_session(&token).unwrap();
                }
                let connection =
                    rusqlite::Connection::open(state.join("mobile-notify.sqlite3")).unwrap();
                let mut stmt=connection.prepare("SELECT event_id,source_event_id,agent_id,session_id FROM hint_events ORDER BY created_at,event_id").unwrap();
                let events:Vec<Value>=stmt.query_map([],|r|Ok(json!({"eventId":r.get::<_,String>(0)?,"sourceEventId":r.get::<_,String>(1)?,"agentId":r.get::<_,String>(2)?,"sessionId":r.get::<_,String>(3)?}))).unwrap().map(Result::unwrap).collect();
                let mut proof_rows=connection.prepare("SELECT source_event_id,connection_epoch,agent_id,session_id,state,event_id FROM source_challenges ORDER BY created_at,challenge_id").unwrap();
                let proofs:Vec<Value>=proof_rows.query_map([],|r|Ok(json!({"sourceEventId":r.get::<_,String>(0)?,"connectionEpoch":r.get::<_,String>(1)?,"agentId":r.get::<_,String>(2)?,"sessionId":r.get::<_,String>(3)?,"state":r.get::<_,String>(4)?,"eventId":r.get::<_,Option<String>>(5)?}))).unwrap().map(Result::unwrap).collect();
                last_id = command["id"].clone();
                write_private(
                    &root.join("service-result.json"),
                    &json!({"id":last_id,"events":events,"proofs":proofs}),
                );
            }
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    server.abort();
}
