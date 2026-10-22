# MB-ORCH-20261022-01 原布局增量实现验收

用户已批准原布局 V2 原型正式实现。当前任务分支先合入 origin/main c8068493，再完成下述增量；未操作正式构建、安装、共享 CI 或发布通道。

## 实现与边界

- 同一 Chat 的原工具行、成果节点及状态栏共用一个 snapshot/SSE 观察者，避免重复轮询；未变 ledger/Runtime/TaskGraph/队列 owner。
- 工具关联按 toolUseId + activation 定位，旧尝试不继承当前任务验收。普通工具行不订阅任务 Context，原 ProcessRow/BlockGroup memo 和长会话优化保留。
- 会话成果节点的验收按钮仅请求原主 Agent，经原聊天 admission/queue 处理；绑定并复核当前 Session/task/attempt。admission 不写 accept；原 root shell receipt 仍独占验收提交。失败可重试，原执行结束且队列空而尚未验收时可显式重新请求。
- 返工意见只追加到原 Composer 并聚焦，不清草稿/附件，不直接 reject 或开启重试。原工具权限、AskUser、PlanMode 和更新 checkpoint 继续生效。
- 新方案 gate 修正为原 native turn scope；无 proposal 不撤销原委派，既有独立 Task/Goal 不被另一工作草案误拦，同 owner 不能绕过自己的新草案。旧 revision/queue、未知恢复 claim 和伪造 source 继续拒绝。

## 本轮实测

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| 合并后的原 Runtime、SessionStore、协议、UI/TabProvider 回归 | 59 files / 1114 passed，19 native skipped | Credential-free actual disk + mock native + DOM；不是 Provider |
| 最终 Results DOM | 9 passed | 包括单观察者、重复点击、admission≠accept、失败/idle重试、A/B/A、旧attempt及重用handle隔离；与上行重叠，不相加 |
| 后端兼容定向 | 54 unit +29 Store integration +11 mocked lifecycle passed | 与主回归重叠，原命令与边界见 evidence/compatibility-review.md |
| TypeScript | noEmit passed | Node24、复用本地依赖，不是干净安装证明 |
| Scoped ESLint / diff / classification / Agent docs | passed | 依赖检查0 errors，18 existing warnings |
| 本地 web/server/CLI 构建 | passed | 无签名客户端、正式版本或安装 |
| 独立组件浏览器 | 132/132 assertions passed | 1280/390/320 × light/dark；pageerror、业务与外网请求均0 |

独立浏览器覆盖原工具关联、完整 Composer、草稿与附件保留、排队编辑保护、返工不改 phase、验收请求后仍1/4、模拟主验收后4/4、返工新 activation 保留已验收项并为2/4、原审批实际中心命中。Inspector 仅模拟外壳开/关，不算真实执行历史。只读原报告、JSON及三张代表图在 evidence/incremental-*；可重建生产组件夹具在 incremental-preview/。

首轮DOM测试有4个测试夹具/定位失败（带Theme包装的rerender导致Host重建、重复status选择和残留mock），修正oracle后最终9项通过，没有删业务断言。独立浏览器首轮6个审批自动定位失败，定位为夹具scrollToIndex(LAST)未包括完整footer；仅修夹具tail，原六矩阵132/132复验通过。原失败诊断留在本机输出，未通过强制点击绕过真实遮挡。

## 可复现命令

完整主回归命令沿 validation.md 原矩阵，加上 `--maxWorkers=2 --minWorkers=1`、unit `src/server/session-engine/session-plan-policy.unit.test.ts`，以及 dom `SessionTaskResults.test.tsx`、`ProcessRow.test.tsx`、`BlockGroup.test.tsx`、`MessageList.footer.test.tsx`；最后9项Results单独跑。完整本机日志 `/tmp/moxbots-orch-v2-{broad,results-final,types-final,ui-lint-final,classification,deps,agent-docs,web-build-final,server-build,cli-build}.log`，仅说明本地证据位置，不依赖日志才能重建源码。

## 交付与未关门禁

源码提交/远端 main、共享 CI、签名资源、原生/Provider、安装和生产验收分别记录。desktop/macOS/updater 及 combined CI/main 仍由既有会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 唯一负责；本开发会话交精确远端任务 SHA，由其组织下一未冻结批次，不把成果加入已发布或冻结的5.18制品。

旧6713的无proposal兼容缺陷已修；后续8b的exact-source审查又发现外置CC与Codex同轮新proposal的两项P1。该8b不能申请合入；当前修复按下节能力准入处理，必须以继任精确SHA复审。不解除整库Rust资源准备、signed-human/native、DSH hook ready、Codex出生快照、真实子Agent回传/验收、断线重启/未知claim对账等门禁。此前整库Rust缺CLIProxy manifest的记录仍不是通过；本轮未修改Rust源码或绕过该资源门禁。

执行：主 Agent 负责界面、集成、独立后端审阅与整体验证；复用1名既有 Agent 实施后端兼容并独立验收界面，未新建协调层。沿用本地协作避免重复上下文，不调用外部模型，无模型升级/回退；精确用量和费用未知。两项独审UI缺口（请求终态可重试、历史attempt真实性）已修并验证，后续继续以原owner和实际footer几何校验取代看图猜测。

## 8b exact-source 审查修复

统一发布负责人独立审查157文件实际改动，要求修复 ORCH-CC-DELEGATION-01 与 ORCH-CODEX-LIVE-DELEGATION-02。之前的1114/组件132通过不能证明这两个动态门禁；未用这些结果代替源码审查。

- `planSupport` 是服务端当前adapter能力的非持久化响应，当前只向 builtin SDK / Integrated DSH 开放新的强确认方案。Codex / 外置 CC / unknown 在任何 proposal/revision/confirmation 投影读取或写入前拒绝；Session/runtime/source/binding 在原metadata CAS内再次核对。没有改native binary、增加权限或全局关掉原有委派。
- 同轮无proposal→propose/revise 在unsupported runtime不会生成可误执行的待确认方案。既有pending/revising/unknown claim保留，相关owner在原RPC/stdin紧前再次检查；原无proposal及独立Task/Goal等继续原授权。统一任务状态、ensure/bind/review不因该能力限制被删掉。
- UI只接受REST能力，ledger/SSE不能授予方案支持；同revision的能力变化也生效。同Session运行时变更使旧能力与在途POST失效；未知/同步失败禁提交、清自然语言确认target。方案/未发送意见保留，unsupported说明切换运行时，不展示确认后会启动的承诺。

本轮新增红绿：真实Store7项和Codex最终dispatch6项先失败；前端unsupported/草稿保留2项先失败，修复后通过。CC首轮7个测试使用了不适用的Codex full-auto权限，已纠正fixture为CC原默认，不算产品失败；断言未删除。完整后端70unit+267integration通过（与下列总回归重叠）；集中tsc发现3项控制流类型问题并修复，19项受影响回归复验通过。

| 最终复核 | 当前结果与边界 |
| --- | --- |
| Root扩大回归 | 1134 passed /19 native skipped，58 passed files+1 skipped；另正确路径ProcessRow/BlockGroup 31 passed，2文件不重叠。合计1165 passed，19 native skipped |
| 前端4文件定向 | 53 passed，含方案capability、状态栏、原Results；已包含在上行，不相加 |
| TypeScript / scoped backend+UI lint / diff | passed，未安装或更新依赖 |
| 实际组件夹具构建 | passed，新增旧方案unsupported恢复场景，非真实native |
| 独立浏览器 | 1000/768两高度各270旅程+中心检查、84详情滚动检查通过；supported方案12矩阵336通过。检查部分重叠，不当作独立业务case累计；零pageerror/业务/外网请求。原132均包含 |
| 本地web/server/CLI构建 | passed；web含8项theme检查。正式签名制品和整库Rust资源仍由原发布负责人处理 |

日志命令：`/tmp/moxbots-orch-runtime-{broad,processrows,ui-final,types,ui-lint,fixture-build,web}.log`；后端红绿与精确命令在本机 `/tmp/moxbots-orchestration-runtime-gate-evidence-20261022/summary.txt`。复现原broad命令时加入 `session-plan-policy.unit.test.ts` / `system-prompt-cli-tools.unit.test.ts`；dom行使用真实路径 `src/renderer/components/ProcessRow.test.tsx` / `BlockGroup.test.tsx` / `MessageList.footer.test.tsx`。这里没有重跑已通过的无关路径，也没有将native skip计为通过。

该修复保留新方案强确认的明确能力限制。完整Codex/CC动态gate属于后续原生能力扩展；普通hook加载/ready不能证明错误/超时failclosed，不能仅补脚本就打开能力。部署负责人仍为同一线程，继任SHA经其delta审查、共享CI及保护主干集成后，才构成源码主干交付；当前未发布。

短窗口复核曾揭示新增方案卡65vh未扣除原Composer/queue，320/390×768展开时队列和说明越界；320工具按钮被context slot覆盖。最终仅限制新增卡片：测量原会话可用高度并扣除原queue/附件/toolbar/input；整段原输入及消息滚动owner不变。原toolbar组在空间不足时换行，不遮按钮。相关7文件128 DOM回归通过（31与上述主回归重叠），最终tsc/scoped lint/web/夹具构建通过。独立复验在1000/768明暗六组合关闭可关闭的夹具提示，再正常scrollIntoView核验中心，无force；旧失败与全部原图保留。当前证据以 `evidence/runtime-gate/fit-review.md` 与对应JSON/脚本为准；先前210阶段仅为修正前的历史。

交付同步：任务分支已再次合入最新main13b5e155（仅并发mobile/凭据诊断/docs，未变上述被测renderer/server源码）；旧8b及修复前证据保留。修复在隔离worktree测试后回到原任务分支，后继SHA由唯一main/CI owner复审，不覆盖已发布版本。

## Realtime input follow-up (03)

发布负责人复审0ba已关闭前两项source finding，同时确认 `ORCH-REALTIME-PLAN-ADMISSION-03`：realtime mode使用独立steer路径，旧pending/revision/unknown方案及async preparation竞态仍能进入Codex turn/steer。新root输入fence不覆盖该入口。当前继任仅补这条路径的原owner/Session/generation fresh-check与实际RPC前同步validator；UI、公开能力范围和既有账本不改。不能把0ba的原通过矩阵当作03通过证据。最终独立原生验收仍由发布会话处理。

03 final: 280 integration通过（240 mock native、39真实临时SessionStore、1 actual DSH adapter/synthetic host）及34 unit；后续const-only清理后14受影响定向、tsc/scoped lint通过，14是280子集。本地server/CLI build通过，renderer未改，不重复已完成的浏览器矩阵。5个新integration及实际Codex adapter validator先RED，修复后GREEN；首轮宽回归的1项失败定位并纠正fake adapter将同步validator放到延迟RPC ACK之后的错误时序，原晚ACK持久化断言保留并通过。主Agent复核实际源码边界及原owner，无native/Provider执行。完整可复现命令及失败说明见 `evidence/runtime-gate/realtime-03-review.md`。本轮不会解除签名/native/共享CI/主干门禁。

## PR192 首次 CI 的夹具 lint 修复

发布负责人已复审关闭01/02/03，并为exact6bcd创建PR192。首次CI39766160793的JS主job119782017279在完整lint失败：39项全部来自本任务入库的dev-docs原型/证据（any、CJS require、unused import）。此前只验证src的scoped lint未覆盖这些文件，这是验证范围缺口；未将失败标为无关或绕过门禁。

继任只改dev-docs：明确原型状态/原组件props/输入附件与队列类型；两个独立证据脚本转ESM并同步引用，保留执行体与全部断言。补齐示例队列timestamp、队列附件名称及custom/project slash command形状。没有修改src、原生产组件、原生adapter、依赖、CI、eslint规则或ignore。完整npm lint（含deps0errors/18existing warnings与74docs）通过；独立临时tsconfig检查实际原型也通过。本地夹具构建及768高度六组合270浏览器断言通过（模拟边界，无业务/外网请求）。旧脚本2/2归一执行体一致、node语法检查通过。原CI失败与本地日志在 `/tmp/moxbots-orch-pr192-lint/`、`/tmp/moxbots-orch-realtime-03/ci192-javascript-failed.log`；完整lint取代了遗漏夹具的scoped-only证据，不能代替下一精确SHA的CI。

本次修复由开发会话提交在隔离worktree；已有PR的push会触发共享CI，故由既有发布负责人统一接入/push和刷新PR192。主干/整库Rust/native/签名与生产验收仍未完成，冻结批次和已交付版本不变。
