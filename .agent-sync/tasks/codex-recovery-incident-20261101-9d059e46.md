<!-- git-project-sync-task:source-digest=43c4593ab8f85a5066cdf256c541e41a94208ccec433d6e9672ac7d9a018869b -->
<!-- git-project-sync-task:id=6003f676-f42f-4c63-ba54-799bac465a23 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/recovery-incident-20261101 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-INCIDENT-20261101 恢复横幅回归与并发恢复隔离

## Objective

修复 528.1 四会话反馈中的重复恢复横幅与并发拒绝扩大问题，保全原会话与账本；按最新授权以系统恢复与稳定性实测为优先，原业务结果单独核验。证据：`dev-docs/recovery-incident-20261101/acceptance.md`。

## Acceptance criteria

- [x] 当前安装、main、部署 owner 和四会话只读证据核实。
- [x] 重复横幅和并发拒绝分别失败复现、修复、回归；未知操作与真实流中断围栏保留。
- [x] 134 单元、27 隔离集成、22 DOM、TypeScript、ESLint、分类与差异检查。
- [x] 第一提交44fd167远端保存且owner定向独审通过。
- [x] 第三批取消任务总时限d544远端保存且owner已纳入联合候选。
- [x] 第四批23620fba远端保存，owner已纳入R4候选且精确CI通过。
- [x] 第五批35353c88远端保存/owner集成；R5 CI反向依赖失败由owner655514修复，源分支已快进采用。
- [x] 前六批经 PR217/主干3b62a664及联合CI交付；0.5.29/529.1 已安装核验。
- [x] 第七批明确续接/意图超时修复经PR222、main2ff069ae、CI及0.5.30/530.1安装核实。
- [x] 第八批任务查询重复误拦截隔离复现、修复及213相关回归通过。
- [ ] 第八批经原owner独审、集成与下一不可变候选，真实刷新验收待完成。
- [ ] 原 owner 统一版本/CI/制品/安装；在可用原生窗口完成原会话验收。

## Completed

第九项：原生TaskList/Get刷新、未确认评审回执接续指引、历史错误误读指引已实现；真实工具外分类复现1024输出全部thinking/无text，4096对照有效JSON，源码补预算传递及output_limit严格失败诊断。530.1不含本批，原四例尚未全部通过；独审/交接/主干/下一包/实际复验待完成。

530.1 已安装，签名/公证/实际二进制与候选18cbda52一致，三个心跳运行态恢复；薪资和行情原会话均沿原execution真实准入并执行工具。行情任务清单查询又出现历史成功被永久拦截，正式通道仍HOLD。第八批只允许受限直接产品CLI list刷新已成功查询，所有live/unknown/error/旧身份/持久化保护保留，每次仍入原native journal；普通Bash不豁免。已快进到实际main2ff069ae，无版本分配或原运行数据写入。

529.1 首次原会话继续实测仍 INTENT_UNCONFIRMED/timeout，系统验收失败。第七批修复明确续接依赖网络分类与8秒误截断，补 exact root human request→execution 关联、初始化取消及SDK预算传递。已从最新主干58941e30无冲突快进，改动仅此任务，原会话未由本线程改写。

第六批允许新的可信人工输入恢复计数封顶的原任务一轮，保留计数、未知操作等原保护，自动空转仍停止。4项旧实现失败已复现；真实原会话未运行，待唯一owner新包。

第五批修复ContextRecovery已知Bash退出与execution.pending不一致，加入当前选中native链/完整摘要/原生journal的历史同步；保留失败与旧命令围栏。479相关测试通过，2个旧owner行为正例失败复现，7个不可信证据负例拒绝。当前实际会话数据未改，等待原owner新包安装与业务验收。

第四批修复一键继续跳过execution及覆盖guard的归属缺陷，旧实现4项失败已复现；原四文件422项回归及tsc通过，新增2项guard组合单元。真实原会话仍待owner新包复验。

第三批按用户要求去掉整个任务30分钟执行门，保留旧字段兼容且不写运行账本；202项测试、类型/lint/分类通过，3项时间边界旧实现失败/新实现通过。

四会话只读快照已保存任务相邻私有 evidence。第一提交两处源码修复及5项新增测试完成；第二批补Responses合法推理事件/进展和有界意图失败证据，原保护状态未修改；完整范围和失败证据见 acceptance.md。

## Verification

- Source digest: `43c4593ab8f85a5066cdf256c541e41a94208ccec433d6e9672ac7d9a018869b`; Phase9: 446 related cases across 9 files PASS; tsc/lint/classification/diff PASS. Real Provider output-budget reproduction and controlled comparison recorded privately; installed530.1 still fails final acceptance.

第九项：9文件446项联合回归、全量tsc、定向lint、classification、diff通过。直接Provider同上下文1024预算耗尽/4096完整JSON对照保存于相邻私有evidence；订阅SDK无新真实验收结论。源码交原owner非实现者审查和下一不可变候选，正式稳定通道HOLD。

- Source digest: `f8bf4df5c831594283ce7f37d409b267a5a876856bf39f1dc3356bc4e5b4a5d6`; Phase8: 213 related unit/integration PASS, final 55 targeted PASS with full cold native admission; baseline FAIL reproduced; full tsc/scoped lint/classification/diff PASS. Installed530.1 still requires the next immutable candidate for this correction.

第八批：旧实现真实形态回归先FAIL；213个上下文恢复/任务命令/冷恢复相关单元与隔离集成通过，全量tsc、定向lint、分类、diff通过。新测试覆盖已成功查询刷新、同tool ID拒绝、冷恢复、unknown/Stop/持久化失败、路径/组合/重定向/写入参数反例。原owner独审及新包实际刷新尚未完成。

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

前七批已主干/CI/530.1安装；两个原会话已真实续接，另两个及终态仍待原owner验收。任务查询重复误拦截仍在已安装530.1，不能将本地第八批当作实装修复；正式通道暂不晋级。旧未知结果不得清标记或凭截图核销；原任务业务外部依赖与系统恢复验收分别列示。用户持续授权更新和原生验证，并要求保留旧开发进程，系统稳定优先。

## Deployment request

desktop/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`；沿用下一未冻结批。不新增部署 owner，不触发共享 CI/PR/正式构建或安装。第八批不自行分配版本或重建旧530.1；新的源码交付与候选安装/真实验收分开。

## Next step

将精确分支 SHA 交原 owner 独立审查并正常集成 main；按最新授权由原owner安装候选并验证四原会话，失败继续定位，真实会话验收单列。
