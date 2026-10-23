# MB-SESSION-OUTPUT-20261024-02

## Findings and fixes

The two screenshots do not establish one unique historical cause.

- Both bridge stream owners previously returned from `pull()` after a single
  upstream chunk. Comments/partial SSE records produce no downstream data; enough
  such chunks can strand the consumer with no active body read. Controlled probes
  reproduced 10 stalls in 24 original cases and zero in 24 fixed cases. Historical
  raw chunks are absent, so this proves a defect, not the original unique trigger.
  Each pull now drains until data, terminal, EOF, cancellation or the existing
  idle timeout. Context recovery also uses the existing body watchdog.
- The 2026-10-24 00:51 incident had repeated `ECONNRESET` before response headers,
  mapped to HTTP 502. Primary retries actually ran at 00:51:53, 00:52:24, 00:53:24
  and 00:55:24. Explicit Stop at 00:59:20 ended the wait. Backup tier policy is
  retained. Separate renderer recovery/SDK state prevents transient receipts from
  erasing recovery; the server clears it explicitly with `{ recovery: null }`.
  The fixed composer shows the countdown even above old history, reconnecting at
  the deadline and the original Stop callback. Paused state keeps drafts sendable.
- Positive output tokens previously let thinking-only completed turns bypass the
  empty-result guard. Tokens no longer prove a visible answer. Text/tool-only
  results, compact control success, coalesced task receipts and explicit Stop
  retain their semantics. Empty success surfaces the existing error without
  automatically replaying a potentially unsafe task. This independent defect
  does not reclassify the historical Stop as a successful empty response.

Original Sessions, provider configuration and uncertain action ledgers remain
untouched. Three previously authorized minimal paid probes succeeded and their
budget is exhausted. This fix makes no additional paid model requests.

## Local evidence

- Focused stream/recovery/outcome/lifecycle/renderer suite: 374 passed, including
  snapshot restoration and all 124 activity tests. TypeScript
  no-emit, targeted ESLint and whitespace checks passed.
- `node --import tsx scripts/verify-model-recovery-loopback.ts --fragmented-sse`
  passed with SDK 0.3.296/native 2.1.296 and Node 24.20.0. Local synthetic suppliers,
  isolated HOME, real SDK/MCP counter; comments and timed 31-byte fragments cross
  both owners. Primary outage, original Session continuation and Query restart
  complete; counter remains 1, duplicate action attempts denied twice. Existing
  fixture clock compresses waits while recording policy delays; this is not a
  30-minute wall-clock soak. Private journal writer is not production SessionStore
  evidence and synthetic availability is not real-provider availability.
- `fixture.html` renders production MessageList/SimpleChatInput with synthetic
  state and zero model/business calls. Primary executed upper-history scrolling,
  live countdown, reconnecting, Stop once, preserved/sendable paused draft and
  completion cleanup. IAB viewport 1280x720, content widths 1280 and 380, dark/light
  passed with no clipping. Independent worker reviewed source and two screenshots
  without blockers; its own browser interaction was unavailable (IAB is available
  only to the primary), so those actions are primary-owned evidence. Screenshots
  are private task artifacts `ui-upper-history-dark.png` / `ui-narrow-light.png`.
  Run loopback Vite with no API proxy; URL is
  `/@fs/<checkout>/dev-docs/session-stall/fixture.html`.
- Additional 54 recovery/continuation tests passed. Real SDK
  `verify-stream-continuation-loopback.ts --stop` passed: upstream calls remain 2
  after Stop, counter 1, one replay rejected. This is isolated fixture evidence.

## Delivery gates

- [x] Isolated changes, primary review and local tests/native SDK fault injection.
- [x] Renderer visual/interaction/narrow-layout acceptance; independent source/
  screenshot review, primary-owned interaction because worker IAB unavailable.
- [ ] Existing owner coordinates shared CI and exact remote-main integration.
- [ ] Owner assigns next unfrozen desktop batch and signs/publishes it.
- [ ] Installed source/version/digest and native recovery/Stop paths accepted.

Desktop+Sidecar remains one deployment unit, sole CI/version/build/install/release/
rollback owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Source/integration owner:
`01a16933-d3bd-7593-9d06-65a7c5e33d2f`. Frozen 0.5.20 must not be overwritten or
relabeled to include this task. Installed 0.5.19/build519.2 was observed before
handoff; subsequent maintenance belongs to the publisher. Linux/cloud rollout
is outside scope. Native acceptance must cover fragmented completion, primary
wait/unavailable backup, Stop with no later request, restored waiting/paused,
normal text and thinking-only error, using isolated fixtures and preserving live
user work and uncertain ledgers. Paid-provider checks need separate valid budget.

Source HEAD `3b1417f24eb50962cbbf283405c131f060598372` was pushed and passed the
remote handoff gate. Exact CI/main/next-batch intake was sent to the publisher;
acknowledgment and all release gates remain pending. The user then explicitly
chose to preserve active work and defer maintenance in that publisher's chat.
Read-only installed metadata still says 0.5.19/build519.2; there is no new artifact
or digest for this task. Documentation receipts do not change tested source bytes.

## Execution record

Primary owns recovery UI and overall acceptance. One bounded native worker,
requested `gpt-6-luna`/`medium`, implemented SSE/outcome fixes; primary reviewed and
cherry-picked them. Native-only ai-yaoren-local; no external-model calls. Worker
reported 114 stream tests and 87 outcome/lifecycle tests before primary integrated
verification. Exact model accounting, token cost and savings are unknown.
