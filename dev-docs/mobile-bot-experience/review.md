# MOBILE-BOT-IMPLEMENT-20261101 · Independent UI acceptance

Final reviewer status: **PASS for the executed local fixture UI scope after one behavioral repair round; no remaining required finding in that scope.** UI-01 is CLOSED by independent rendered retest. Visual and responsive checks passed at 390×844 / 320×740; interaction checks passed for the journeys below. Physical/native keyboard, authenticated Host/backend, production, signing and installation remain UNVERIFIED. The primary owns final integration/release acceptance. Final card `deviceName` label is a later presentation-only change reserved for primary screenshot verification.

Reviewer: `/root/review`; requested model/effort `gpt-6.1-sol/high` for cross-owner state and continuity risk. Runtime model/effort and token/cost data are not exposed to this reviewer. No subdelegation. Product-source edits, CI, Git mutations, production and external messages are excluded.

Baseline: approved `output/mobile-grok-concept/v8` README/alignment and this task plan, inspected 2026-11-01. V8 defines Bot → many sessions, task-first recent work, original session instructions, unchanged past deliverables, action-specific approvals and genuine versions. V8 is a simulated design reference; its hardcoded Bots and synthetic versions are not implementation requirements.

## Journey contract

All rendered cases target 390×844 and 320×740, signed-in synthetic fixture identity, actual Expo app. Native phone keyboard, authenticated Host integration, production and signing/release remain separate gates.

| ID | Route/start and actions | Required observable result | Owner | Evidence/status |
|---|---|---|---|---|
| R1 | Home with >1 authorized Bot; locate most recent work; filter then return | Recent work appears across real authorized catalog; row identifies original Bot/device; filtering never retargets a session; unavailable catalog explicit | root | Pending implementation/UI |
| R2 | Home → Bot profile → prior session; zero-session Bot | Stable identity and original workspace/runtime context; recent work usable; empty state allows intentional new conversation, no forced main chat | root | Pending implementation/UI |
| R3 | Session A draft → list/Bot B → return A; artifact return | Draft remains scoped to account + target identity + session; original session and runtime restored; no draft bleed | root | Existing persistence/owner source inspected; UI pending |
| R4 | Running session → add instruction → receipt delay/error → refresh | Existing send path retains session/owner; no duplicate resend of unknown operation; accepted receipt means reception; input typed during flight survives old receipt | root | Potential race communicated; final source/UI pending |
| R5 | Current permission/plan/question → submit → execution/output | Action-specific details and stale-scope guard; submitted/approved distinct from executed/completed; failure retains next action | root | Existing scope refresh source inspected; UI pending |
| R6 | Existing deliverables → new message → artifacts → old/current versions → back | Multiple genuine files remain visible; genuine immutable identity/digest kept; no fake numbered versions; source session/Bot and return context preserved | artifact worker/root | Pending implementation/UI |
| R7 | 320px long realistic names/title/content; keyboard focus; menus/sheets/back | No clipped primary controls or horizontal overflow; composer and results scroll; overlays dismiss; back restores context; keyboard gate distinguishes web focus from physical keyboard | root/reviewer | Pending UI; physical keyboard unverified |
| R8 | Catalog/session/artifact failure, offline Bot, stale/unknown receipt | Honest loading/empty/error state, usable retry/lookup and retained context; no client execution-success inference | root/artifact worker | Pending implementation/UI |

## Source orientation and open observations

Baseline HEAD `3b62a664ff1d33282592dddf6da2a38045264787`, origin `https://github.com/heavenzhang/MoXBots.git`, task branch as plan. Worktree shared by bounded exclusive file ownership; reviewer writes only this file and own evidence.

- Existing `moveOwner` flushes/deactivates old draft owner and uses stable target/session draft keys; `loadSessions` and `openSnapshot` guard original view owner. These observations are source evidence only.
- Original `sendMobile` accepted path clears draft unconditionally after response. If composer remains editable while sending, later typing can be cleared by an earlier receipt. Reported to implementation owner before final review; verify against final implementation.
- Existing artifact return intent checks principal, stable target identity and exact agent/session; review integration after worker changes.
- Home currently loads one selected Bot. Cross-Bot recency is implementation work in progress, not a final defect yet.

## Findings

No final finding issued yet. Final actual page revision, URL, case evidence, expected/actual behavior, fixes and retest results will be appended after browser handoff. Visual, interaction and responsive acceptance are UNVERIFIED. Native/Host and production acceptance are UNVERIFIED and outside this reviewer fixture scope.

### Pre-UI implementation observations (not final acceptance)

- DRAFT-INFLIGHT: `index.tsx` original accepted-send paths call `saveDraft('')` while composer permits editing; implementation owner notified. Required reproduction is delayed receipt, type next instruction, observe retained text after receipt. Applies to mobile and legacy sends and new-session transition.
- ARTIFACT-SOURCE-HISTORY: newly added store history pages still need actual resolver failure coverage. `src/server/remote-session/assets.ts:246` resolves all source files before a successful owner page; `resolveSource` rejects missing/changed source. Adapters must distinguish successful owner authorization with unavailable old source from authorization failure, otherwise previously retained immutable history remains inaccessible. Store tests that pass a synthetic empty owner page do not exercise this seam. Owner notified; implementation in progress.
- ARTIFACT-RETENTION: existing `mobile/asset-store/src/lib.rs` cleanup selected 24h TTL for ready output bytes. No runtime cleanup invocation established by this review; do not claim actual automatic deletion occurred. Persistent-output requirement needs explicit retention contract and regression of previously registered outputs after upload cleanup.

### Source repair review, 2026-11-01

- Artifact source/history and retention concerns addressed in inspected source: `assets.ts` retains original metadata/visibility/workspace authorization, skips only explicitly missing checked sources, and rejects symlink components (including dangling parent). Rust adapters still call original owner before exact-scope history. `lib.rs:1053` exempts session-bound Ready outputs from temporary TTL. Integration test source now covers missing sources, cursor gaps, hidden-session rejection and dangling leaf/parent symlinks. Worker-reported test runs are recorded in `artifacts.md`; reviewer has read the actual changes and tests, not independently rerun those commands.
- Honest artifact boundary accepted at source: only genuine previously registered bytes are retained, full ID/SHA remain inspectable, no V1/V2 chronology inferred, quotas remain explicit. Never captured overwritten bytes cannot be recovered; this is documented.
- Draft submission source now captures editRevision/accountGeneration and clears only exact submitted text/revision. Approval fresh-check uses immediate ref single-flight plus busy state. Runtime interaction remains pending.
- NEW-BOT-SCOPE: found top-right New action previously ignored visible Bot filter and used old selected target. Owner reports repaired by exact filtered Bot or explicit picker for multiple Bots; final rendered retest pending.

### First actual page inspection — invalidated by concurrent main integration

Environment `http://localhost:4397/`, actual Expo source preview, explicit synthetic-data banner, reviewer-owned IAB tab 1 (parent IAB tab IDs are scoped to its runtime). Initial width 390×844. Parent paused UI review after discovering concurrent PR218/main changes; all observations below are preliminary and require rerun against the final merged revision.

- Cross-Bot recent-work cards rendered correctly, including identical session IDs in two Bots. Bot name and action were visible; no observed clipping at this size. `evidence/review-home-390.png`.
- Filter second Bot → top-right New correctly opened a new conversation labeled second Bot. This reproduces the source repair to NEW-BOT-SCOPE. `evidence/review-filtered-new-bot-390.png`.
- Same new-conversation screen unexpectedly showed a local draft restore failure without fault injection. Could be fixture support/schema mismatch; not yet classified as product defect. No credentials/real backend were used.
- 320px, artifact return, running-send, approval and failure cases were NOT YET EXECUTED when pause arrived. No UI acceptance is claimed.

Upstream integration guidance delivered: keep the existing `SubmittedDraft`, owner-epoch capture, durable `persistSubmitted`, revision/write-ID `capturePending`, and centralized `settleSubmitted` semantics. For a newly started session, carry only genuinely later edits; processing receipt must not copy the still-retained but hidden submitted edit into the new session draft.

## Integrated actual UI review — 7bf8f0aca27ea62ab6867e7014f2ceac1576381a

Environment: `http://localhost:4397/`, actual Expo SDK58 app after server restart/clear, synthetic account/data explicitly marked; reviewer IAB tab1, exclusive browser ownership. Viewports 390×844 and 320×740. Production, authenticated Host/native, physical keyboard and accessibility certification are not inferred from these checks.

| Journey | Executed checks and result | Evidence |
|---|---|---|
| Home / Bot owner | 390 cross-Bot cards, second-Bot filter and running session; back retained second-Bot filter. Account remains visible. PASS | review-final-home-filter-390.png |
| Draft continuity | Second-Bot session draft written, list/back restores exact text, no previous draft error after main integration. PASS | artifact return screenshot also shows preserved prefix |
| Bot profile | 320 Bots tab → profile sheet → sessions: readable identity/device/runtime, actions fit, return selected proper Bot scope. PASS | review-final-bot-profile-320.png |
| Artifact continuity | 320 load second file, expand full ID/hash (wraps), explicit Continue Editing returned to same second Bot/session, appended reference after existing draft; no automatic send. Then submit while running and reopen/paginate artifacts: old files still there. PASS in fixture | review-final-artifacts-320.png; review-final-artifact-return-320.png |
| Approval | 320 permission Allow Once displays decision received/syncing execution, no completion claim. Stale approval refresh blocks submission with explicit updated-request notice. PASS | review-final-approval-receipt-320.png; review-final-stale-approval-320.png |
| Unknown receipt | 390 send → preserved original in pending card, disabled composer/send, Query Status leaves unknown pending without duplicate transcript. PASS in fixture | review-final-unknown-receipt-390.png |
| Disconnect recovery | 320 send → processing/retained original + status action → Query → accepted, pending clears and input is editable in same session. PASS in fixture | review-final-disconnect-recovered-320.png |
| First message rejected | 390 new conversation → send → processing/materialized session → Query → rejected: notice says original retained but original card removed and composer empty. FAIL, reported below | review-defect-first-rejection-empty-draft-390.png |
| Layout / focus | Both widths actual screenshots; 320 multiline composer, full artifact hash/ID, approval card, profile sheet and bottom nav usable. Web input focus exercised. PASS for inspected layouts; physical native keyboard UNVERIFIED | screenshots above |

### Required finding UI-01 · First-message rejection strands the original draft

Priority P2; implementation owner root; status CLOSED after the repair/retest recorded below. Initially found Route `/`, synthetic account, 390×844, revision 7bf8f0aca.

Reproduction: choose `提交后拒绝`; click top New; type `首发拒绝后保留这段修改要求。`; Send (processing creates concrete session and shows pending original); click Query Status. Expected: when definite rejection is known, original can be inspected/edited/retried in the current original Bot/session without hunting another draft. Actual: notice says `消息未被接收，原文已保留，可检查后重新发送。` but pending card disappears and composer is empty.

Source seam: `index.tsx:902` materializes start session, `:1285` queries/settles pending, `:1338` rejected copy. Original token remains keyed to null-session draft, while visible owner is the materialized session. This is a continuity failure, not evidence of native storage deletion. Avoid copying the hidden pending original as new input while processing; restore or expose it only after definite rejection and preserve any genuinely newer draft.

Current gate: visual/responsive PASS for executed cases; interaction FAIL until UI-01 repair is independently rerun. Native/Host/release remain UNVERIFIED. No final overall UI acceptance yet.

## Final repair acceptance

Source: base HEAD `7bf8f0aca27ea62ab6867e7014f2ceac1576381a` plus root working-tree repair, served only after explicit server clear/restart (parent session81652). SHA-256 of inspected behavior files at handoff:

- `mobile/app/src/app/index.tsx`: `fb40a0645b91651a7f466abd8142a51f6cfe0ae85b5a2b9ccb1c6c8cc622d129`
- `mobile/app/src/deliveryPolicy.ts`: `b0e03ef246d824c529e5c3913662e82b1634f1d6a916ffd3e6c92d0764de829c`
- `mobile/app/src/approvalFlight.ts`: `2386c4e32a8bc3071ae0e897ea57ac0006e6dbcc7b925ec68dd1c293e543ee29`

UI-01 retest PASS at 390: repeated new-session processing→definite rejection. Current materialized-session input visibly contains both `较新的补充要求不能被覆盖。` and `确定拒绝后找回的唯一原文。`, separated by a blank line. The input is editable and Send enabled; no automatic resend occurred. Earlier prototype failure screenshot retained as provenance, not as current behavior. Evidence: `review-repair-first-rejection-restored-390.png`.

Affected nearby states:

- 320 processing start: submitted original appeared in the actual fixture transcript; the composer stayed empty instead of receiving the old submitted text. Receipt settled and later editing remained usable. `review-repair-processing-320.png`. This rapid fixture did not provide controlled timing to claim an in-flight edit race was independently reproduced; submission-token/revision safety is additionally covered by inspected source and primary regression tests.
- 320 approval Allow Once again produced only `决定已接收，正在同步后续执行状态。`; source uses `ApprovalFlights` keyed by stable target identity/agent/session/generation/turn/request, so navigation does not unlock an in-flight same request. Source inspected; adversarial delayed double-click/navigation timing was not independently injected.
- 320 disconnect send again showed preserved original and disabled send, Query settled the receipt, pending card disappeared, and input became editable within the same original session. `review-repair-disconnect-recovered-320.png`.

No remaining observed defect in these executed fixture journeys. The initially observed second-Bot draft-read error disappeared after integration with current main and was not reproducible in the final cross-Bot draft/artifact journey. Earlier interrupted UI evidence is superseded.

Browser returned to primary: reviewer temporary tab closed, viewport override reset. Reviewer changed only this review file and own screenshot evidence. No product-source edits, CI, Git mutations, release or production activity.

Review execution record: source criteria prepared while implementation ran; meaningful concerns covered late draft receipts, exact Bot New scope, immutable history/TTL/source errors, approval single-flight and new-session rejected draft. Source concerns were reviewed with the owning implementers; one final rendered behavioral finding led to one repair/retest round. Requested `gpt-6.1-sol/high`; actual runtime model/effort, token usage and cost are unknown. No external model or additional reviewer agent was called. For similar work, include a first-message processing→rejected case before the first representative-page freeze to catch draft-owner transitions earlier.
