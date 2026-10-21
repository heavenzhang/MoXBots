//! Desktop adapter for the existing generic mobile source protocol.
use super::NetworkError;
use tauri::Manager;

#[path = "notification_source_queue.rs"]
mod queue;
pub(super) use queue::{
    Activation, DesktopNotificationSource, Observation, PolicyLease, PolicyVersion, SourceScope,
};
#[path = "notification_source_delivery.rs"]
pub(super) mod delivery;

pub(super) struct Lifetime(
    pub std::sync::Arc<DesktopNotificationSource>,
    pub Option<Activation>,
);
impl Drop for Lifetime {
    fn drop(&mut self) {
        if let Some(expected) = &self.1 {
            self.0.deactivate(expected);
        }
    }
}

/// Called only after SidecarManager issued the original opaque completion
/// claim. A renderer navigation or OS toast cannot manufacture this handoff.
pub(crate) fn observe_claimed_completion<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    terminal: &crate::notification::SessionCompletionTerminal,
    claim: &crate::sidecar::SessionCompletionClaim,
) {
    if let Some(network) = app.try_state::<super::registry::ManagedAgentNetwork>() {
        for connection in network.all() {
            connection.observe_mobile_completion(terminal, claim);
        }
    }
}
