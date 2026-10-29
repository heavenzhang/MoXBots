//! Native-only proof of a Session Tab request. The signing key never leaves Rust.
use base64::{engine::general_purpose::STANDARD, Engine};
use p256::{
    ecdsa::{signature::Signer, Signature, SigningKey},
    elliptic_curve::rand_core::OsRng,
    pkcs8::EncodePublicKey,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

pub const PUBLIC_KEY_ENV: &str = "MYAGENTS_USER_ACTION_PUBLIC_KEY";
pub const ENVELOPE_HEADER: &str = "X-MyAgents-User-Action";
pub const SIGNATURE_HEADER: &str = "X-MyAgents-User-Action-Signature";
static SIGNING_KEY: OnceLock<SigningKey> = OnceLock::new();

fn signing_key() -> &'static SigningKey {
    SIGNING_KEY.get_or_init(|| SigningKey::random(&mut OsRng))
}

/// SPKI public DER only: Node can verify requests but cannot stamp new ones.
pub fn public_key_spki_base64() -> String {
    let document = signing_key()
        .verifying_key()
        .to_public_key_der()
        .expect("a valid P256 verifying key has a valid SPKI encoding");
    STANDARD.encode(document.as_bytes())
}

/// Strip even mixed-case duplicates before selecting any proxy destination.
pub fn strip_untrusted_headers(headers: &mut Option<HashMap<String, String>>) {
    if let Some(headers) = headers {
        headers.retain(|key, _| {
            !key.eq_ignore_ascii_case(ENVELOPE_HEADER)
                && !key.eq_ignore_ascii_case(SIGNATURE_HEADER)
        });
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Envelope<'a> {
    version: u8,
    session_id: &'a str,
    path: &'a str,
    body_sha256: String,
    timestamp_ms: u64,
    nonce: String,
}

/// The caller supplies an already acquired, exact Session owner binding.
/// All other methods, paths and owners remain unsigned, with forged headers removed.
pub fn stamp_session_request(
    headers: &mut Option<HashMap<String, String>>,
    method: &str,
    path: &str,
    body: Option<&str>,
    session_id_hint: &str,
    tab_owned: bool,
) -> Result<(), String> {
    strip_untrusted_headers(headers);
    if !tab_owned
        || !method.eq_ignore_ascii_case("POST")
        || !matches!(
            path,
            "/api/session/task-orchestration/plan"
                | "/chat/send"
                | "/api/session/recovery/reconcile"
        )
    {
        return Ok(());
    }
    let body = body.ok_or("USER_ACTION_BODY_REQUIRED")?;
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "USER_ACTION_BODY_INVALID")?;
    if session_id_hint.is_empty()
        || value.get("sessionId").and_then(|v| v.as_str()) != Some(session_id_hint)
    {
        return Err("USER_ACTION_SESSION_MISMATCH".into());
    }
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "USER_ACTION_CLOCK_UNAVAILABLE")?
        .as_millis();
    let envelope = Envelope {
        version: 1,
        session_id: session_id_hint,
        path,
        body_sha256: format!("{:x}", Sha256::digest(body.as_bytes())),
        timestamp_ms: u64::try_from(timestamp_ms).map_err(|_| "USER_ACTION_CLOCK_UNAVAILABLE")?,
        nonce: uuid::Uuid::new_v4().to_string(),
    };
    let encoded = serde_json::to_vec(&envelope).map_err(|_| "USER_ACTION_ENCODING_FAILED")?;
    let signature: Signature = signing_key().sign(&encoded);
    let headers = headers.get_or_insert_with(HashMap::new);
    headers.insert(ENVELOPE_HEADER.into(), STANDARD.encode(&encoded));
    headers.insert(
        SIGNATURE_HEADER.into(),
        STANDARD.encode(signature.to_der().as_bytes()),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::{
        ecdsa::{signature::Verifier, VerifyingKey},
        pkcs8::DecodePublicKey,
    };

    const BODY: &str = r#"{"sessionId":"session-a","kind":"confirm","proposalId":"plan-1"}"#;
    fn stamped(path: &str) -> HashMap<String, String> {
        let mut headers = None;
        stamp_session_request(&mut headers, "POST", path, Some(BODY), "session-a", true).unwrap();
        headers.unwrap()
    }
    #[test]
    fn verifies_spki_der_signature_and_exact_body_target() {
        let headers = stamped("/api/session/task-orchestration/plan");
        let bytes = STANDARD.decode(&headers[ENVELOPE_HEADER]).unwrap();
        let envelope: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(envelope["version"], 1);
        assert_eq!(envelope["sessionId"], "session-a");
        assert_eq!(envelope["path"], "/api/session/task-orchestration/plan");
        assert_eq!(
            envelope["bodySha256"],
            format!("{:x}", Sha256::digest(BODY.as_bytes()))
        );
        assert!(envelope["timestampMs"].as_u64().unwrap() > 0);
        assert!(uuid::Uuid::parse_str(envelope["nonce"].as_str().unwrap()).is_ok());
        let public = STANDARD.decode(public_key_spki_base64()).unwrap();
        let verifier = VerifyingKey::from_public_key_der(&public).unwrap();
        let signature =
            Signature::from_der(&STANDARD.decode(&headers[SIGNATURE_HEADER]).unwrap()).unwrap();
        assert!(verifier.verify(&bytes, &signature).is_ok());
        let tampered = String::from_utf8(bytes.clone())
            .unwrap()
            .replace("session-a", "session-b");
        assert!(verifier.verify(tampered.as_bytes(), &signature).is_err());
        let tampered = String::from_utf8(bytes)
            .unwrap()
            .replace("/api/session/task-orchestration/plan", "/chat/send");
        assert!(verifier.verify(tampered.as_bytes(), &signature).is_err());
        assert_ne!(
            envelope["bodySha256"],
            format!(
                "{:x}",
                Sha256::digest(BODY.replace("confirm", "request_revision").as_bytes())
            )
        );
    }
    #[test]
    fn recovery_review_is_bound_to_exact_body_and_tab_owner() {
        let headers = stamped("/api/session/recovery/reconcile");
        let bytes = STANDARD.decode(&headers[ENVELOPE_HEADER]).unwrap();
        let envelope: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(envelope["path"], "/api/session/recovery/reconcile");
        assert_eq!(envelope["sessionId"], "session-a");
        let public = STANDARD.decode(public_key_spki_base64()).unwrap();
        let verifier = VerifyingKey::from_public_key_der(&public).unwrap();
        let signature =
            Signature::from_der(&STANDARD.decode(&headers[SIGNATURE_HEADER]).unwrap()).unwrap();
        assert!(verifier.verify(&bytes, &signature).is_ok());
        for (path, tab) in [
            ("/api/session/recovery/reconcile", false),
            ("/api/session/recovery/reconcile?force=1", true),
            ("/api/session/recovery/actions", true),
        ] {
            let mut unsigned = None;
            stamp_session_request(&mut unsigned, "POST", path, Some(BODY), "session-a", tab)
                .unwrap();
            assert!(unsigned.is_none());
        }
    }

    #[test]
    fn rejects_body_from_another_session_without_retaining_forged_headers() {
        let mut headers = Some(HashMap::from([
            (ENVELOPE_HEADER.into(), "forged".into()),
            (SIGNATURE_HEADER.into(), "forged".into()),
        ]));
        assert!(stamp_session_request(
            &mut headers,
            "POST",
            "/chat/send",
            Some(BODY),
            "session-b",
            true
        )
        .is_err());
        assert!(headers.unwrap().is_empty());
    }
    #[test]
    fn only_exact_tab_post_paths_can_be_signed() {
        for (method, path, tab) in [
            ("GET", "/chat/send", true),
            ("POST", "/chat/send?x=1", true),
            ("POST", "/api/admin/session/tasks", true),
            ("POST", "/chat/send", false),
        ] {
            let mut headers = Some(HashMap::from([
                ("x-MYAGENTS-user-ACTION".into(), "fake".into()),
                ("x-myagents-USER-action-signature".into(), "fake".into()),
                ("Content-Type".into(), "application/json".into()),
            ]));
            stamp_session_request(&mut headers, method, path, Some(BODY), "session-a", tab)
                .unwrap();
            let headers = headers.unwrap();
            assert_eq!(headers.len(), 1);
            assert!(headers.contains_key("Content-Type"));
        }
    }
    #[test]
    fn global_or_analytics_stripping_preserves_only_unrelated_headers() {
        let mut headers = Some(HashMap::from([
            (ENVELOPE_HEADER.into(), "fake".into()),
            (SIGNATURE_HEADER.into(), "fake".into()),
            ("Accept".into(), "application/json".into()),
        ]));
        strip_untrusted_headers(&mut headers);
        assert_eq!(
            headers.unwrap(),
            HashMap::from([("Accept".into(), "application/json".into())])
        );
    }
    #[test]
    fn requires_valid_json_and_exact_nonempty_session_identity() {
        for (body, hint) in [
            (None, "session-a"),
            (Some("not-json"), "session-a"),
            (Some("{}"), "session-a"),
            (Some(BODY), ""),
        ] {
            assert!(
                stamp_session_request(&mut None, "POST", "/chat/send", body, hint, true).is_err()
            );
        }
    }
    #[test]
    fn uses_one_process_public_key_and_fresh_request_nonces() {
        assert_eq!(public_key_spki_base64(), public_key_spki_base64());
        let a = stamped("/chat/send");
        let b = stamped("/chat/send");
        assert_ne!(a[ENVELOPE_HEADER], b[ENVELOPE_HEADER]);
    }
}
