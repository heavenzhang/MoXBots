# MB-BOT-CARE-20261106 — My Bots

## Product and authority

Sidebar **管理 Bots** opens **我的 Bots**. The existing roster remains a workspace/conversation switcher. Agent/project projections are read from ConfigProvider, not duplicated in a new store. The selected workspace stays pinned while an editor is open; a live identity change is shown without remounting or trapping the draft.

- Definition: actual CLAUDE.md, AGENTS.md and direct .claude/rules Markdown files. Runtime precedence is explained in the UI.
- Skills: effective project capabilities, inherited shared scope, persisted toggles, existing editors. Upload, folder import, URL selection and command creation carry the selected workspace. Global installations cannot silently fall back to process cwd.
- Memory: actual MEMORY.md, memory-named rules, and a bounded memory directory traversal. Existing custom files remain authoritative. New notes use the same native exclusive-create and file editor path.
- Work: Start work only opens the existing ProjectConversationDialog with the chosen Bot. It does not auto-send or retry a task.
- Tests: the separate capability section currently performs explicit read-only configuration checks. No model/skill/task execution, fictional success rate, performance claim, revision history or formal-work acceptance is inferred.
- Settings: existing native/config services retain ownership of model, permissions and memory maintenance schedules.

## Local evidence

Node: installed bundled Node 24. Source validation only; no signed package or installed acceptance implied.

- 127 DOM tests pass: BotCarePanel, BotCareDocuments, BotCareChecks, SkillsCommandsList and existing GlobalSidebar regression.
- 28 unit tests pass: documentInventory, install-target and folder-source.
- 12 native workspace CRUD tests pass, including existing-content and symlink collision preservation. Rust 1.92; the existing CI Swift runtime runner configuration was used.
- Full TypeScript and scoped ESLint pass. Integrated MoXBots-profile Vite build passed after merging current main.
- Independent review found and closed config-refresh draft unmount, skill-install modal busy protection and duplicate file-discovery rules. Follow-up removed inert from the pinned editor so Save/Cancel remain accessible after an identity change.
- Built-in browser observed the actual new management entry and empty state in the development renderer. This is not native integration or a real-data screenshot.

Native local test inputs: the signed pinned CLIProxy input was prepared through the repository script. Missing resources were copied read-only from the installed app into this worktree's ignored test staging to compile unit tests. They are not this task's release artifact. Initial missing-resource and Swift loader failures were retained in local investigation; corrected gate run is the 12-test PASS above.

## Remaining release acceptance

1. Source integration complete: remote main bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 merged into producer branch. Combined 155 DOM/unit tests and full TypeScript pass. Formal main intake remains with the owner.
2. Existing desktop/sharedCI/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 reviews, coordinates CI/main and assigns the next unfrozen desktop package. No competing build/release or version allocation by the producer.
3. On that exact native candidate: open management, select two registered controlled Bots, edit/reopen definitions and memory, toggle/install a local test skill only into the selected Bot, confirm shared scope, preserve unsaved drafts, run read-only checks, and open formal work without auto-sending.
4. Verify native runtime/version/commit correspondence and collect real application screenshots. Production and real task execution acceptance remain separate.
