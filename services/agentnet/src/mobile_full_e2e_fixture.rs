//! Isolated original relay router. Only authentication substitutes synthetic SSO.
//! No catalog, peer binding, receipt, Session or execution adapter is injected.
use super::*;
use myagents_agentnet_identity_core::ServiceKeys;
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

fn private(path: &Path, value: &serde_json::Value) {
    let tmp = path.with_extension("tmp");
    let mut f = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(&tmp)
        .unwrap();
    f.write_all(&serde_json::to_vec(value).unwrap()).unwrap();
    f.sync_all().unwrap();
    fs::rename(tmp, path).unwrap();
}

#[tokio::test]
#[ignore = "bounded full mobile E2EE fixture; invoked by original_mobile_wss_host_chain"]
async fn original_relay_service_fixture() {
    let root =
        PathBuf::from(std::env::var_os("MOXBOTS_FULL_E2E_ROOT").expect("explicit private root"));
    let config: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("config.json")).unwrap()).unwrap();
    let origin = config["issuer"].as_str().unwrap().to_owned();
    let state = root.join("service-state");
    fs::create_dir(&state).unwrap();
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
    let network = Uuid::new_v4().to_string();
    let auth = Arc::new(
        AuthStore::open(
            &state,
            &AuthConfig {
                network_id: network.clone(),
                login_ttl: Duration::from_secs(120),
                session_ttl: Duration::from_secs(if config["shortRenewal"] == true {
                    60
                } else {
                    900
                }),
            },
        )
        .unwrap(),
    );
    let identity_config = IdentityHttpConfig {
        issuer: origin.clone(),
        service_id: Uuid::new_v4().to_string(),
        environment: "development".into(),
        key_file: state.join("identity.json"),
    };
    ServiceKeys::generate_initial(&identity_config.key_file).unwrap();
    let identity = IdentityService::open(auth.clone(), &state, &identity_config, &network).unwrap();
    let network_service = NetworkService::open(
        auth.clone(),
        &state,
        &identity_config,
        &network,
        &NetworkHttpConfig {
            name: "Full E2EE isolated network".into(),
        },
    )
    .unwrap();
    let relay = Arc::new(RelayController::new(network_service.clone()).unwrap());
    // Sole test substitution: synthetic same-account SSO, issued by original
    // AuthStore. PKCE and device binding remain checked, single consumption.
    let pending = Arc::new(Mutex::new(HashMap::<String, (String, String)>::new()));
    let login = Router::new().route("/auth/login/start", post({
        let pending = pending.clone(); let origin = origin.clone();
        move |Json(v): Json<serde_json::Value>| { let pending = pending.clone(); let origin = origin.clone(); async move {
            let device = v["deviceId"].as_str().unwrap().to_owned();
            assert_eq!(Uuid::parse_str(&device).unwrap().to_string(), device);
            let challenge = v["pkceChallenge"].as_str().unwrap().to_owned(); assert_eq!(URL_SAFE_NO_PAD.decode(&challenge).unwrap().len(),32);
            let tx = Uuid::new_v4().to_string(); pending.lock().unwrap().insert(tx.clone(),(device,challenge));
            Json(serde_json::json!({"transactionId":tx,"authorizationUrl":format!("{origin}/synthetic-sso"),"expiresAt":jsonwebtoken::get_current_timestamp()+120}))
        }}
    })).route("/auth/login/poll", post({
        let pending = pending.clone(); let auth = auth.clone();
        move |Json(v): Json<serde_json::Value>| { let pending = pending.clone(); let auth = auth.clone(); async move {
            let tx = v["transactionId"].as_str().unwrap(); let device = v["deviceId"].as_str().unwrap();
            let verifier = v["pkceVerifier"].as_str().unwrap();
            let (expected_device,challenge) = pending.lock().unwrap().remove(tx).unwrap();
            assert_eq!(expected_device,device); assert_eq!(challenge,URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())));
            let subject = VerifiedSubject::from_verified_claims("https://isolated-synthetic-sso.invalid".into(),"same-synthetic-account".into()).unwrap();
            let issued = auth.issue_session(&subject,device).unwrap(); let token=issued.into_token(); let s=auth.validate_session(&token).unwrap();
            Json(serde_json::json!({"accessToken":token.as_str(),"principalId":s.account.principal_id,"networkId":s.account.network_id,"expiresAt":s.expires_at}))
        }}
    })).route("/auth/session", get({ let auth=auth.clone(); move |headers:HeaderMap| {let auth=auth.clone();async move {
        let token=headers.get(header::AUTHORIZATION).unwrap().to_str().unwrap().strip_prefix("Bearer ").unwrap();
        match auth.validate_session(token) { Ok(s)=>(StatusCode::OK,Json(serde_json::json!({"principalId":s.account.principal_id,"networkId":s.account.network_id,"deviceId":s.device_id,"expiresAt":s.expires_at}))).into_response(),Err(_)=>StatusCode::UNAUTHORIZED.into_response() }
    }}}));
    let router = assemble_feature_routes(
        login,
        Some(identity),
        Some(network_service),
        Some(relay),
        &origin,
    );
    let renewal_marker = root.join("renewal-observed.json");
    let router = router
        .layer(axum::middleware::map_response(super::no_store))
        .layer(axum::middleware::from_fn(
            move |request: axum::extract::Request, next: axum::middleware::Next| {
                let renewal_marker = renewal_marker.clone();
                async move {
                    // Synthetic loopback fixture only: retain failure provenance
                    // without bodies, credentials, query strings or headers.
                    let method = request.method().clone();
                    let path = request.uri().path().to_owned();
                    let response = next.run(request).await;
                    eprintln!(
                        "fixture-http method={method} path={path} status={}",
                        response.status().as_u16()
                    );
                    if path == "/v1/session/renew" && response.status().is_success() {
                        private(&renewal_marker, &serde_json::json!({"status":200}));
                    }
                    response
                }
            },
        ));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    private(
        &root.join("service-ready.json"),
        &serde_json::json!({"address":listener.local_addr().unwrap().to_string()}),
    );
    tokio::time::timeout(
        Duration::from_secs(180),
        axum::serve(listener, router).into_future(),
    )
    .await
    .unwrap()
    .unwrap();
}
