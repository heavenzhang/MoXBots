# Updater download recovery — MOXBOTS-UPDATER-RESUME-20261018

## Problem and scope

Installed0.5.9 found stable0.5.11, but the long artifact response ended early. The client discarded incomplete in-memory bytes and displayed only transient generic feedback. Client logs recorded a76% progress checkpoint, subsequent body-read failures and a30s metadata timeout. Read-only server access logs independently showed258,514,944 bytes sent for the294,768,547-byte package, with later requests ending much earlier. Nginx config inspection found no configured download rate limit. Small current HTTP1.1 and HTTP2 ranges both succeeded; these observations do not isolate the failing network hop or establish HTTP2 as the cause.

The fix extends the existing Rust updater owner. No task, Session, Sidecar, runtime, credential, account or install-admission authority changes. Download/retry events never authorize install, stop or restart. The source includes no deployment credential or user data.

## Required behavior

- Preserve a partial file across dropped connections, bounded retries and application restarts; resume only against the same target/version/URL/signature/key identity.
- Validate status, Content-Range, offset, total and response encoding. A server ignoring Range starts from byte0. Inconsistent ranges cannot be appended.
- Stream to disk with bounded connect/header/body-idle waits, no short deadline for the entire large artifact, and up to3 retry attempts with backoff.
- Only a complete package verified with the profile pinned signing key may become pending/ready. Failed verification must not publish installable bytes.
- Project one revision-fenced Rust snapshot into About: checking, byte count, known total/percentage, rate, automatic retry/backoff and persistent failure detail. Unknown total must not invent a percentage. Failed downloads provide an explicit Retry action and retained-byte count.
- The existing explicit restart confirmation and busy/unknown activity checks remain in force. No live application replacement during background preparation.

## Verification ledger

| Layer                            | Status              | Evidence / limitation                                                                                                                                                                                                             |
| -------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original live failure            | Confirmed           | Client unified log + read-only server access log, private sanitized extracts outside Git                                                                                                                                          |
| Transport deterministic loopback | Pending             | Drop/resume, restart recovery,200 fallback, inconsistent Range/416, timeout/retry, signature and path safety                                                                                                                      |
| Renderer automated               | Passed (focused)    | 22 updater/confirmation DOM +15 Settings/Linux cases; one unrelated Settings case initially timed out under load, isolated rerun passed                                                                                           |
| Running UI                       | Passed (root-owned) | 12 actual extracted About JSX synthetic state/layout/keyboard cases at1200×900 and390×844, zero page errors; `qa/results.json` and screenshots. Independent worker could not execute after usage limit; not native IPC acceptance |
| Source integration               | Pending             | Type/lint/build, normal CI and remote main containment                                                                                                                                                                            |
| Native signed package / A-to-B   | Not performed       | Existing unified publisher owns packaging/install; active tasks must not be interrupted                                                                                                                                           |
| Production installation          | Not performed       | Daily app and ongoing work untouched                                                                                                                                                                                              |

## Release request

Deployment required: existing macOS arm64 desktop own-updater channel, next unfrozen release by sole owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`. This development chat does not switch stable, package a replacement production build or restart the daily client. The release must contain the integrated main commit and preserve the pinned key and update activity gates.

Bootstrap limitation: already installed0.5.9 cannot acquire resume capability until a corrected client is installed. The publisher must provide a reliable verified initial package download and defer application replacement until a fresh full activity check proves idle, with compatible backup/rollback. Retry the old client repeatedly is not acceptance of this fix.

Native acceptance must exercise a real signed A-to-B download interruption and resumed Range, app restart with partial bytes, readable progress/error/retry, and a running task remaining untouched while downloading/ready. Explicit install must respect busy/unknown admission. Keep remote Host/model/Windows/native-user-path claims separate from deterministic transport and browser evidence.

## Execution record

Root owns diagnosis, contract, integration, main delivery and release handoff. `download_backend` (requested gpt-6.1-sol/high) implements transport/integrity because incorrect resume can corrupt update bytes; `download_ui` (requested gpt-6-luna/medium) implements existing About flow; `updater_review` (requested gpt-6-luna/medium) independently reviews running synthetic UI. Exact effective model/billing/token usage not exposed; no cost saving claimed. Native-only workflow, no model escalation in this task. Root performs overall source and critical-path acceptance; worker reports alone are not acceptance.

## Review and repair record

Primary review corrected initial implementation defects: stale hydration could race listener installation, no-update result could announce downloading, checking failure could hide retained bytes, signature/range reset needed actual retained-byte refresh, and retrying needed byte count/backoff visibility. Root added accessible progress semantics, removed an empty ready panel, bounded progress refresh for slow streams, distinguished safe network/status causes, and fixed React purity/effect lint findings. All source changes remain under review until final transport/CI gates pass.

Three workers participated with requested settings listed above; their turns hit a runtime usage limit before final acceptance. Root took over remaining implementation, ran actual browser UI checks and inspected desktop/narrow screenshots. Independent UI review is therefore incomplete; source/browser root acceptance is explicitly self-review. No model upgrade or cost saving is claimed; token/billing data unavailable. Parallel implementation shortened the initial code path qualitatively, but handoff and limit recovery added review work. Retain the one-owner state contract and run slow-stream progress tests before future UI handoffs.
