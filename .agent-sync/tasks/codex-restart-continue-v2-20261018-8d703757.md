<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/restart-continue-v2-20261018 -->
<!-- git-project-sync-task:base=7c2aac52b5c41f3e903b2930dfc7ccfacf904fac -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-RESTART-CONTINUE-20261018

## Objective

MOXBOTS-RESTART-CONTINUE-20261018: after the separately authorized actual0.5.11 upgrade, expose an explicit ▶ continuation for conversations with durable unfinished-turn evidence. Preserve the original Session, context, completed work and composer draft; no automatic resubmission on startup. Existing paused Goal resume keeps its own owner; scheduled new-session Task restart is not mislabeled as conversation continuation.

## Acceptance / To Do

- [x] Actual signed0.5.11 installed and launched after backup; this is distinct from PR141 updater fix/native acceptance.
- [x] Map transcript/Goal/Task authority and existing navigation/send paths.
- [x] Derive display-only continuation from canonical V2 turn/root input; cold interrupted history stays identifiable and completed/newer turns clear it.
- [x] Sidebar ▶ creates an ephemeral exact-Tab/turn request, not a saved auto-send; Chat rechecks ready/idle/current identity and uses original Session send or paused Goal resume.
- [x] Clear no draft, do not rewind/resend old input/create a new Session; reject stale/double-click intents and busy/pending approval states.
- [x] Unit/DOM/store integration, typecheck/lint/server build and test classification pass; actual isolated browser at1100/800 content widths plus independent screenshot/source review.
- [ ] Normal PR/CI, latest-main delivery, release-owner queue and signed-native acceptance as separate states.

## Work ownership

Primary: shared continuation/metadata, Chat, Banner, wire and final integration. Worker update_stop_review: Sidebar/App/exact-Tab transient handoff/tests. Worker toast_cleanup: independent review, then exclusive server admission/queue tests. Primary reviewed server changes; non-implementer reviewed Sidebar source/DOM and Banner screenshots. No overlapping writers. Primary owns integration/main. New native release and actual user model execution remain separate; daily app not used as a development test target.

## Dependencies

Base7c2aac52. PR141 stop-update terminal fix is a separate predecessor still in CI; initial attempted task-init from its unmerged head was correctly refused, so this task starts from current canonical main without rewriting the prior branch.

## Next step

Finish stable typecheck/build, commit and synchronize latest main before normal PR/CI. Unified release owner is aggregating PR141 through PR143; continuation remains independently reviewed and queued, not silently added to the frozen candidate. Evidence under `/tmp/mox-restart-continue-*`, native backup/receipt in project pointer `work/update-stop-native-20261018` (private0700).

## Implementation and bounded acceptance

- Canonical V2 metadata exposes only latest unfinished root/turn. Successful/newer turns clear it; cold transcript activation marks prior running work interrupted. Display metadata grants no execution authority.
- Sidebar opens original Session through the existing owner. Intent is ephemeral and bound to captured Tab epoch/request/turn, excluded from restored persistence. Chat checks hydration, idle, approvals, question drafts, task queue and update checkpoint; original composer draft is preserved.
- Builtin continuation uses a server condition checked before/after async preparation, at queue promotion and synchronously before canonical commit. Cross-client new work/completion and duplicate clicks reject without another canonical input or SDK dispatch. Existing paused Goal uses its resume owner. External/integrated runtime generic continuation is deliberately unavailable until it supports the atomic guard; manual conversation remains available.
- Focused tests: server unit149 + real builtin queue/mockSDK integration3; store26; Sidebar79; Banner/shared15; exact-Tab App2; persistence37; restored tab7; original-Session wire1. Full App helper suite has a separately reproduced pre-existing tool-market mock failure; continuation-focused tests pass.
- Primary IAB actual component interaction passed at1100/800 content widths: no auto-start; click admits once; draft/Session retained; busy disabled; complete hidden. Non-implementer independently reviewed screenshots and existing source/DOM. Synthetic preview is not native/model/business acceptance. Private preview sources/screenshots retained only under project pointer work/restart-continue-20261018/qa, outside production source.
- Native daily app remains the separately installed signed0.5.11; this feature is not installed. Signed candidate/native restart-and-continue acceptance belongs to unified release owner after main delivery. No real business operation was used as a test.
