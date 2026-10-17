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

### Integration checkpoint: original owner and native validation

- Root integrated the single retained encrypted session/assets owner (`34e6861c`), exact shared cursor parity, and native file/image pickers (`4e34f834`). Actual connection suite:72 passed; actual Android arm64 connection library rebuild passed in44.23s. No authenticated live relay or Host execution inferred.
- AssetStore10 tests and strict clippy passed in the primary worktree, including repeated artifact registration by authenticated scope + session + bytes. Desktop asset adapter uses original Global identity and Session artifact metadata; internal resolve route requires the existing internal token and bounded input/output. Primary TypeScript artifact-owner tests:3 passed; complete Rust desktop check stopped in the existing apple-cf/apple-metal Swift PackageDescription linker before checking this adapter. Rust compile gate stays open.
- Existing Linux headless connector forwards closed management requests into the Node owner and does not yet implement assets/mobile admission. Windows asset private ACL provisioning is also open; existing remote sessions remain unchanged. Do not advertise attachment support for those paths.
- Full Xcode27.1 is now installed, but its new Apple SDK license remains pending explicit acceptance. Per-command CLT selection permits ordinary Git and Android work. No iOS build/signing/provisioning result yet. Android SDK37, NDK27.1, JDK21 and the dedicated Android36 arm64 AVD are installed. Real Gradle compilation found an unavailable public Android SDK O_DIRECTORY constant; fixed using O_NOFOLLOW + fstat/S_ISDIR before directory fsync, with APK rebuild underway.
- Primary actual browser checks: V6 input expands for4lines and shrinks to48px for1line/empty; stale approval refreshes without submitting; rejected approval returns a receipt; reboot-unknown operation queries to not-found without resending. Evidence under `/tmp/moxbots-mobile-ui-review-002/`. This remains explicit synthetic web QA, not native acceptance.
- Actual all-offline page disables send correctly. Root found the new-chat empty state omitted the offline reason; UI owner is correcting that existing message without adding permanent chat chrome. Hidden measuring text no longer appears in the current accessibility tree.
- Active bounded packages: SDK versioned mobile DTO/journal; connection stable target identity + native encrypted CAS drafts; UI owner-scoped draft persistence. Root owns native platform integration and original Host admission. Push provider/registration, actual ASR, native upload/download scheduler and real-device/internal signed distribution remain open.

### Native APK and original mobile admission checkpoint

- First complete Android debug APK built in6m41s and installed on dedicated `emulator-5554`; package `com.moxbots.mobileinternal`, version0.1.0/code1, minSdk24/targetSdk36, arm64. This is a debug test artifact, not signed daily-use distribution or a native UI journey acceptance.
- Actual Android instrumentation initially exposed an absolute build-machine DT_NEEDED path and then a missing imported Rust library in the test APK. Fixed CMake imported-library metadata, explicit instrumentation packaging and native SONAME. Rust/JNI ELF load segments now align16KiB. Four real Android tests then passed (Keystore encryption/isolation/bounds, JNI creation/account signed-out, MediaStore image import/hash/chunk/scope/removal, invalid imports). APK rebuilt in14s and reinstalled. These passes precede the next scheduler integration and do not validate its new code.
- Root integrated versioned mobile DTO/core (`1618ca0e`), stable encrypted drafts (`cf20e4a9`,`1aef3c2e`), UI persistence (`2ef35bc3`,`b3191722`), retained mobile wrapper (`336cc743`) and Desktop owner (`73827489`). Protocol-specific pending queries keep one128-operation journal. Native upload scheduler (`71e37920`) is under repair after its first actual Kotlin build found projection/nullability errors; no scheduler acceptance claimed.
- Primary native-source tests: core41 including the exact shared desktop retention policy and its transport-close ownership test; strict core clippy passed. Primary TypeScript admission/ledger/artifact tests27 plus3 new streamed UTF-8 boundary/failure tests, and12 legacy desktop/projection/failure tests passed. Full TypeScript and focused lint passed. Tests use controlled temporary files and/or mocked execution; no real model or authenticated Host execution inferred.
- New native desktop target acquires verified ready leases and original Session lifecycle ownership, performs Global preparation, then hands metadata to the same SessionEngine. The internal token route streams a96KiB local envelope; remote mobile DTO and response remain48KiB. Node verifies all assets with bounded streaming before any product copy, then materializes one file at a time into original attachment refs/workspace references.
- Independent source review found session-wide Running could falsely settle an unrelated operation's unconfirmed receipt. New mobile target now settles only its own accepted/rejected receipt. Transport/account observer lifetime deliberately cannot destroy a potentially configuring original Session: a local receipt-only observer holds the bounded shared permit until exact evidence, Session exit or1h expiry. It issues no further remote mutation. Real logout/resource-lifetime behavior remains a native/Host acceptance item; do not infer it from source review.
- Primary browser QA now proves back/reopen and full reload persistence, online/offline Bot draft isolation, corrected offline guidance, and accessible Bot/session buttons. Browser drafts explicitly say simulated storage. Screenshot `primary-draft-reload-pass.png` under the existing external evidence directory. This does not validate OS-store draft restoration after a real mobile process restart.
- Independent Linux read-only audit confirms split UIDs prevent directly sharing Desktop lease paths. Minimum remaining bridge: authenticated existing Unix IPC with24KiB raw blocks, owner-generated opaque artifact/source IDs and exact agent/session/generation checks; preserve private modes and Rust Store quotas/unknown recovery. No headless code or service was changed by that audit. Push credentials/provider/device tests, iOS license/build, preview/download, full account/settings routes and main/internal distribution remain open.

### Upload repair and continuation checkpoint

- Actual connection test rerun:86 passed (`/tmp/moxbots-mobile-mobile-wrapper-primary-test.log`). Android arm64 Rust native connection including the negotiated mobile wrapper rebuilt in20.59s (`/tmp/moxbots-mobile-native-mobile-wrapper-build.log`). Its generated native provenance identifies source089281ce, clean input, sourceDigest41734505685a1e521536e8b91a7aec30b28921f993b90acc4d42f7145f1a2531 and library SHA256dc275bb86cd5c5c2f464899b74c24c3e8a5297f070a44b637243e462a8d172a7. Generated binaries/provenance stay outside Git.
- Native scheduler repair was integrated and actually compiled in Android after two Kotlin nullability repairs.16 emulator instrumentation cases executed:14 passed and2 failed (`/tmp/moxbots-mobile-upload-native-repair2-instrumentation.log`). Failures are explicit-resume expectation and target-loss/cancel scheduling; original native owner is repairing them before new artifact work. Do not count the scheduler gate as passed.
- Primary review of new UI mobile package found outer native error codes lost, failed-send journal recovery allowing a duplicate operation, and upload queue releasing before the real terminal event. Original UI owner is repairing all three with asynchronous regression tests; worker test reports await primary integration/retest.
- Linux bridge implementation is isolated under the original audit owner. Public session.assets.v1/session.mobile.v1 remain unchanged; any closed byte-transfer extension is internal to the authenticated Unix socket. Native result download/cache/OS preview/share is a separate bounded package under the native owner after its upload repairs.
- Current origin/main re-fetched at400b746a (desktop0.5.10 release preparation). It remains outside the integration tree pending normal merge and affected checks. No desktop/service restart or deployment occurred.
