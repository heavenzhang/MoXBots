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
