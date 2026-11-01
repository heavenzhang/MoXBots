<!-- git-project-sync-task:source-digest=4bff8597717af3f57676e9b7f5ab79bfd750f877fbf030cfbffb3e7eca3490ad -->
<!-- git-project-sync-task:id=6003f676-f42f-4c63-ba54-799bac465a23 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/recovery-incident-20261101 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-INCIDENT-20261101 恢复横幅回归与并发恢复隔离

## Objective

修复 528.1 四会话反馈中的重复恢复横幅与并发拒绝扩大问题，保全原会话与账本；以原业务完成为最终稳定性标准。证据：`dev-docs/recovery-incident-20261101/acceptance.md`。

## Acceptance criteria

- [x] 当前安装、main、部署 owner 和四会话只读证据核实。
- [x] 重复横幅和并发拒绝分别失败复现、修复、回归；未知操作与真实流中断围栏保留。
- [x] 134 单元、27 隔离集成、22 DOM、TypeScript、ESLint、分类与差异检查。
- [x] 第一提交44fd167远端保存且owner定向独审通过。
- [x] 第三批取消任务总时限d544远端保存且owner已纳入联合候选。
- [x] 第四批23620fba远端保存，owner已纳入R4候选且精确CI通过。
- [x] 第五批35353c88远端保存/owner集成；R5 CI反向依赖失败由owner655514修复，源分支已快进采用。
- [x] 前六批经 PR217/主干3b62a664及联合CI交付；0.5.29/529.1 已安装核验。
- [ ] 第七批明确续接与意图超时修复，经独审后交原owner下一不可变候选。
- [ ] 原 owner 统一版本/CI/制品/安装；在可用原生窗口完成原会话验收。

## Completed

529.1 首次原会话继续实测仍 INTENT_UNCONFIRMED/timeout，系统验收失败。第七批修复明确续接依赖网络分类与8秒误截断，补 exact root human request→execution 关联、初始化取消及SDK预算传递。已从最新主干58941e30无冲突快进，改动仅此任务，原会话未由本线程改写。

第六批允许新的可信人工输入恢复计数封顶的原任务一轮，保留计数、未知操作等原保护，自动空转仍停止。4项旧实现失败已复现；真实原会话未运行，待唯一owner新包。

第五批修复ContextRecovery已知Bash退出与execution.pending不一致，加入当前选中native链/完整摘要/原生journal的历史同步；保留失败与旧命令围栏。479相关测试通过，2个旧owner行为正例失败复现，7个不可信证据负例拒绝。当前实际会话数据未改，等待原owner新包安装与业务验收。

第四批修复一键继续跳过execution及覆盖guard的归属缺陷，旧实现4项失败已复现；原四文件422项回归及tsc通过，新增2项guard组合单元。真实原会话仍待owner新包复验。

第三批按用户要求去掉整个任务30分钟执行门，保留旧字段兼容且不写运行账本；202项测试、类型/lint/分类通过，3项时间边界旧实现失败/新实现通过。

四会话只读快照已保存任务相邻私有 evidence。第一提交两处源码修复及5项新增测试完成；第二批补Responses合法推理事件/进展和有界意图失败证据，原保护状态未修改；完整范围和失败证据见 acceptance.md。

## Verification

- Source digest: `4bff8597717af3f57676e9b7f5ab79bfd750f877fbf030cfbffb3e7eca3490ad`; 325 distinct related cases PASS; 13 baseline failures reproduced; tsc/lint/classification/diff PASS. Real-session acceptance remains failed on installed529.1, pending owner integration and next immutable candidate.

第七批：294相关套件+31 builtin队列/预算用例（325不重复case）通过；13旧失败复现；全量tsc、定向lint、分类、diff检查通过。原数据未写，尚待原owner新候选CI/安装/真实复测。

- Source digest: `b0af99666c6b365f8b71d66e9a321dcf012ed4bc440972b48bc88cb40ccad38f`; 78 execution integration + 163 policy/boundary/facade unit + 24 native queue cases = 265 PASS; 4 pre-fix positives reproduced FAIL; full tsc/scoped lint/classification/diff PASS. No original user data or operations replayed; exact candidate CI/install/real acceptance remain with desktop owner.

- Source digest: `31daff27e77d471e8a29ce703590dd9e1f23082964b1690848712369a3142c92`; 479 related unit/native-queue/execution tests PASS across focused runs; 2 old-owner positive regressions FAIL before synchronization; 7 invalid-evidence variants retain pending; tsc/scoped lint/classification/diff PASS; deps 0 errors and 18 pre-existing orphan warnings; SDK-selected actual incident read-only receipt/digest matched, original ledger unchanged; installation acceptance pending.

- Source digest: `f29b2cff4431b1d05c7bfb98997343d2bc377e4657b7e1085272591016586759`; old implementation fails 4 original-execution continuation cases; fixed 422 full unit/integration regression tests and 2 added guard cases pass (20 final guard tests); full tsc, scoped lint, classification, diff checks PASS; native original-session acceptance pending. Commit uses native Git with body because installed save helper only accepts a single-line message.

- Source digest: `4add3b8b8ee684a0e73cfaadf1a5e1070741f14fd73c9025d8c675fdf34db66a`; 202 focused unit/integration tests PASS; 3 old time-boundary regressions fail before fix and pass after; full tsc/scoped lint/classification/diff PASS; legacy serialized shape retained; native installation/acceptance with sole desktop owner pending

- Source digest: `16027550e794eddb1343a5cda7d47a4da5e759d6dc9ccd4005c0ffd123edde80`; Phase2: 46 protocol/unit/HTTP + 66 execution integration + 17 DOM PASS; full tsc, scoped lint, classification, diff check PASS; public unauthenticated network GET 6/6 only; original Session acceptance remains pending with authorized desktop owner

- Source digest: `fe8a9f06d0344c0f124e3a3e88cf1ace1386f5cad9a2c898d55329e0f2e45a28`; Node24: 134 unit + 27 isolated integration + 22 DOM PASS; full tsc, scoped eslint, test classification and diff check PASS; original ledgers untouched; native acceptance pending with desktop owner

Node24: context recovery 134 unit + 27 integration、22 DOM PASS；全量 tsc、定向 lint、test classification、diff check PASS。第二批46协议/HTTP、66执行集成及17 DOM通过；真实业务未重放，原生验收由原owner推进。

## Blockers and unknowns

前六批已主干/CI/529.1安装；当前原生首次续接失败证据已保留。第七批本地修复与隔离验证不等于真实恢复；需原owner独审集成新包后再验证四个原会话。旧未知结果不得清标记或凭截图核销；原任务业务外部依赖与系统恢复验收分别列示。用户持续授权更新和原生验证，并要求保留旧开发进程，系统稳定优先。

## Deployment request

desktop/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`；沿用下一未冻结批。不新增部署 owner，不触发共享 CI/PR/正式构建或安装。第七批不自行分配版本或重建旧529.1；新的源码交付与候选安装/真实验收分开。

## Next step

将精确分支 SHA 交原 owner 独立审查并正常集成 main；按最新授权由原owner安装候选并验证四原会话，失败继续定位，真实会话验收单列。
