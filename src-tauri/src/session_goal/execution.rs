use std::time::Duration;

use tauri::{AppHandle, Manager};

use super::busy_log;
use super::{get_session_goal_manager, GoalContinuationRequest, GoalStatus};
use crate::sidecar::{
    ensure_goal_sidecar_owner, execute_goal_turn, get_session_sidecar_port,
    is_goal_work_pending_response, release_session_sidecar, GoalExecutePayload,
    GoalExecuteResponse, ManagedSidecarManager, SidecarOwner,
};
use crate::{ulog_info, ulog_warn};

/// Match the Node Goal orchestrator's `workPending` predicate exactly. An old
/// Sidecar that omits `hasBackgroundWork` keeps its previous behavior.
fn session_state_is_busy(body: &serde_json::Value) -> bool {
    body.get("isBusy").and_then(serde_json::Value::as_bool) == Some(true)
        || body
            .get("hasBackgroundWork")
            .and_then(serde_json::Value::as_bool)
            == Some(true)
}

/// Read backpressure from an already-running Sidecar before paying for owner
/// attachment and a full dispatch. Node remains the authority: any failure or
/// unexpected payload falls through to the normal ensure-and-dispatch path.
async fn peek_busy_deferred(
    manager: &ManagedSidecarManager,
    session_id: &str,
) -> Option<GoalExecuteResponse> {
    let port = get_session_sidecar_port(manager, session_id)
        .ok()
        .flatten()?;
    let client = crate::local_http::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()?;
    let response = client
        .get(format!("http://127.0.0.1:{port}/api/session-state"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().await.ok()?;
    session_state_is_busy(&body).then(|| GoalExecuteResponse {
        success: false,
        turn_dispatched: false,
        termination_unconfirmed: false,
        error: Some("Session work is still running".to_string()),
        code: Some("goal_work_pending".to_string()),
        status: Some(409),
        ai_requested_exit: None,
        exit_reason: None,
        output_text: None,
        goal_channel_delivery_expected: false,
        session_id: Some(session_id.to_string()),
    })
}

pub(super) async fn execute(
    handle: &AppHandle,
    request: &GoalContinuationRequest,
) -> Result<GoalExecuteResponse, String> {
    let goal = &request.goal;
    let sidecars = handle
        .try_state::<ManagedSidecarManager>()
        .ok_or_else(|| "SidecarManager state not available".to_string())?;
    if let Some(deferred) = peek_busy_deferred(sidecars.inner(), &goal.session_id).await {
        busy_log::note_deferred(&goal.id, &goal.session_id);
        return Ok(deferred);
    }
    let _wake_lock = crate::wake_lock::WakeLock::acquire(&format!("Goal {}", goal.id))
        .map_err(|error| {
            ulog_warn!(
                "[Goal] Wake-lock acquire failed for {}: {}; continuing",
                goal.id,
                error
            );
            error
        })
        .ok();
    let port = ensure_goal_sidecar_owner(
        handle,
        sidecars.inner(),
        &goal.workspace_path,
        &goal.session_id,
        &goal.id,
    )
    .await?;

    // Sidecar boot may take seconds. Re-read the durable control epoch before
    // handing this queue item to the Runtime.
    let latest = get_session_goal_manager()
        .get(&goal.id)
        .await
        .map_err(|error| error.to_string())?;
    let still_current = latest.as_ref().is_some_and(|current| {
        current.status == GoalStatus::Active
            && current.control_revision == request.expected_control_revision
            && current.current_turn.is_none()
            && current.delivery_outbox.is_empty()
    });
    if !still_current {
        if latest
            .as_ref()
            .is_none_or(|current| current.status != GoalStatus::Active)
        {
            let _ = release_session_sidecar(
                sidecars.inner(),
                &goal.session_id,
                &SidecarOwner::Goal(goal.id.clone()),
            )
            .await;
        }
        return Err("Goal changed while its Sidecar was starting".to_string());
    }

    let payload = GoalExecutePayload {
        goal_id: goal.id.clone(),
        objective: goal.objective.clone(),
        session_id: goal.session_id.clone(),
        turn_number: request.turn_number,
        ai_can_exit: goal.end_conditions.ai_can_exit,
        permission_mode: goal.permission_mode.clone(),
        queue_id: request.queue_id.clone(),
        expected_control_revision: request.expected_control_revision,
    };
    busy_log::note_resumed(&goal.id);
    let response = execute_goal_turn(
        handle,
        sidecars.inner(),
        &goal.workspace_path,
        port,
        payload,
    )
    .await;
    if response.as_ref().is_ok_and(is_goal_work_pending_response) {
        // The precheck can race a turn that becomes busy between the read and
        // dispatch. Keep the same quiet classification for that response.
        busy_log::note_deferred(&goal.id, &goal.session_id);
    } else if response.is_ok() {
        ulog_info!(
            "[Goal] Continuation {} turn {} accepted by Sidecar for Session {}",
            goal.id,
            request.turn_number,
            goal.session_id
        );
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_state_precheck_matches_the_orchestrator_busy_predicate() {
        assert!(!session_state_is_busy(&serde_json::json!({})));
        assert!(!session_state_is_busy(&serde_json::json!({
            "isBusy": false,
            "hasBackgroundWork": false
        })));
        assert!(session_state_is_busy(&serde_json::json!({
            "isBusy": true,
            "hasBackgroundWork": false
        })));
        assert!(session_state_is_busy(&serde_json::json!({
            "isBusy": false,
            "hasBackgroundWork": true
        })));
        // Old Sidecars omit the additive field; malformed values must not
        // invent backpressure.
        assert!(!session_state_is_busy(&serde_json::json!({
            "isBusy": "true",
            "hasBackgroundWork": 1
        })));
    }
}
