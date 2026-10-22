<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-policy-ui-work-20261022 -->
<!-- git-project-sync-task:base=c8068493cfbfd32836c132ae63d5fbd227300b53 -->
<!-- git-project-sync-task:status=complete -->

# Task: MOXBOTS-MODEL-POLICY-20261022-02 UI implementation

## Objective

Deliver a maintainable automatic model candidate pool in Settings, including tier assignment and model availability controls. This branch is isolated to the UI component, its DOM tests, English/Chinese settings copy, and this task record. Backend ownership and shared API are integrated separately by the root task.

## Acceptance criteria

- Show all active pool models with full model name, provider and ID, localized tier source, availability, first-priority marker, and keyboard-operable ordering controls.
- Search/filter, select visible rows, pause/resume/remove candidates, add eligible directory models, and limit classifier choices to active available chat models.
- Require confirmation for pool membership actions; clear a classifier when its model is paused or removed; preserve provider configuration and show specified-backup behavior.
- Route production writes through an optional latest-settings pure modifier, retain a legacy `updateConfig` fallback for old callers, and support guarded undo.
- Keep loading/error/retry states and narrow-window wrapping; do not permit maintenance during load/failure.
- Target DOM tests and targeted lint/typecheck pass.

## Completed

- Implemented complete directory-backed pool management with legacy-tier fixture derivation, compact tier counts, search and state filters, visible-only multi-select actions, searchable add panel, direct tier selection, latest-order keyboard up/down priority, classifier recovery, specified-backup note, advanced restore controls, explicit confirmations and undo conflict protection.
- Added English and Simplified Chinese copy for new states and actions.
- Replaced the old tier-only DOM suite with behavior tests covering legacy compatibility, latest-state pure modifiers, list reordering, hidden-selection clearing, pool snapshot/addition, classifier cleanup, failed-save retention, undo conflicts, load failures and backup behavior.

## Verification

- `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run --project dom src/renderer/pages/settings/AutoRoutingSettings.test.tsx --reporter=dot` — 12 tests passed, including rendered reorder, visible selection boundaries, failed-save retention and undo conflict.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run typecheck -- --pretty false` — exit 0 with no TypeScript diagnostics.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx eslint src/renderer/pages/settings/AutoRoutingSettings.tsx src/renderer/pages/settings/AutoRoutingSettings.test.tsx` and `git diff --check` — exit 0.
- Node 24 is required by this repository (`devEngines.runtime >=24.14.0`); default shell Node 22 rejects npm scripts.

## Blockers and unknowns

- UI-only worktree; no production configuration, App, browser session, CI, push, or PR was touched. Actual data and application behavior remain for the root integration and independent UI acceptance owner.

## Next step

Hand the local commit SHA to the integration owner for cherry-pick; wire `modifySettings`, `onOpenProviders`, and `specifiedBackup`, then run the independent UI acceptance.
