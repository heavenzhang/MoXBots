# MB-UPSTREAM-FIXES-20261025 — Tauri events and native macOS quit

Scope: group 4, isolated `codex/upstream-native-20261025` from `848e333455c7045534bf51a951a19b6945c6aa1a`. Canonical repository: https://github.com/heavenzhang/MoXBots.git. References: upstream `dacc8c01f289fe076413fa273c412e63cef3804d` and `2f00a16b9307c0a5c1efc5e69a1447f2c992b296`.

## Changes and invariants

The exact `@tauri-apps/api` 2.11.1 patch retains the allocated callback identity, releases it on registration rejection or cancellation, and is paired with vendored Tauri 2.11.2. The Rust-generated install consults the existing callback Map before installing delayed metadata; unlisten deletes descriptors and empty event tables. Both ESM and CJS are verified by fixed hashes before writes. No application listener registry or retry mechanism is added.

Tao 0.35.3 handles `applicationShouldTerminate:` by queueing an `ExitRequested` through its existing native event queue and returning `NSTerminateCancel`. Paired tauri-runtime-wry 2.11.4 maps that request to the existing cancellable Tauri event. Native, last-window and explicit exit use the same existing decision; restart codes are retained.

`source-invariants.json` verifies each original vendored file against the three cached crates.io archives and their documented archive hashes. Only Tauri `src/event/mod.rs`, Tao `src/event.rs`/`src/platform_impl/macos/app_delegate.rs`, and runtime-wry `src/lib.rs` differ. All vendor licenses and per-file upstream manifests are retained.

The complete MoXBots `ExitRequested` body is byte-identical to base. Existing frontend confirmation, durable recording finalization before cleanup, once-only cleanup flag, creation-admission gate, exact process-tree settlement, deliberate-exit/update-restart restoration marker, terminal/browser shutdown and lock release remain in their original owner. `updater.rs`, `process_cmd.rs`, `sidecar.rs` and `app_dirs.rs` are unchanged. Product lib.rs and renderer helper edits are comments only; navigation/model/recovery code is untouched.

## Validation

Node: `/opt/homebrew/opt/node@24/bin/node`. Only `@tauri-apps/api` was copied into this checkout's ignored node_modules before patching; other dependency entries are read-only symlinks to the authorized cache. No shared node_modules or Cargo registry source was modified. No postinstall was run against the shared cache.

- `node --test scripts/tauri-event-lifecycle.test.mjs` before the API repair: 22 tests, 14 pass / 8 expected failures, demonstrating cancellation/rejection leaks despite the native half being present.
- `node --test scripts/patch-tauri-events.test.mjs scripts/tauri-event-lifecycle.test.mjs scripts/tauri-native-quit.test.mjs`: 31/31 pass, including ESM/CJS delayed install, registration rejection, once/reentrancy, targets, distinct names, idempotence, unexpected-byte rejection and vendor provenance.
- `node node_modules/vitest/vitest.mjs run --project unit src/renderer/utils/tauriListen.test.ts`: existing 13/13 pass.
- Targeted ESLint on the new scripts, probe and changed helper: pass. Existing baseline-browser-mapping age notice only; no package upgrade performed.
- `node scripts/check-test-classification.mjs`: pass (459 server tests).
- `git diff --cached --check -- . ':(exclude)vendor'`: pass. Full staged check reports 12 pre-existing whitespace lines in upstream `vendor/tauri/mobile/ios-api/Sources/Tauri/Logger.swift`; archive/manifest verification proves these bytes are unchanged. They are deliberately preserved to keep vendor provenance exact.
- Native reference (`node scripts/verify-native-quit.mjs --upstream`): native/cancel-confirm have no projected requests; native-reentrant times out; last-window/explicit/restart controls pass.
- Native paired (`node scripts/verify-native-quit.mjs`): 6/6 pass. Request vectors: native `[null]`, cancel-confirm `[null,null,0]`, native-reentrant `[null]`, last-window `[null]`, explicit `[0]`, restart `[2147483647]`.
- Native events (`node scripts/verify-tauri-events.mjs`): pass; 10,000 sequential and 10,000 burst cancellations, 1,000 distinct names, 100 rejections, 100 once completions, 1,000 real abort-helper registrations and 3 target types. All 9 checkpoints have zero callbacks/descriptors/tables; late callbacks = 0, once deliveries = 100, JavaScript failures = []. Result in `native-evidence.json`.

Native fixture builds are offline, use the repository Rust 1.92.0 toolchain, and explicitly limit Cargo to two jobs. They build only the standalone fixture crates under this isolated checkout's ignored target. The opt-in runner accepts `MOXBOTS_NATIVE_FIXTURE_TARGET_DIR` for a separate target. Each app uses a test identifier and incognito window, without product setup, model accounts or real user configuration. The reference native-reentrant case exposes an AppKit deadlock; runner timeouts now kill only the spawned fixture child with SIGKILL, save failure evidence and continue the control cases. Default SIGTERM can itself remain blocked by that deadlock.

Local full logs (ignored): `events-red.log`, `events-green.log`, `renderer-helper.log`, `lint.log`, `native-quit-red.log`, `native-quit-green.log`, `native-events.log` in this directory. Small nonsecret native result JSON is committed in `native-evidence.json`; temporary complete fixture sources and manifests remain at the paths recorded there.

## Integration checklist for parent

Shared package changes included here, to reconcile with the other groups:

1. Exact root and lock pin `@tauri-apps/api: 2.11.1`; the resolved lock entry is unchanged.
2. Append patch execution to `postinstall`; append `--check` to `predev:web`, `prebuild:web` and `pretypecheck`.
3. Add the three script test files to `test:build-scripts`, and native opt-in commands `test:native:tauri-events` / `test:native:quit`.
4. Add `vendor/tauri/**` to the shared `eslint.config.js` ignore list, preserving upstream template syntax. This worker does not modify that shared file.
5. Shared `specs/tech_docs/build_resource_preparation.md`: document paired exact JS/native patch, fail-closed byte/version checks, npm preparation, check hooks and the event/native fixture commands. A native dependency update must review both halves before removing the pair.
6. Shared `specs/tech_docs/pit_of_success.md`, process lifecycle section: document that native AppKit Quit must project through Tao/runtime to the existing `RunEvent::ExitRequested`; final `Exit`/`LoopDestroyed` cannot own confirmation or durable-finalization cancellation. Retain exact ChildTree cleanup and the existing shutdown owner; no fallback scans or second cleanup owner.

## Delivery and limits

Local commit only; this worker does not push, create a PR, merge, invoke shared CI, change versions, build/install/restart the product or publish. Parent performs integration; desktop/macOS/updater and combined CI owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4`.

No persistent data migration is needed. The JS/native event pair and Tao/runtime pair must ship together in a newly built native app/WebView. Tests do not establish any overnight OOM root cause, source-WebView destruction cleanup, IPC Channel lifecycle, logout/shutdown coordination, force-quit handling, or actual production recording/update/session restoration acceptance. These remain separate from the isolated framework results. Published packages and daily App state are unchanged.
