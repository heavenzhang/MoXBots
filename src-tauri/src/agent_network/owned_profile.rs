//! Legacy owned relay restrictions. Agent authority requires explicit capability
//! negotiation and a current enabled mount plus server-issued permit.
use super::{transport::NetworkRoute, NetworkError};
use myagents_agent_network_protocol::ServerMessage;

/// Presence of one extension is insufficient; every prerequisite must be
/// explicitly implemented by this server before publishing Agent business.
pub(crate) fn supports_agents(metadata: &serde_json::Value) -> bool {
    let Some(capabilities) = metadata["capabilities"].as_array() else {
        return false;
    };
    ["tls13-mtls", "typed-rpc", "permit-v1", "return-v1"]
        .iter()
        .all(|required| capabilities.iter().any(|value| value == required))
}

pub(crate) fn control(message: &ServerMessage) -> Result<(), NetworkError> {
    if matches!(
        message,
        ServerMessage::AuthRefreshed { .. }
            | ServerMessage::Ready { .. }
            | ServerMessage::Changed { .. }
            | ServerMessage::Error { .. }
            | ServerMessage::ChannelOffer { .. }
            | ServerMessage::ChannelAccepted { .. }
            | ServerMessage::Credit { .. }
            | ServerMessage::ChannelReady { .. }
            | ServerMessage::ChannelClosed { .. }
    ) {
        Ok(())
    } else {
        Err(NetworkError::new("OWNED_PROFILE_UNSUPPORTED"))
    }
}
pub(crate) fn metadata(route: &NetworkRoute<'_>) -> Result<(), NetworkError> {
    if matches!(
        route,
        NetworkRoute::Network
            | NetworkRoute::Devices { .. }
            | NetworkRoute::Agents { .. }
            | NetworkRoute::OwnedSelfPolicy { .. }
            | NetworkRoute::Membership { .. }
            | NetworkRoute::DeviceName { .. }
            | NetworkRoute::Receipt { .. }
    ) {
        Ok(())
    } else {
        Err(NetworkError::new("OWNED_PROFILE_UNSUPPORTED"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use myagents_agent_network_protocol::ConnectionScope;
    #[test]
    fn owned_profile_rejects_business_routes_and_controls() {
        assert!(metadata(&NetworkRoute::Resolve {
            network_id: "n",
            mount_id: "m"
        })
        .is_err());
        assert!(metadata(&NetworkRoute::Callable {
            network_id: "n",
            cursor: None,
            limit: 1
        })
        .is_err());
        assert!(metadata(&NetworkRoute::Mount {
            network_id: "n",
            mount_id: "m"
        })
        .is_err());
        assert!(metadata(&NetworkRoute::Devices {
            cursor: None,
            limit: 1
        })
        .is_ok());
        assert!(metadata(&NetworkRoute::OwnedSelfPolicy {
            cursor: None,
            limit: 1
        })
        .is_ok());
        let scope = ConnectionScope {
            service_id: "s".into(),
            network_id: "n".into(),
            boot_epoch: "b".into(),
            connection_epoch: "c".into(),
        };
        assert!(control(&ServerMessage::RouteClosed {
            scope: scope.clone(),
            return_route_id: "r".into(),
            reason: "test".into()
        })
        .is_err());
        assert!(control(&ServerMessage::Ready {
            scope,
            catalog_seq: 1
        })
        .is_ok());
    }
    #[test]
    fn agent_business_requires_all_prerequisites_and_legacy_remains_restricted() {
        use serde_json::json;
        for metadata in [
            json!({}),
            json!({"capabilities":[]}),
            json!({"capabilities":["return-resume-v1"]}),
            json!({"capabilities":["tls13-mtls","typed-rpc","permit-v1"]}),
            json!({"capabilities":"typed-rpc"}),
        ] {
            assert!(!supports_agents(&metadata));
        }
        assert!(supports_agents(
            &json!({"capabilities":["tls13-mtls","typed-rpc","permit-v1","return-v1"]})
        ));
        assert!(supports_agents(
            &json!({"capabilities":["tls13-mtls","typed-rpc","permit-v1","return-v1","return-resume-v1"]})
        ));
    }
}
