<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/bot-care-skill-scope-20261107 -->
<!-- git-project-sync-task:base=05ea1e2c4d06f112585012a27503adc75c184dcc -->
<!-- git-project-sync-task:status=in-progress -->

# BOT-CARE-SKILL-SCOPE-20261107 · Selected Bot skill installation

## Objective

Keep skill upload, local-folder import and URL preview/installation on the selected Bot workspace when invoked through the Global My Bots UI. Preserve user-scope installation and implicit Session workspace behavior. This isolated implementation task does not operate the running app, shared CI, release or user data.

## Acceptance criteria

- [x] SCOPE-01: All three renderer requests carry explicit project agentDir; URL preview and confirmation both retain the target.
- [x] SCOPE-02: Global project installs require an explicit registered Bot workspace; missing, malformed, absent, unsafe, unregistered or Session-mismatched targets fail before source access or writes.
- [x] SCOPE-03: Isolated Bot A/B/user destinations and existing installer publish/rollback regression tests pass.
- [x] SCOPE-04: Changed-file ESLint and TypeScript noEmit pass.
- [ ] SCOPE-05: Parent owner reviews and integrates the exact local commit; shared owner coordinates CI/release and actual installed-client acceptance.

## Completed

Added a single install-target policy shared by all three handlers. Explicit project targets reuse existing workspace deny-list validation and registered Agent lookup; canonical directory validation also catches unsafe symlink destinations. A Session uses its engine workspace authority and cannot override a different workspace. Global process cwd is never an implicit target. User scope remains independent of the selected Bot.

## Verification

Using the existing bundled Node v24 and unchanged shared dependencies:

- `vitest run --project unit src/server/skills/installer-publisher.unit.test.ts src/server/skills/installer-rollback.unit.test.ts src/server/skills/install-target.unit.test.ts --project dom src/renderer/components/SkillsCommandsList.test.tsx`: 4 files, 23 tests PASS.
- ESLint on index.ts, install-target helper/tests, SkillsCommandsList component/tests: PASS (existing baseline-browser-mapping age advisory only).
- `tsc --noEmit --pretty false`: PASS.
- `git diff --check`: PASS.

## Blockers and unknowns

Local-only implementation handoff by parent instruction: no push, shared CI or release triggered. Actual native UI/API end-to-end execution with real Bot registrations and installed-client acceptance remain with the parent and existing deployment owner. Unit policy tests use isolated temporary directories and a registry callback fixture; DOM tests mock transport. No claim of production acceptance.

## Next step

Parent owner reviews the scoped commit, integrates it into the overall Bot-care candidate, and passes exact SHA with these evidence boundaries to the existing desktop CI/release owner.


## Follow-up: BOT-CARE-DOCUMENTS-20261107

Parent assigned `BotCareDocuments.tsx` with a `forwardRef` exposing `isEditing()`, scoped exclusively to new document component, discovery helper and tests. Definitions are discovered from existing root CLAUDE.md / AGENTS.md plus direct .claude/rules Markdown; memory includes existing root MEMORY.md, memory-named rules, and memory Markdown subdirectories. Traversal is capped at 200 files, 32 directories and four subdirectory levels. No second storage or assumed 04-MEMORY template is created.

- [x] DOCS-01: All IO uses `useWorkspaceFileService(agentDir)`, with generation-fenced discovery and file-read results.
- [x] DOCS-02: Existing FilePreviewModal owns draft/conflict/save behavior. Preview state captures its original workspace and stays mounted if parent props unexpectedly change; isEditing remains true until modal-authorized close. File loading and creation also hold the parent guard.
- [x] DOCS-03: Explicit missing-definition and named-memory-note creation calls existing newFile; subsequent edits remain in existing editor. Collisions surface as errors, preserve the note name, and never invoke a fallback save.
- [x] DOCS-04: 14 inventory/helper tests, 6 new DOM tests, plus all 29 existing FilePreviewModal live-reload/conflict tests pass (49 tests total). Full TypeScript noEmit and changed-file ESLint pass.
- [ ] DOCS-05: Parent integrates component and translations into care center, arranges independent visual review and native file IO acceptance.
- [ ] DOCS-06: Existing Rust newFile implementation uses existence-check followed by fs::write. Parent was informed to replace it with the existing exclusive no-follow creation primitive before claiming race-safe creation. Rust file is outside this worker's assigned scope.

Translation keys are under app:botCare.docs: contextChanged, invalidName, createFailed, definitionTitle, memoryTitle, description, refresh, loading, empty, truncated, createDefinition (path interpolation), noteName, notePlaceholder, createNote, opening. Parent owns locale files; component supplies Chinese defaultValue fallbacks.

Next: parent reviews the follow-up exact commit, integrates the component and locale keys, and closes DOCS-06 in its separately owned Rust change. No actual app operation, shared CI, production write or release was performed.
