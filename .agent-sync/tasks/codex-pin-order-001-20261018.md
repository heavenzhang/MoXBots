# MOXBOTS-PIN-001 — 置顶后侧栏立即上移

- Goal: fix saved sidebar drag order overriding canonical pin priority.
- Repo: https://github.com/heavenzhang/MoXBots.git; main; base ffaf0005aedf88df49e127781020948bdb8cebe1.
- Branch: codex/pin-order-001-20261018. Owner: current primary, single agent, zero workers; UI acceptance owned by primary (small focused sorting repair).
- Scope: existing sidebar ordering projection; preserve Session/config persistence owners and saved placements/manual order. Workspace/root/custom section rendering and drag source must agree.
- Criteria: newest pins precede unpinned entries even with saved drag order/new arrivals; unpin restores saved ordering; refresh/remount preserves result. No style/layout redesign.

## To Do
- [x] Inspect actual repository/main/runtime and identify competing sort layers; installed /Applications/MoXBots.app reports 0.5.9 (not a release acceptance claim).
- [x] Reproduce failure with regression tests before repair.
- [x] Implement and review small sorting fix.
- [x] Focused unit/DOM (92 pass), full typecheck, targeted lint, actual Chromium checks (1440/900 × workspace/section).
- [x] Default-profile Web build and Theme checks pass; MoXBots-profile actual browser 4/4 groups pass.
- [x] Commit and push repair branch; PR132: https://github.com/heavenzhang/MoXBots/pull/132.
- [ ] CI, merge and remote main inclusion: authoritative final check/mergeCommit are on PR132; source task must verify ancestry and remote refs before reporting delivery.
- [ ] Desktop package release and real native acceptance: queued for existing sole desktop publisher 01a12bc2-907a-7702-b6dd-788225c5dfe4, next unfrozen batch. No concurrent install/restart, frozen artifact replacement or server action. Human subsequently authorized notifying the sole desktop publisher after merge and arranging the next unfrozen update/native acceptance without interrupting active work.

## Evidence and next step
User screenshot shows pins retained below unpinned rows. `sortWorkspaceSessions` sorts pins first, then `orderSidebarItems` reapplies saved rank without pin awareness. Regression first failed in all three relevant DOM cases. All four call sites now respect pin priority; no saved data changes. Acceptance and publisher request: `dev-docs/pin-order/acceptance.md`. Default Web build and MoXBots actual renderer checks passed. Next: PR132 CI/main delivery, then native release remains queued.

## Execution
Selection: bounded coupled bug, one primary and deterministic tooling. No model/effort change or external calls; explicitly ai-yaoren-local native-only. Primary exact runtime model/effort and token/cost accounting unavailable. UI baseline is existing sidebar at desktop/rail sizes; use synthetic data only.

## Latest integration

Human approval in source thread01a14f1a-2554-7e62-840c-b8fea79488f2: “授权通知并安排更新”. Original CI run39130348337 at1a24b8b74:9 applicable passes/1 conditional skip. Main advanced to96010acb7 with PR131 website documentation while CI ran; resolved only shared-plan append conflict, preserved both tasks, code/test blobs identical. Final updated-head CI and main containment still required before dispatch.
