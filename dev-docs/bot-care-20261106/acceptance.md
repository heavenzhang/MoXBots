# MB-BOT-CARE-20261106 — My Bots

## Product and authority

Sidebar **管理 Bots** opens **我的 Bots**. The existing roster remains a workspace/conversation switcher. Agent/project projections are read from ConfigProvider, not duplicated in a new store. The selected workspace stays pinned while an editor is open; a live identity change is shown without remounting or trapping the draft.

- Definition: actual CLAUDE.md, AGENTS.md and direct .claude/rules Markdown files. Runtime precedence is available in an expandable explanation. New documents remain in memory until explicit save atomically creates their full content; cancelling or pressing Escape writes no file or directory.
- Skills: effective project capabilities, inherited shared scope, persisted toggles, existing editors. Upload, folder import, URL selection and command creation carry the selected workspace. Global installations cannot silently fall back to process cwd.
- Memory: actual MEMORY.md, memory-named rules, and a bounded memory directory traversal. Existing custom files remain authoritative. New notes use an in-memory creation draft and native exclusive-create; existing notes use the established file editor.
- Work: Start work only opens the existing ProjectConversationDialog with the chosen Bot. It does not auto-send or retry a task.
- Tests: the separate capability section currently performs explicit read-only configuration checks. No model/skill/task execution, fictional success rate, performance claim, revision history or formal-work acceptance is inferred.
- Settings: existing native/config services retain ownership of model, permissions and memory maintenance schedules.

## Local evidence

Node: installed bundled Node 24. Source validation only; no signed package or installed acceptance implied.

- 134 DOM tests pass: BotCarePanel, BotCareDocuments, BotCareChecks, SkillsCommandsList and existing GlobalSidebar regression.
- 28 unit tests pass: documentInventory, install-target and folder-source.
- 13 native workspace CRUD tests pass, including existing-content and symlink collision preservation. Rust 1.92; the existing CI Swift runtime runner configuration was used.
- Full TypeScript and scoped ESLint pass. Integrated MoXBots-profile Vite build passed after merging current main.
- Independent review found and closed config-refresh draft unmount, skill-install modal busy protection and duplicate file-discovery rules. Follow-up removed inert from the pinned editor so Save/Cancel remain accessible after an identity change.
- Built-in browser observed the actual new management entry and empty state in the development renderer. The selected profile and narrow-window layout were also checked with the explicit layout-only fixture. This is not native integration or a real-data screenshot.

Native local test inputs: the signed pinned CLIProxy input was prepared through the repository script. Missing resources were copied read-only from the installed app into this worktree's ignored test staging to compile unit tests. They are not this task's release artifact. Initial missing-resource and Swift loader failures were retained in local investigation; corrected gate run and complete-content creation regression are the 13-test PASS above.

## Remaining release acceptance

1. Source integration complete: remote main a650939d2c38b8dc04750e282b159ddaac8ea346 merged into producer branch. Combined 169 DOM/unit/real Sidecar tests and full TypeScript pass. Formal main intake remains with the owner.
2. Existing desktop/sharedCI/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 reviews, coordinates CI/main and assigns the next unfrozen desktop package. No competing build/release or version allocation by the producer.
3. On that exact native candidate: open management, select two registered controlled Bots, edit/reopen definitions and memory, toggle/install a local test skill only into the selected Bot, confirm shared scope, preserve unsaved drafts, run read-only checks, and open formal work without auto-sending.
4. Verify native runtime/version/commit correspondence and collect real application screenshots. Production and real task execution acceptance remain separate.

## Real Sidecar A/B integration supplement

A real Global Sidecar was started in a temporary HOME, with process workspace A and explicitly selected registered Bot B. The child blocked all non-loopback transport before startup and did not initialize a model agent. Upload, folder import, skill creation, command creation and persisted capability overrides now stay in B; missing and unregistered destinations are rejected without writing A. The new seven-test HTTP suite and the existing required/shared-skill HTTP contract pass (8 integration tests total), plus the target policy's 11 tests.

This test first exposed 3 failing command-create cases in the earlier candidate: the handler ignored the supplied workspace. That candidate was explicitly withdrawn from owner freeze. The fix applies the same registered workspace policy to skill/command creation, and command file creation is exclusive. The final candidate supersedes that earlier source and must be used for CI/native packaging.

These are real process/file/HTTP integration results in isolated data, not native UI or production acceptance.

## Resumed source acceptance on 2026-11-07

The final local cohort passed 169 tests: 134 DOM + 28 unit + 7 real isolated Global Sidecar integration. The earlier shared-skill integration and 24 runtime/capability regressions also passed. Full TypeScript, scoped ESLint and the MoXBots-profile renderer build passed on the refreshed main baseline. Native CRUD passed 13 tests.

The creation draft uses an explicit Save/Cancel dialog, not FilePreviewModal's auto-save callback. Cancel, Escape, collisions, save-in-flight admission, full-content creation and pinned workspace targets are covered. Existing file editing and its save/conflict/draft behavior remain on FilePreviewModal. The read-only section is labelled **能力检查**. Formal work still hands off to the existing conversation dialog.

Development layout fixture: run Vite with repository root (`vite .`) and open `dev-docs/bot-care-20261106/layout-check.html`; it uses a synthetic roster and leaves native file operations unavailable. It is a layout check only. Do not use it as the requested real-client result.

Desktop owner is preparing the separate 543.5 repair batch. No Bot management source has been admitted to that frozen batch, no Bot management version is allocated by this producer, and the real-client persistence checks/screenshots remain pending the next admitted desktop candidate.

## Post-543.8 intake refresh

On 2026-11-07, the sole desktop owner completed release 543.8. Remote main f0913c7bd68d94beea95078b97483001642340c7 still does not contain Bot management. The producer merged that baseline, preserving both shared-plan append records; no source-code conflict occurred. The same 169-test cohort, full TypeScript and MoXBots-profile renderer build passed again. No Bot management version or native artifact has yet been allocated. The next required action is independent source intake by the existing desktop owner, then the native controlled A/B acceptance above.
