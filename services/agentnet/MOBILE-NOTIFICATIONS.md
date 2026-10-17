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
      "topic": "com.example.moxbots",
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
`apns-production`); FCM uses the project ID from config. The clients use fixed
HTTPS origins, disable redirects, set connect/request deadlines, cap provider
responses, and do not retry inside the HTTP client. The outbox owns bounded
retry and lease behavior. FCM service-account access tokens are short-lived and
held in process memory only.

The mobile routes accept registration, endpoint revocation, and redemption.
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

This change does not connect Host Session lifecycle events to the internal
hint publisher, and it does not add a public hint-submission route. The source
adapter remains an in-process seam for a future owner that can prove the active
Host connection and its Agent/Session relationship. Consequently, a configured
worker can deliver already-enqueued hints, but this package alone does not make
real Host events produce push notifications. No production credentials or
provider sends were used for local tests; real account/provider/device
acceptance remains outstanding.
