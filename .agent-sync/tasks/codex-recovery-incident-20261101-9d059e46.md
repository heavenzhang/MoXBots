<!-- git-project-sync-task:source-digest=c0910bf8680d6a3cce2610f79b435cfa3abb6f1dd04886a3110a8aa33898a826 -->
<!-- git-project-sync-task:id=6003f676-f42f-4c63-ba54-799bac465a23 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/recovery-incident-20261101 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-INCIDENT-20261101 恢复横幅回归与并发恢复隔离

## Objective

修复 528.1 四会话反馈中的重复恢复横幅与并发拒绝扩大问题，保全原会话与账本；按最新授权以系统恢复与稳定性实测为优先，原业务结果单独核验。证据：`dev-docs/recovery-incident-20261101/acceptance.md`。

## Acceptance criteria

- [x] 第十五项真实 HTTP502 与旧未知动作耦合、已选备用下一轮409均复现并修复；294相关用例及实际SDK工具链通过。
- [x] 第十四/十五项原owner独审、PR228/main185d5165、533.1签名公证和安装核实；原会话仍失败。
- [x] 第十六项60秒冷却退出复现、同请求剩余预算内等待修复、333回归和原生60秒工具链验证。
- [ ] 第十六项独审、主干/下一不可变包安装和五原会话实际稳定验收。

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
- [x] 第八至十批经原owner独审、PR223/main0d0ad99f与531.1安装；真实查询刷新已成功，整体验收仍失败。
- [x] 第十一批大账本评审截断、model-failover隐式root时限及只读跟进提示修复；235回归/tsc/lint/分类通过。
- [x] 第十一批原owner独审、PR224/mainad68、532.1签名公证/备份安装；原生回执实际成立，整体验收仍失败。
- [x] 第十二批无效accept返工计数、原生反馈和逐请求连接建立恢复实现及隔离验证。
- [ ] 第十二批精确独审、主干/新包/安装与四原会话复验。
- [x] 第十二批e9f60a独审181项通过，532.2候选fcd96/PR226已启动精确CI；未安装验收。
- [x] 第十三批原生returned历史缺口降级两项复现、保留旧保护修复及141项回归。
- [x] 第十三批真实SessionStore冷恢复11项、实际SDK/本地模型缺口注入与默认模式通过。
- [ ] 第十三批独审与下一未冻结候选交付、真实验收。
- [ ] 原 owner 统一版本/CI/制品/安装；在可用原生窗口完成原会话验收。

## Completed

第十六项打包前补证：11分钟合法冷却触发旧10分钟闲置watchdog已实际组合复现；现由原controller只读活跃等待状态沿原watchdog豁免，Stop/owner/route/策略/时限即时撤销，等待结束后真实卡死仍受检测。153项补充回归、三协议真实HTTP40项及tsc/lint通过；最终原生工具链实际等待60.012秒后写1次/旧unknown执行0/unknown1，仍不代表实装验收。

第十六项：533.1原Max真实HTTP502+60秒冷却结束原执行，已保留原失败；新实现沿当前请求lease等待冷却，只消费最后目标剩余有限尝试，候选链优先、手动路由不变。333相关回归、原生SDK60.012秒后独立写入一次且旧未知不执行、tsc/lint/分类/diff通过，安装验收仍待原owner。

第十三项：prearm分析暂缺tool_result时不再把已有精确原生returned工具新升级为legacy unknown；只删本次候选，不修改任何持久unknown/legacy/成功防重放。不同ID/输入、错误矛盾及已有legacy保持；生产5b原新增unknown的具体时序尚未证明，不能自动核销。两项live/cold旧失败复现，141回归/tsc/lint通过，下一批独审/安装验收待完成；532.2已冻结不覆盖。

第十二项以实装532.1为依据：有效回执但证据不合格的accept仍自动空转，现沿既有reworks计数并复用同一证明规则反馈缺失criterion/失效工具；原任务/进展与人工补证保留。代理连接建立只对当前原生ConnectTimeoutError/首个HTTP dispatch作两次有界连接重试，逐fetch绑定取消与owner/代次/预算，不开放HTTP错误或断流重放。独审发现默认follow的307第二跳会重新获取连接重试权，已加首dispatch限制和真实默认follow反例；缓存RetryAgent取消后仍连接的原型未进入产品。429规则未放宽，未知操作未清除。

最新531.1实装验收未通过：评审命令返回完整ledger使尾部receipt遭32KiB截断；model-failover仍有整个root30分钟隐式门，长任务压缩后的正常调用409。第十一批分别修响应边界与单次推理恢复预算，并为已有执行的只读跟进补实际权限/历史错误纠正指引。源分支已快进main0d0ad99f，只改本任务；不清原账本，不手动恢复execution ID，不绕过原生回执。完整范围和验收边界见acceptance.md最新章节。

第十项最终为连续评审回执失败独立计数，3次后停止自动续接；实际业务progress/noProgress/证据不改，不推断Shell归属，旧包可恢复的turn_error保持。a8a/0a31两版由独审在打包前发现问题，均已修正；原生原会话验收仍待新包。

第九项：原生TaskList/Get刷新、未确认评审回执接续指引、历史错误误读指引已实现；真实工具外分类复现1024输出全部thinking/无text，4096对照有效JSON，源码补预算传递及output_limit严格失败诊断。530.1不含本批，原四例尚未全部通过；独审/交接/主干/下一包/实际复验待完成。

530.1 已安装，签名/公证/实际二进制与候选18cbda52一致，三个心跳运行态恢复；薪资和行情原会话均沿原execution真实准入并执行工具。行情任务清单查询又出现历史成功被永久拦截，正式通道仍HOLD。第八批只允许受限直接产品CLI list刷新已成功查询，所有live/unknown/error/旧身份/持久化保护保留，每次仍入原native journal；普通Bash不豁免。已快进到实际main2ff069ae，无版本分配或原运行数据写入。

529.1 首次原会话继续实测仍 INTENT_UNCONFIRMED/timeout，系统验收失败。第七批修复明确续接依赖网络分类与8秒误截断，补 exact root human request→execution 关联、初始化取消及SDK预算传递。已从最新主干58941e30无冲突快进，改动仅此任务，原会话未由本线程改写。

第六批允许新的可信人工输入恢复计数封顶的原任务一轮，保留计数、未知操作等原保护，自动空转仍停止。4项旧实现失败已复现；真实原会话未运行，待唯一owner新包。

第五批修复ContextRecovery已知Bash退出与execution.pending不一致，加入当前选中native链/完整摘要/原生journal的历史同步；保留失败与旧命令围栏。479相关测试通过，2个旧owner行为正例失败复现，7个不可信证据负例拒绝。当前实际会话数据未改，等待原owner新包安装与业务验收。

第四批修复一键继续跳过execution及覆盖guard的归属缺陷，旧实现4项失败已复现；原四文件422项回归及tsc通过，新增2项guard组合单元。真实原会话仍待owner新包复验。

第三批按用户要求去掉整个任务30分钟执行门，保留旧字段兼容且不写运行账本；202项测试、类型/lint/分类通过，3项时间边界旧实现失败/新实现通过。

四会话只读快照已保存任务相邻私有 evidence。第一提交两处源码修复及5项新增测试完成；第二批补Responses合法推理事件/进展和有界意图失败证据，原保护状态未修改；完整范围和失败证据见 acceptance.md。

## Verification

- Source digest: `c0910bf8680d6a3cce2610f79b435cfa3abb6f1dd04886a3110a8aa33898a826`; Phase16 watchdog supplement: real InactivityWatchdog plus 11-minute cooldown reproduces old premature termination. Final five-file 153 tests PASS, three-protocol HTTP 40 tests PASS, full tsc/scoped lint/diff PASS. Concurrent request cancellation preserves the other live wait; all revocations remove the read-only exemption, and genuine post-wait hangs still expire. Final actual SDK/native Bash 60012ms cooldown/history-gap PASS (one write, zero old unknown executions, unknown count one). No durable wait/checkpoint or retry authority added; next owner review/main/install/native acceptance pending.

- Source digest: `c814b13970efa69c59d3eab9d240e67885c9d4c15fcaf99dc1f785e987c13e1b`; Phase16: 333 related unit/integration cases in nine files PASS, full TypeScript/scoped ESLint/classification/diff PASS. Baseline reproduces 11 failures. Actual SDK/native Bash with a real 60-second HTTP cooldown and returned-history gap PASS (60012ms, 1 rejection, 0 switches, 5 model calls, new write 1, old unknown execution 0, uncertain count 1, cold journal reload). Three protocols use real loopback HTTP. Stop/owner/route/background/policy/deadline/end-turn revoke within a controlled 50ms tick; asynchronous validation and unfit cooldown cannot dispatch. Installed533.1 remains failed; next owner release and original-session acceptance pending.

- Source digest: `05d181b34fe9ce917b62c9fbef44812856ce1f58f129d69e42e1453cbe0f8b39`; Phase15: 294 distinct unit/integration cases PASS; actual SDK/native Bash with complete HTTP502 and returned-history gap PASS (4 rejections, 1 switch, 5 model calls, test write 1, old unknown execution 0, unknown count 1). Full tsc, scoped ESLint, classification and diff checks PASS. Both old HTTP retry failure and next pinned-request 409 reproduced before correction. Installed532.3 still fails overall acceptance; owner review/main/candidate/native checks pending.

- Source digest: `31d7e0126d537f792f630af3e7d8941fe1f82daf6e0799414d3563d119fd6c78`; Phase14: pre-fix query tests reproduce 3 FAIL; final 236 related route/parser/native admission/execution tests PASS. Full TypeScript, scoped ESLint, classification and diff checks PASS. Direct compact queries preserve post-write verification, repeated cold queries preserve unknown operations, and explicit continuation after readonly control permits authorized Write/Bash on the original execution. Installed 532.3 still fails overall native acceptance; independent review and next owner release pending.

Phase14：532.3真实原会话验收发现大账本查询包装导致验收失效，新增原list可选有界execution证据视图，直接刷新仍按原生精确identity记录；说明历史只读复测仅约束当轮，不永久撤销原任务修改授权。基于实际main630ae62快进，无原运行数据修改。旧3项失败复现，6文件236项相关回归PASS；全量tsc、定向ESLint、分类和diff检查PASS，真实新包验收待原owner。新增Max上游502与行情旧评审误标尚未闭环。

- Source digest: `d5ee8fe4afa5c3c2d8b946466c3478bb8e367edc63a4a07641dfc7d6c52bc6fa`; Phase13 Store/native supplement: full real-SessionStore checkpoint suite 11 PASS, including success and known Bash-exit gap cases after complete module reload. Actual SDK/native-Bash loopback with and without --returned-history-gap: both PASS, five calls, two expected denials, package count 1, original unknown launch count 0, unknown count 1. Full tsc, scoped ESLint, diff PASS. First Store fixture lacked published V2 birth and correctly failed; it was corrected with a durable first user message and explicit reloaded-owner assertion. No product logic change, real user session mutation, paid inference or installed-client acceptance claimed.

- Source digest: `0bf65fc033640aed6b8adc0f795f417a0a0a0972114979a674c00bc175dab011`; Phase13 independent-review follow-up: adopted the release owner's live/cold failed-Bash tests and added unresolved-peer/retired-identity counterexamples. Final scoped/attempt/journal run: 74 PASS; full tsc, scoped lint and diff checks PASS. Product logic remains identical to reviewed 7c3fe1f09. Real installed original-session acceptance remains pending.

- Source digest: `145429280466a4f6ed4c7889eeb314e98d112d5609386c4b05f82826d5be4991`; Phase13: 141 related cases in four files PASS; two pre-fix live/cold failures reproduced, four distinct negative shapes remain uncertain. Full tsc, scoped ESLint, classification and diff checks PASS. Synthetic native return/history-gap probe executes zero commands and makes zero network calls. Real original ledger unchanged; production trigger and original-session recovery remain unproven.

- Source digest: `f434edff364e6dbe968c942708645d37874345ca78063e742a8cdbc0cd1351cf`; Phase12: 8-file combined regression 289 PASS, plus two added native connection/redirect regressions (291 distinct cases in total); full TypeScript, scoped ESLint, classification and diff checks. Initial four invalid-accept failures reproduced against old source. Cold restore/current epoch, native receipt commitment, shared-pool cancellation isolation, 307 default-follow boundary, actual ProxyAgent TLS timeouts, pre-dispatch single POST, sent/reset/partial-stream/HTTP status negatives, original unknown ledger and SDK replay fences covered. Exact final source review and installed acceptance remain pending original desktop owner. Tests are isolated and do not mutate real sessions.

- Source digest: `d4f641ea1fe79f489b9b927a3c10a19b1c3ba8157bffd0b4c84e3a6ba6cc3f65`; Phase11: 235 cases across route, execution, task orchestration and model-failover unit/integration suites PASS; full tsc, scoped ESLint, classification and diff checks PASS. Large-ledger review output is below 2 KiB and survives native 32 KiB truncation with the original root receipt committing; distinct inference requests after 33/91 minutes succeed, old fingerprints and explicit parent deadlines remain enforced. Existing readonly follow-up preserves the original execution and write gate. Baseline failures reproduced before each correction. Installed 531.1 acceptance failed; next immutable candidate and native retest pending original owner.

- Source digest: `c659c9d63a92ad4252d15276f744a47031fc528b7bb860ad2cb8403b67b13e7e`; final review-receipt budget: 116 execution/policy/DOM cases PASS; full tsc/scoped lint/diff PASS. No inferred tool attribution or changes to real-work progress; installed acceptance pending original owner.

第十项最终计数版：87执行+11策略+18 DOM=116PASS，tsc/lint/diff PASS。纯包装回执空转、真实Write进展保留、同执行人工恢复、成功清零、持久化索引/JSON恢复、重复终态、Stop/unknown及UI原因均覆盖。移除两版未发布的工具归因/业务进展改写；等待原owner精确独审。

- Source digest: `f4f737e641d3486915210e0dd520a52ba7db8e3a09435dc1984ecb46c03c62bc`; corrected Phase10: 96 cases PASS; independent real-work counterexample preserved and fixed; full tsc/scoped lint/diff PASS. Original native acceptance pending unique desktop owner.

- Source digest: `55fe4a9d4e1c96fb15f0828508f3055cd03ba23387f631500a94f90c479f0248`; Phase10: 92 execution/policy cases PASS; baseline repeated-receipt loop FAIL reproduced; full tsc/scoped lint/diff PASS. Phase9 independently reviewed at exact1757d67; installed-client final acceptance remains pending.

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

533.1 已正式安装且精确制品独立核验；原 Max 与双滚动条再次真实502，稳定验收FAIL。第十六项本地修复与回归完成，尚待原owner独审/主干/下一新包/原会话复验。供应商可用性不能用本地模型测试证明；原任务业务外部依赖与系统恢复分开。Kevin、行情及薪资最新实测由原owner记录；旧未知操作不清账本、不盲重放。用户持续授权更新和原生验证，并已允许替代系统控制工具，系统稳定优先；无需重复询问。公开stable保持0.5.27 HOLD。

## Deployment request

desktop/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`；沿用下一未冻结批。本开发线程不新增部署 owner、不触发共享 CI/PR/正式构建或安装；由原owner统一版本分配和发布，不能覆盖已冻结533.1。新的源码交付与候选安装/真实验收分开。

## Next step

将第十六项精确提交与验证交原 desktop owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 独审、合入实际 main 并统一下一不可变候选/CI/安装，之后复验五个原会话。533.1 已安装但原Max与双滚动条仍失败；保留所有原执行身份与未知操作保护，不能以本地测试代替原生验收。
