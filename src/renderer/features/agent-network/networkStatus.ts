import {
  networkErrorKey,
  type NetworkSnapshot,
  type NetworkConnection,
} from "@/api/agentNetwork";

const stoppedOwnedConnectionErrors = new Set([
  "NETWORK_CREDENTIAL_STORE_AUTHORIZATION_REQUIRED",
  "NETWORK_CREDENTIAL_STORE_UNAVAILABLE",
  "NETWORK_CREDENTIAL_STORE_INVALID",
  "OWNED_SESSION_RECORD_MISSING",
  "KEY_GENERATION_CONFLICT",
  "NETWORK_CREDENTIAL_GENERATION_CONFLICT",
]);

export function networkStatusMessage(
  snapshot: NetworkSnapshot,
  official: boolean,
  ownedAccount?: NetworkConnection["ownedAccount"],
) {
  // Registry owns credential/session validity, including expiry without an actor.
  if (!official && ownedAccount?.state === "signInRequired")
    return "agentNetwork.errors.ownedSignInRequired";
  // Explicit authentication failures outrank transport state, including a
  // snapshot caught between the authentication and connection projections.
  if (snapshot.error?.code === "SPACE_REAUTH_REQUIRED")
    return official
      ? "agentNetwork.signInRequired"
      : "agentNetwork.errors.ownedSignInRequired";
  if (!official && networkErrorKey(snapshot.error) === "ownedSignInRequired")
    return "agentNetwork.errors.ownedSignInRequired";
  if (
    !official &&
    snapshot.state === "disconnected" &&
    snapshot.error &&
    stoppedOwnedConnectionErrors.has(snapshot.error.code)
  ) {
    return `agentNetwork.errors.${networkErrorKey(snapshot.error)}`;
  }
  if (snapshot.error?.code === "NETWORK_REMOVAL_UNCONFIRMED")
    return "agentNetwork.errors.removalPending";
  if (snapshot.state === "signedOut") return "agentNetwork.signInRequired";
  if (snapshot.error?.code === "NETWORK_CONNECTION_TIMEOUT")
    return "agentNetwork.errors.connectionTimeout";
  if (snapshot.state === "connecting") return "agentNetwork.connecting";
  if (snapshot.state === "disconnected") return "agentNetwork.reconnecting";
  return `agentNetwork.errors.${networkErrorKey(snapshot.error)}`;
}

/** Compact labels describe the connection, never a peer device's presence. */
export function networkStatusLabel(connection: NetworkConnection): string {
  if (connection.removing) return "agentNetwork.removalPending";
  const message = networkStatusMessage(
    connection.snapshot,
    connection.official,
    connection.ownedAccount,
  );
  if (
    message === "agentNetwork.errors.ownedSignInRequired" ||
    message === "agentNetwork.signInRequired"
  )
    return "agentNetwork.signInRequired";
  if (message === "agentNetwork.errors.connectionTimeout")
    return "agentNetwork.connectionTimeout";
  if (message === "agentNetwork.errors.credentialStoreAuthorizationRequired")
    return "agentNetwork.authorizationRequired";
  if (connection.snapshot.state === "ready") return "agentNetwork.online";
  if (connection.snapshot.state === "connecting") return "agentNetwork.connecting";
  return "agentNetwork.connectionUnavailable";
}
