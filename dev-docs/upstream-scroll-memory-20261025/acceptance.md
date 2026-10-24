# MB-UPSTREAM-FIXES-20261025 — scroll positioning and custom memory compatibility

Base: `848e333455c7045534bf51a951a19b6945c6aa1a`
Branch: `codex/upstream-scroll-memory-20261025`
Upstream references: `5fee8d234642572f362357225c395e653ba42a47`, `e0ebe005eec1b18478301c152511da3addfc97d9`, `9303926843d9c5b750b22c3e2a5a04547c0bc814`, `8fcd6335442d963714c0d2bd54bda761377435cd`.

## Scope

- Retire superseded Virtuoso index navigation, preserve fractional scroll geometry, verify ownership and browser scroll behavior while retaining MoXBots' existing navigation, search, model management, and recovery architecture.
- Discover custom workspace memory rule filenames and keep Rust substrate behavior, memory gardener/molt scripts, and bundled skills consistent. No real user memory, workspace business data, or real task was read or changed.
- Shared `package.json`, `package-lock.json`, and shared specification files were left untouched for the integration owner. Add `scripts/memory-skills.test.mjs` to the shared test command during integration.

## Verification

- `node --test scripts/patch-react-virtuoso.test.mjs` — 7/7 passed after applying the patch to the isolated, clean npm `react-virtuoso@4.18.3` copy. Package was copied to worktree `node_modules/react-virtuoso`; all other dependencies are symlinked to the authorized shared dependency tree. No install/postinstall ran.
- `node --test scripts/memory-skills.test.mjs` — 11/11 passed. Cases use temporary synthetic workspaces only.
- `vitest run --project dom src/renderer/hooks/useChatScrollController.test.tsx src/renderer/hooks/useChatSearch.test.tsx src/renderer/components/MessageList.freeze.test.tsx` — 67/67 passed.
- `node scripts/verify-chat-scroll.mjs webkit --ownership-only` — passed. `node scripts/verify-chat-scroll.mjs webkit` — passed all ownership, smooth/rapid follow, cancellation, reduced motion, height seeds, reading, footer/viewport growth, navigation and terminal checks. Browser's Vite resolution was verified to the worktree private package at `node_modules/react-virtuoso/dist/index.mjs`, SHA-256 `ffa93e7e28e03b003e2cd742b24e404e87d9fa3be8032d6e154ef94ef20d7429`.
- An earlier ownership-only run loaded the shared pre-patched dependency through a worktree-level `node_modules` symlink and failed two ownership assertions. That evidence was retained at `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/myagents-scroll-verification-9AZZm4`; it is superseded by the correctly isolated successful run at `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/myagents-scroll-verification-UcpsIM` and full suite at `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/myagents-scroll-verification-NbEXsM`.
- Rust tests are pending because Cargo jobs are reserved by the parent task's native lifecycle work. No Cargo command was run.

## Delivery boundary

This is source and local synthetic/browser verification only. No shared CI, production build, install, release, remote push, or real user workflow was run. The branch is not yet integrated to `main`.
