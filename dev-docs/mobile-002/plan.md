# MOXBOTS-MOBILE-002 execution plan

2026-10-18. Full target: internal daily-use iPhone + Android companion using existing Host/SessionEngine, not a WebView mock or a second executor. Design baseline is acceptedV6: one header, one-line resting composer, secondary model/suggestions in plus menu. Local design source: MoxBot/output/mobile-prototype/MOXBOTS-MOBILE-001 (outside product Git).

## Architecture and interfaces

- Native UI React Native/TypeScript/Expo custom dev build; no runtime fake success or mock-data fallback.
- `mobile/core` proposed independent Rust client crate reuses actual shared crypto/protocol and device channel; native binding holds secrets, JS receives typed projections/intents only. No desktop Tauri or Host daemon dependency.
- `mobile/app` proposed isolated Expo package. Its platform binding module is primary-owned; UI consumes a small typed adapter.
- Existing remote-session v1 remains intact. New mobile capabilities are versioned closed extensions, original Host/session owner validates target/user/generation, mutation UUID persists before effects; unknown delivery is queried, never silently replayed.
- Attachments have a separate bounded binary/chunk data plane, scoped IDs and staging admission before send. Session, paths and model defaults remain target-authorized.
- Background push is minimal event metadata; opening always re-authenticates and refreshes snapshot before approval. Mobile socket is foreground observation, not execution ownership.

## Acceptance matrix (all gates independent)

| Gate | Required evidence | State |
|---|---|---|
| Portable SDK | Existing-peer encrypted interoperability, target/scope/replay failures; iOS+Android native libraries | open |
| Original Host execution | Actual existing Host create/send/receipt/approval/stop with persisted original session and no duplicate dispatch | open |
| Mobile UI | Accepted representative actual page, then critical journeys; independent UI owner assigned when running revision ready | open |
| Background/recovery | iPhone+Android foreground/background/locked/cold start; refresh then exact request approval, other-end resolution, revoke | open |
| Attachments | Real supported file/image bytes into original Host, scoped preview/download and meaningful failure/resume | open |
| Speech | Native capture + real ASR + editable draft + same-session send/voice continuation, permissions and errors | open |
| Internal distribution | Identified signed iOS/Android artifact, source provenance, installed native and daily-use paths | open |
| Main delivery | Current main, required CI/review, remote SHA/ancestry; no force push | open |

## Ready work and dependencies

1. Portable SDK isolation and fixture interoperability; no UI/native build dependency.
2. Representative native session UI and typed port; actual adapter completion depends on SDK and primary native binding.
3. Primary: native toolchains + account bridge + shared protocol/Host extensions. Notification provider/device setup and iOS signing remain external prerequisites while code progresses.
4. After one page acceptance, extend core daily-use pages and recovery workflows; then independent integration/native acceptance.

## Execution ledger

| Package / owner | State | Evidence | Requested model / effort | Usage |
|---|---|---|---|---|
| SDK audit / mobile_sdk_audit | accepted read-only | precise source entry points in primary task context | gpt-6-luna / medium | unknown |
| Host I/O audit / mobile_host_io_audit | accepted read-only | actual attachment/ASR gaps and existing owners | gpt-6-luna / medium | unknown |
| Integration / primary | active | newbranch5f9df604; project-sync gates | inherited runtime, no switch claimed | unknown |

No cost savings or runtime model confirmation inferred from requested settings. Evidence logs/build outputs stay outside Git unless bounded/redacted. No production or daily client writes from subagents.

## 2026-10-18 implementation wave

- Root integrated portable SDK commits `f7d36a40`, `043bcfc1`, `d9c48fa1`, `a120276d` into the task branch, plus feature-gated shared crypto native-store adapter. Shared original JWT/TLS/channel code remains authoritative. Worker reported 27 tests, strict clippy and macOS release; primary reruns focused tests independently. Actual iOS SDK crosscheck failed before Xcode installation; no dual-platform claim.
- Native Swift Keychain and Android Keystore AEAD record stores and connection C/JNI bindings are root-owned under `mobile/app/modules/moxbots-remote/`. Swift secure store + C header wrapper typecheck passed using the macOS SDK; this is not an iOS build or Keychain runtime acceptance.
- Account/relay runtime worker `mobile_connection_impl` (requested gpt-6.1-sol / medium) reuses existing login, identity, HTTP/WSS and device admission. Primary review found login intent name mismatch, missing pending-operations projection, target runtime metadata mismatch and identity-store overwrite semantics; repairs are required before acceptance.
- UI worker `mobile_app_impl` (requested gpt-6-luna / medium) owns Expo58 application, strict typed port and explicit web-only QA fixture. Primary first rendered review rejected two chat toolbars and tall composer. Implementation reports V6 density repair; independent owner `mobile_ui_acceptance` (requested gpt-6-luna / medium) found a startup initialization-order failure. UI remains unaccepted pending repairs and actual retest.
- User authorized reusing the existing developer account and installing necessary tools, including acceptance of the Android SDK license. Android SDK/NDK/emulator download is ongoing. Xcode is visibly downloading from the official App Store; installed signing, simulator and native build gates remain open. Developer ID identity alone was not counted as an iOS provisioning identity.
- Public existing AgentNet descriptor read succeeded over ordinary verified TLS at `https://140.143.183.232/api/agent-network/instance`; profile and issuer match existing desktop default. This is discovery only, not authenticated login, Host execution or notification acceptance.

### Representative UI gate

Baseline: accepted V6 `MoxBot/output/mobile-prototype/MOXBOTS-MOBILE-001/qa-v6/06-after-current.png`. Native target widths390/360; current browser fixture is partial evidence, never native keyboard/inset proof. One compact toolbar; one-line resting composer with real mic icon; central transcript priority. Critical journeys: Bot selection/list/new/send/continue/back-draft, query unknown receipt without resending, refresh exact approval, plus/result/detail cancel/back. Visual, interaction and responsive checks remain separate. First actual page must pass before repeated full account/settings/file page patterns are expanded.

### Native build checkpoint

Primary core27/connection66 test reruns passed. Actual Android arm64 core release9m17s, connection release10m14s; aligned-verifier connection rebuild33.85s. JNI initially failed because Android and macOS JNI attach signatures differ; the target-specific signature fix then compiled and linked successfully using the actual Android NDK. These timings are observed wall times, not model usage/cost savings. Dedicated Android AVD created and booting; complete Expo APK Gradle build is in progress. Mac locked during App Store readback, manual unlock requested. Current independent UI retest is blocked by IAB availability and locking; no current UI gate is inferred from source checks.
