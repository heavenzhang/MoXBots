<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-snapshot-read-state-20261026 -->
<!-- git-project-sync-task:base=c5fd489b56d2eb2f19923d9dddc5cb6097cd439f -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-SNAPSHOT-LOAD-20261026

Parent: MOXBOTS-MOBILE-TESTFLIGHT-20261022.

## Objective

An existing chat must show a pending read until its own request completes. A real failure offers retry and preserves drafts. Unrelated global loading, an older request, or an earlier view cannot report a false session error.

Repository: https://github.com/heavenzhang/MoXBots.git. Base: c5fd489b56d2eb2f19923d9dddc5cb6097cd439f. Branch: codex/mobile-snapshot-read-state-20261026.

## Acceptance criteria

- [x] Reproduce original chat briefly showing failure, then loading successfully without retry. No authentication failure inferred.
- [x] Check formal build 4 producer 63d2230102919960f4406fad175411c81b86e62c and current main share the affected index.tsx bytes (0485b21e2909f1b7bd8bfc4df6dddc685a23bfeb077ab06c976a1e7d6dc678d8).
- [x] Bind pending/error/success to the existing view owner and native read; suppress duplicate retries and stale completions. Preserve sessionSnapshotReady and mutation receipt gates.
- [x] Six focused policy tests pass: pending, error/retry, rapid navigation, account refresh, newer successful snapshot, cancelled refresh.
- [x] Full mobile policy suite (84/0), lint and typecheck PASS; inspect final diff.
- [x] Local isolated Chrome 390x844 QA: delayed read stays pending without false failure/retry, send blocked; real injected error and successful retry preserve draft; late failure after navigation leaves list intact. No message sent, no pageerror. Both screenshots reviewed by primary agent. This is simulated UI, not physical/remote artifact acceptance.
- [ ] Commit only task files; give exact SHA and evidence to shared CI/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4. Coordinate before push/automatic CI.
- [ ] Verify remote main includes the accepted fix; freeze a new mobile build through mobile owner 01a12b99-7b38-78b1-831f-9c60257d386a. Never overwrite build 4.
- [ ] Actual image Read/canonical attachment/catalog/download/preview and TestFlight external review/installable invite remain parent acceptance, not claimed by policy tests.

## Completed

原product5c3d已保存远端；mobile build5候选40a在maincaab上使用同字节cherry-pick d108并只分配app.json buildNumber5，Root在独立main integration分支补齐本交接记录，不修改原作者归档中的工作树或已冻结制品。Root核对三源/测试SHA均等同原5c3d，并复用既有独审范围，不将84policy再加6focused或把模拟当真实设备。

## Verification

2026-10-26: node --experimental-strip-types --test tests/snapshotRead.test.ts: 6 pass / 0 fail (local Node v22.23.0). Local dependency installation completed from existing lockfile; no dependency declared or lockfile modified.

Full npm run test:policy: 84 pass / 0 fail. npm run typecheck and npm run lint: PASS. Initial lint found two render-time ref reads introduced by this patch; corrected using the committed owner fields and a stable initial owner, without suppressions.

Local Web dev-export failed with an unknown module error before UI loaded; preserved as a test setup failure, then used the existing Expo localhost-only dev server (127.0.0.1:8088) and an isolated empty Chrome profile. Local-only interception delayed/rejected native snapshot reads in memory, never altered candidate/fixture source or accessed a Host. All 3 rendered behavior checks PASS.

Private reproducible script: output/mobile-testflight-20261022/check-snapshot-read-ui-20261026.mjs under the project pointer. Receipt: snapshot-read-ui-result-20261026.json; screenshots snapshot-read-pending-20261026.png and snapshot-read-retry-success-20261026.png in the same directory.

## Ownership and boundaries

Shared CI/main remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. Mobile CI/build/sign/distribution remains this chat 01a12b99-7b38-78b1-831f-9c60257d386a. Independent reviewer 01a1488b-c673-79f1-abd5-018938f2ee92 is read-only. No desktop app, production cloud, original 101 identity/config, supplier process, or paid model changes in this child task. Voice deferred. This is local development, not deployment or production acceptance.

## Blockers and unknowns

Root的精确手机主干CI及main包含尚待新回执；原手机owner继续其build/sign/真实iPhone与附件/成果验收。桌面0.5.25候选保持45a9，不在此任务升级或操作日常Mac/101。当前主干CI的hostedmacOS容量是已知外部风险，不能声称已通过或以手机准备工作替代该check。

## Next step

Receive independent read-only review, then send the exact committed SHA and local evidence to the existing shared CI/main owner. Do not push/trigger shared CI until coordinated intake. Parent real image Read/artifact acceptance remains open.
