<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/subagent-ui-001-20261018 -->
<!-- git-project-sync-task:base=8e60805e8c19073ba09ac33389a0994482c5c225 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: SUBAGENT-UI-001 聊天内子Agent观察与详情

## Objective

Implement approved in-chat subagent status, current-turn/history list and same-chat right inspector; fix historical Task/Agent input hydration display. Reuse transcript/session owner, native event channels and design tokens. No new model calls or mutation controls.

## Acceptance criteria

- [x] Verify repository/main and isolate task worktree.
- [x] Distinguish live, returned, failed, stopped and unknown facts; no receipt-as-success or fabricated model.
- [x] Preserve historical access, pagination disclosure, per-Tab isolation, To Do and background shell logs.
- [x] Inspector shows assignment/model/progress/report/tools and locates original tool without leaving chat.
- [x] Regression tests, typecheck, scoped lint, build and independent source review.
- [ ] Rendered interaction, responsive and visual acceptance.
- [x] Commit and push reviewed source; draft PR https://github.com/heavenzhang/MoXBots/pull/146 attached.
- [ ] CI, merge main and verify remote containment after rendered acceptance.
- [ ] Queue to sole existing desktop release owner; installed native path remains pending until safely enabled.

## Completed

- Based on main 8e60805e; approved image and original private audit stay outside Git.
- Assigned pure selector/tests to subagent_model; current Agent owns UI/integration and final acceptance.
- Primary implemented UI, Tab-scoped inspector and history input fallback. Same worker independently reviewed UI source; all reported defects repaired and source-rechecked. No external inference calls or measured per-agent cost report available.

## Verification

52 focused regressions pass; scoped lint and Node24 build pass, first and final typechecks pass. Independent source review confirmed repairs. See `dev-docs/subagent-ui/acceptance.md`. Synthetic fixtures only; no real conversation content, credentials or private logs committed.

## Blockers and unknowns

Rendered UI gate is open: local browser is disabled by Work settings. User asked where to enable it; official documentation guidance supplied, awaiting permission restoration. No alternative browser bypass.

Native package/release handled through established sole publisher, no concurrent deployment or daily App restart. Current source task does not broaden permissions.

## Next step

Remote handoff gate passed with clean worktree; draft PR146 retains open UI gate. Main advanced independently after base; fetch/integrate latest main before ready/merge. Resume actual rendered and full Chat acceptance after local browser is enabled, then CI/main and sole publisher queue.
