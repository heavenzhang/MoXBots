# AgentNet mobile notifications

Mobile notifications are opt-in. Omitting `mobile_notifications`, or setting
`enabled` to `false`, leaves the current routes and worker unchanged. Enabling
the feature requires the existing `identity` and `network` service settings,
plus at least one provider configuration:

```json
{
  "mobile_notifications": {
    "enabled": true,
    "apns": {
      "team_id": "TEAM_ID",
      "key_id": "KEY_ID",
      "topic": "com.moxbots.mobileinternal",
      "environment": "sandbox",
      "private_key_file": "/absolute/path/AuthKey.p8"
    },
    "fcm": {
      "project_id": "firebase-project-id",
      "service_account_file": "/absolute/path/service-account.json"
    }
  }
}
```

Provider credential files must be owned by the service user, regular
non-symlink files with mode `0600`, and at most 64 KiB. APNs environments are
selected by the endpoint's fixed provider enum (`apns-sandbox` or
`apns-production`) and restricted by `apns.environment`. Choose `sandbox` for a
development push entitlement or `production` for a production entitlement, and
match the actual key's environment and topic. Registration for the other
environment is refused before creating an endpoint. Omitting `environment`
preserves the legacy `both` behavior; use `both` only with an existing key that
supports both environments. Unknown or mistyped scope values are configuration
errors. FCM uses the project ID from config. The clients use fixed
HTTPS origins, disable redirects, set connect/request deadlines, cap provider
responses, and do not retry inside the HTTP client. The outbox owns bounded
retry and lease behavior. FCM service-account access tokens are short-lived and
held in process memory only.

Apple now supports choosing an environment and Topic Specific key scope in
[Certificates, Identifiers & Profiles](https://developer.apple.com/help/account/keys/create-a-private-key/).
For the internal iPhone build, prefer a sandbox key limited to the actual
`com.moxbots.mobileinternal` topic. Reuse an already authorized matching key when
available. Creating a key, downloading its one-time `.p8`, configuring the existing
service, and enabling real delivery are separate operations from this example:
the designated cloud publisher owns the existing maintenance/backup/rollback
window. Never commit the key, Team/Key account material, endpoint token, or
service-account file. Store the private key only in the agreed private credential
location and provide the service-user-owned file by path.

The current implementation does not infer a key's scope from its PEM bytes.
The operator must verify the scope in the Apple account; a passing synthetic
registration test does not prove that Apple accepts the real key or delivers to
the phone. Actual background delivery, notification-tap/cold-start recovery and
fresh approval checks remain acceptance gates. Android also needs a configured
FCM project and compatible Google Play services; see the
[official Android client prerequisites](https://firebase.google.com/docs/cloud-messaging/android/get-started).

When enabled with at least one configured provider, the mobile routes accept
registration, endpoint revocation, redemption, and device-attested source hints.
Every response carries `Cache-Control: no-store, max-age=0`. Provider payloads
contain only an event ID and fixed generic notification text. A successful
redemption returns only the private target device, Agent, and Session
references; the app must still refresh targets and the Session snapshot before
showing any useful context.

Endpoint tokens are kept in `mobile-notify.sqlite3` under the service's private
state directory and are protected by its file permissions; the store does not
encrypt them with an independent service key. Every endpoint records its
registration AuthStore session handle. The worker revalidates that live session,
the exact current DeviceStore binding/generation, and the current delivery lease
before claiming and again before each provider request. Legacy active rows with
no session handle are retired on open.

`POST /api/mobile-notify/v1/source/challenges` returns 201 after durable
challenge binding; `POST /api/mobile-notify/v1/source/hints` returns 200 after
proof verification and enqueueing. The source routes require a fresh AuthStore
session, the exact current DeviceStore binding/generation, and a single-use
`RecoverQuery` proof signed by that device's existing private key. The challenge
database durably binds the session handle, source event ID, connection epoch,
Agent ID, and Session reference before returning its nonce. If proof
consumption and outbox insertion are interrupted across their separate
databases, the response requires a new challenge; a fresh proof for the same
source event and exact pointer reuses the existing event ID. Requests do not
accept caller-supplied principal, network, device, binding, generation,
target-device, or receipt values.

This establishes only that the currently enrolled device key attested the
hint. It does not establish that the device is running Host software or prove
that the Agent/Session relationship is true. The pointer is a non-actionable
hint; mobile clients must refresh their authorized target catalog and current
Session snapshot and require a separate human approval. Host lifecycle
integration, production credentials, provider sends, and real account/device
acceptance remain separate gates.
