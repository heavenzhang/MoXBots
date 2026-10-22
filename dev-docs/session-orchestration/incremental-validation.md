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

旧6713 author-blocked 标记所指的无proposal兼容缺陷已修，开发侧可申请源码集成；不解除整库Rust资源准备、signed-human/native、DSH hook ready、Codex出生快照、真实子Agent回传/验收、断线重启/未知claim对账等门禁。此前整库Rust缺CLIProxy manifest的记录仍不是通过；本轮未修改Rust源码或绕过该资源门禁。

执行：主 Agent 负责界面、集成、独立后端审阅与整体验证；复用1名既有 Agent 实施后端兼容并独立验收界面，未新建协调层。沿用本地协作避免重复上下文，不调用外部模型，无模型升级/回退；精确用量和费用未知。两项独审UI缺口（请求终态可重试、历史attempt真实性）已修并验证，后续继续以原owner和实际footer几何校验取代看图猜测。
