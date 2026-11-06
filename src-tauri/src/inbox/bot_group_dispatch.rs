//! A group binding references an already persisted root Session claim. It is
//! not permission to resume/overwrite a target. Native FreshStart alone owns
//! target birth, under its existing lifecycle lock.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BotGroupDispatch {
    pub group_id: String,
    pub request_id: String,
    pub target_session_id: String,
    pub message_id: String,
}

pub fn validate_claim(
    binding: &BotGroupDispatch,
    sessions: &[Value],
    bot_id: &str,
    workspace_path: &str,
    prompt: &str,
    normalize_path: impl Fn(&str) -> String,
) -> Result<(), String> {
    let invalid = || "BOT_GROUP_DISPATCH_MISMATCH".to_string();
    for id in [
        &binding.request_id,
        &binding.target_session_id,
        &binding.message_id,
    ] {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(invalid());
        }
    }
    if binding.group_id == binding.target_session_id
        || binding.message_id == binding.target_session_id
    {
        return Err(invalid());
    }
    if sessions
        .iter()
        .any(|row| row["id"].as_str() == Some(&binding.target_session_id))
    {
        return Err("BOT_GROUP_TARGET_EXISTS".into());
    }
    let sources: Vec<_> = sessions
        .iter()
        .filter(|row| row["id"].as_str() == Some(&binding.group_id))
        .collect();
    if sources.len() != 1 {
        return Err(invalid());
    }
    let source = sources[0];
    if source["archived"].as_bool() == Some(true)
        || source["materializationState"] == "prepared"
        || (!source["origin"].is_null() && source["origin"]["kind"] != "desktop")
    {
        return Err(invalid());
    }
    let ledger = &source["taskOrchestration"];
    let group = &ledger["botGroup"];
    let revision = group["revision"]
        .as_u64()
        .filter(|revision| *revision > 0)
        .ok_or_else(invalid)?;
    if group["schemaVersion"] != 1
        || group["groupId"].as_str() != Some(&binding.group_id)
        || group["projectId"].as_str().is_none()
        || group["rootBotId"].as_str().is_none()
        || group["projectId"] != source["projectSpace"]["projectId"]
        || group["rootBotId"] != source["projectSpace"]["botId"]
    {
        return Err(invalid());
    }
    let records = ledger["botGroupDeliveries"]
        .as_array()
        .ok_or_else(invalid)?;
    if records.len() > 128 {
        return Err(invalid());
    }
    let matches: Vec<_> = records
        .iter()
        .filter(|row| row["requestId"].as_str() == Some(&binding.request_id))
        .collect();
    if matches.len() != 1
        || records
            .iter()
            .filter(|row| row["targetSessionId"].as_str() == Some(&binding.target_session_id))
            .count()
            != 1
        || records
            .iter()
            .filter(|row| row["messageId"].as_str() == Some(&binding.message_id))
            .count()
            != 1
    {
        return Err(invalid());
    }
    let claim = matches[0];
    if claim["groupId"].as_str() != Some(&binding.group_id)
        || claim["groupRevision"].as_u64() != Some(revision)
        || claim["targetSessionId"].as_str() != Some(&binding.target_session_id)
        || claim["messageId"].as_str() != Some(&binding.message_id)
        || claim["botId"].as_str() != Some(bot_id)
        || claim["text"].as_str() != Some(prompt)
        || claim["state"] != "reserved"
        || !claim["result"].is_null()
        || claim["workspacePath"].as_str().map(&normalize_path)
            != Some(normalize_path(workspace_path))
    {
        return Err(invalid());
    }
    let members = group["members"].as_array().ok_or_else(invalid)?;
    let matches: Vec<_> = members
        .iter()
        .filter(|row| row["botId"].as_str() == Some(bot_id))
        .collect();
    if matches.len() != 1
        || matches[0]["active"] != true
        || matches[0]["workspacePath"].as_str().map(&normalize_path)
            != Some(normalize_path(workspace_path))
    {
        return Err(invalid());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Value {
        serde_json::from_str(include_str!(
            "../../../src/shared/__fixtures__/bot-group-delivery.json"
        ))
        .unwrap()
    }
    fn validate(value: &Value) -> Result<(), String> {
        validate_claim(
            &serde_json::from_value(value["binding"].clone()).unwrap(),
            value["sessions"].as_array().unwrap(),
            value["botId"].as_str().unwrap(),
            value["workspacePath"].as_str().unwrap(),
            value["prompt"].as_str().unwrap(),
            str::to_owned,
        )
    }
    #[test]
    fn exact_claim_and_cross_language_rejections() {
        let fixture = fixture();
        assert!(validate(&fixture["baseline"]).is_ok());
        for case in fixture["cases"].as_array().unwrap() {
            let mut value = fixture["baseline"].clone();
            *value.pointer_mut(case["path"].as_str().unwrap()).unwrap() = case["value"].clone();
            assert!(validate(&value).is_err(), "case {}", case["name"]);
        }
    }
    #[test]
    fn native_birth_does_not_reuse_existing_targets_or_a_dispatched_claim() {
        for state in ["accepted", "unconfirmed", "completed", "failed", "stopped"] {
            let mut value = fixture()["baseline"].clone();
            value["sessions"][0]["taskOrchestration"]["botGroupDeliveries"][0]["state"] =
                state.into();
            assert!(validate(&value).is_err());
        }
        let mut value = fixture()["baseline"].clone();
        let target = value["binding"]["targetSessionId"].clone();
        value["sessions"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({"id":target,"materializationState":"prepared"}));
        assert_eq!(validate(&value), Err("BOT_GROUP_TARGET_EXISTS".into()));
    }
    #[test]
    fn archived_source_wrong_project_duplicate_claim_and_path_ids_are_rejected() {
        let mut value = fixture()["baseline"].clone();
        value["sessions"][0]["archived"] = true.into();
        assert!(validate(&value).is_err());
        let mut value = fixture()["baseline"].clone();
        value["sessions"][0]["projectSpace"]["projectId"] = "other".into();
        assert!(validate(&value).is_err());
        let mut value = fixture()["baseline"].clone();
        let claim = value["sessions"][0]["taskOrchestration"]["botGroupDeliveries"][0].clone();
        value["sessions"][0]["taskOrchestration"]["botGroupDeliveries"]
            .as_array_mut()
            .unwrap()
            .push(claim);
        assert!(validate(&value).is_err());
        let mut value = fixture()["baseline"].clone();
        value["binding"]["targetSessionId"] = "../existing".into();
        assert!(validate(&value).is_err());
    }
}
