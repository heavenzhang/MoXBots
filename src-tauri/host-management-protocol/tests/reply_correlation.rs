use myagents_host_management_protocol::{
    RemoteAssetRequest, RemoteAssetResult, RemoteMobileRequest, RemoteMobileResult,
};
use serde_json::{Value, json};

const ID: &str = "00000000-0000-4000-8000-000000000001";
const OTHER: &str = "00000000-0000-4000-8000-000000000002";
const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn mobile(request: Value, result: Value) -> bool {
    serde_json::from_value::<RemoteMobileRequest>(request)
        .unwrap()
        .matches_result(&serde_json::from_value::<RemoteMobileResult>(result).unwrap())
}
fn asset(request: Value, result: Value) -> bool {
    serde_json::from_value::<RemoteAssetRequest>(request)
        .unwrap()
        .matches_result(&serde_json::from_value::<RemoteAssetResult>(result).unwrap())
}

#[test]
fn mobile_replies_bind_agent_operation_session_and_suggestion_revision() {
    let cases = [
        (
            json!({"kind":"mobile.capabilities"}),
            json!({"kind":"mobile.capabilities","attachments":true,"modelSelection":true,"nextSuggestions":true,"maxAssets":8}),
        ),
        (
            json!({"kind":"mobile.models"}),
            json!({"kind":"mobile.models","items":[{"id":"qa-model","label":"Controlled test"}]}),
        ),
        (
            json!({"kind":"mobile.suggestions","sessionId":"session","revision":"r1"}),
            json!({"kind":"mobile.suggestions","sessionId":"session","revision":"r1","suggestions":["Continue"]}),
        ),
        (
            json!({"kind":"mobile.start","operationId":ID,"text":"Controlled test","assetIds":[]}),
            json!({"kind":"mobile.receipt","operationId":ID,"sessionId":"session","status":"accepted","code":null}),
        ),
        (
            json!({"kind":"mobile.send","operationId":ID,"sessionId":"session","text":"Controlled test","assetIds":[]}),
            json!({"kind":"mobile.receipt","operationId":ID,"sessionId":"session","status":"accepted","code":null}),
        ),
        (
            json!({"kind":"mobile.receipt","operationId":ID}),
            json!({"kind":"mobile.receipt","operationId":ID,"sessionId":"session","status":"accepted","code":null}),
        ),
    ];
    for (mut request, mut result) in cases {
        for value in [&mut request, &mut result] {
            value["version"] = json!(1);
            value["agentId"] = json!("qa-agent");
        }
        assert!(
            mobile(request.clone(), result.clone()),
            "{}",
            request["kind"]
        );
        let mut wrong = result.clone();
        wrong["agentId"] = json!("foreign-agent");
        assert!(!mobile(request.clone(), wrong));
        let mut wrong = result.clone();
        wrong["version"] = json!(2);
        assert!(!mobile(request.clone(), wrong));
        if request.get("operationId").is_some() {
            let mut wrong = result.clone();
            wrong["operationId"] = json!(OTHER);
            assert!(!mobile(request.clone(), wrong));
        }
        if request.get("sessionId").is_some() {
            let mut wrong = result.clone();
            wrong["sessionId"] = json!("foreign-session");
            assert!(!mobile(request.clone(), wrong));
        }
        if request.get("revision").is_some() {
            let mut wrong = result.clone();
            wrong["revision"] = json!("stale");
            assert!(!mobile(request.clone(), wrong));
        }
        assert!(mobile(
            request,
            json!({"kind":"mobile.error","version":1,"code":"REMOTE_SESSION_PRIVATE"})
        ));
    }
}

#[test]
fn asset_replies_bind_each_transfer_and_requested_read_range() {
    let cases = [
        (
            json!({"kind":"capabilities"}),
            json!({"kind":"capabilities","maxBytes":20971520,"maxChunkBytes":24576}),
        ),
        (
            json!({"kind":"upload.begin","uploadId":ID,"name":"qa.txt","mimeType":"text/plain","sizeBytes":3,"sha256":HASH}),
            json!({"kind":"upload","uploadId":ID,"receivedBytes":0,"totalBytes":3,"state":"uploading"}),
        ),
        (
            json!({"kind":"upload.chunk","uploadId":ID,"offset":0,"dataBase64":"YWJj","sha256":HASH}),
            json!({"kind":"upload","uploadId":ID,"receivedBytes":3,"totalBytes":3,"state":"uploading"}),
        ),
        (
            json!({"kind":"upload.status","uploadId":ID}),
            json!({"kind":"upload","uploadId":ID,"receivedBytes":3,"totalBytes":3,"state":"ready"}),
        ),
        (
            json!({"kind":"upload.finish","uploadId":ID}),
            json!({"kind":"asset","uploadId":ID,"assetId":OTHER,"name":"qa.txt","mimeType":"text/plain","sizeBytes":3,"sha256":HASH}),
        ),
        (
            json!({"kind":"upload.cancel","uploadId":ID}),
            json!({"kind":"upload","uploadId":ID,"receivedBytes":3,"totalBytes":3,"state":"cancelled"}),
        ),
        (
            json!({"kind":"list","sessionId":"session","limit":1}),
            json!({"kind":"list","sessionId":"session","items":[],"hasMore":false,"nextBefore":null}),
        ),
        (
            json!({"kind":"read","sessionId":"session","artifactId":ID,"offset":0,"maxBytes":3}),
            json!({"kind":"chunk","sessionId":"session","artifactId":ID,"offset":0,"dataBase64":"YWJj","sha256":HASH,"eof":true}),
        ),
    ];
    for (mut request, mut result) in cases {
        for value in [&mut request, &mut result] {
            value["version"] = json!(1);
            value["agentId"] = json!("qa-agent");
        }
        assert!(
            asset(request.clone(), result.clone()),
            "{}",
            request["kind"]
        );
        let mut wrong = result.clone();
        wrong["agentId"] = json!("foreign-agent");
        assert!(!asset(request.clone(), wrong));
        let mut wrong = result.clone();
        wrong["version"] = json!(2);
        assert!(!asset(request.clone(), wrong));
        for key in ["uploadId", "artifactId", "sessionId"] {
            if request.get(key).is_some() {
                let mut wrong = result.clone();
                wrong[key] = if key == "sessionId" {
                    json!("foreign-session")
                } else {
                    json!(OTHER)
                };
                assert!(!asset(request.clone(), wrong), "{key}");
            }
        }
        if request["kind"] == "read" {
            let mut wrong = result.clone();
            wrong["offset"] = json!(1);
            assert!(!asset(request.clone(), wrong));
            let mut too_small = request.clone();
            too_small["maxBytes"] = json!(1);
            assert!(!asset(too_small, result.clone()));
            let mut wrong = result.clone();
            wrong["sha256"] = json!("invalid-hash");
            assert!(!asset(request.clone(), wrong));
        }
        if request["kind"] == "upload.begin" {
            let mut wrong = result.clone();
            wrong["totalBytes"] = json!(4);
            assert!(!asset(request.clone(), wrong));
        }
        if request["kind"] == "upload.chunk" {
            let mut short = result.clone();
            short["receivedBytes"] = json!(2);
            assert!(!asset(request.clone(), short));
            let mut duplicate = result.clone();
            duplicate["receivedBytes"] = json!(6);
            duplicate["totalBytes"] = json!(6);
            assert!(asset(request.clone(), duplicate));
        }
        if request["kind"] == "upload.cancel" {
            let mut wrong = result.clone();
            wrong["state"] = json!("ready");
            assert!(!asset(request.clone(), wrong));
        }
        assert!(asset(
            request,
            json!({"kind":"error","version":1,"code":"ASSET_NOT_FOUND"})
        ));
    }
}

#[test]
fn reply_families_are_not_interchangeable_and_list_limits_are_retained() {
    let request =
        json!({"version":1,"agentId":"qa-agent","kind":"list","sessionId":"session","limit":1});
    let item = json!({"artifactId":ID,"name":"qa.txt","mimeType":"text/plain","sizeBytes":3,"sha256":HASH});
    assert!(!asset(
        request,
        json!({"version":1,"agentId":"qa-agent","kind":"list","sessionId":"session","items":[item.clone(),item],"hasMore":false,"nextBefore":null})
    ));
    assert!(!mobile(
        json!({"version":1,"agentId":"qa-agent","kind":"mobile.models"}),
        json!({"version":1,"agentId":"qa-agent","kind":"mobile.capabilities","attachments":true,"modelSelection":true,"nextSuggestions":true,"maxAssets":8})
    ));
}
