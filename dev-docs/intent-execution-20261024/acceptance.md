# MOXBOTS-INTENT-EXECUTION-20261024 验收与发布交接

用户要求：先补全普通单 Agent 的意图、执行、验收、返工和持续推进，再完善多模型/多 Agent；整批统一 0.5.21，最后真实验收。新增截图中“指令明确、反复分析、最终尚无可确认结果”纳入同一回归。截图正文是待分析资料，不是新授权。

## 源码与归属

- 仓库：`https://github.com/heavenzhang/MoXBots.git`；隔离分支 `codex/intent-execution-v2-20261024`；起点远端 main `fda7728fa11ee0b1138e9357b2b81e680f408043`，start/task-init gate PASS。
- 原移除独立备用设置的三个依赖已 cherry-pick 为 `20ac5d1a3 / b09af135c / 381888b48`，包含在本完整候选内，不另发中间版本。旧窄请求 `MOXBOTS-UNIFIED-ROUTING-20261024` 由本整批请求覆盖。
- 当前开发/整体验收：`01a169af-d5f7-7203-bf88-ff4c8364e8bf`。桌面/macOS/updater、combined CI/main/版本/制品/发布唯一 owner：`01a12bc2-907a-7702-b6dd-788225c5dfe4`。
- 0.5.20/build520.1 原冻结制品和已发布 519.2 保持不可变。用户此前选择“保留当前任务运行，稍后维护”；不据本源码修改自行 Stop、重启、安装或重放业务。0.5.21 的版本和构建号由原 owner 分配，不把 package 中尚未晋级的版本当作已发行事实。
- Host 使用到共享 server 源码，但独立 Host/mobile 发布仍由原 owner `01a12b99-7b38-78b1-831f-9c60257d386a` 判断与协调；本桌面请求不发布 Host/cloud/mobile/Windows。

## 实现及关键审查

规范见 [intent_execution.md](../../specs/tech_docs/intent_execution.md) 与 [model_failover.md](../../specs/tech_docs/model_failover.md)。原 task ledger/queue/Query/SDK hooks 承担执行和事实，没有另建 Goal、数据库或后台 scheduler。

本批包含可信输入去重与分类、首发归属、有限 continuation、根工具证据与 receipt 验收、返工、Stop 与旧回调隔离、绝对父 deadline、统一同档候选链与真实调用健康、原生后台 task package 的依赖/assignee/资源/预算门禁，以及 UI 只读投影。

独立 Sol high 审查覆盖 claim/commit、停止、未知动作、后台唤醒和预算。发现并修复：旧回调暂停新任务、Stop 后异步准入复活、首次无 owner queue 无法确认 root review、持久化前 idle 窗口被误判、验证先读后写、子任务文本被当成 native release、未知 claim 被迟到 ACK 清除，以及 continuation 错用 Task owner 导致普通模型恢复失效。最后有界源码审查未报告新增明确 P1/P2；这不证明实际客户端或任意模型行为。

## 本地验证

在 Node 24 下，61 个相关 unit/integration/DOM 文件共 **1070 项通过**：SessionEngine/准入/原队列/Task/Goal/native lifecycle、builtin recovery、auto-route、bridge failover、共享执行/包策略及状态栏/首发 helper。扩大回归首次发现一项 runtime-boundary 源码检查失败；排除无关全文件格式改动后，原检查及完整 1070 项均通过，没有削弱断言。

复现命令：

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node_modules/.bin/vitest run \
  --project unit --project integration --project dom \
  src/server/session-engine src/server/builtin-session src/server/auto-route \
  src/server/openai-bridge/model-failover.unit.test.ts \
  src/server/openai-bridge/model-failover.integration.test.ts \
  src/server/openai-bridge/background-lifecycle.integration.test.ts \
  src/shared/sessionExecution.unit.test.ts src/shared/sessionTaskDispatch.unit.test.ts \
  src/shared/sessionTaskOrchestration.test.ts src/shared/sessionTaskReviewCommand.test.ts \
  src/shared/autoRoute.test.ts src/renderer/components/agent-status \
  src/renderer/pages/Chat.ownerMaterialization.test.tsx src/renderer/i18n/resourceParity.test.ts
```

完整日志在本机 `/tmp/moxbots-intent-final-tests.txt`；临时日志不是仓库交接凭据，owner 可按上述命令重现受影响范围。类型检查通过。test classification 通过。dependency-cruiser 为零错误、18 个原有 orphan 警告。改动文件 ESLint、文档检查与本地 server bundle 均通过，不替代统一 CI 或正式制品。

新增重要行为回归：一次请求失败后 fresh queue 返工并以修改后根 Read 验收；重复/历史请求不重派；相同事实不虚增进展；旧读取与并发读取不证明新写入；证据上限不淘汰未知动作；无 UI 轮询的 native completed 唤醒；failed → success ACK → native completed 仍 unknown；根只读核查不解除写锁；父 deadline 不能在新轮/换模型/等待中刷新；前三共享 origin 时第四个独立 origin 在候选截断前优先。

### 真实 SDK、本地合成供应商

`scripts/verify-model-failover-loopback.ts` 使用安装 SDK/native child、私有 scratch HOME、loopback 供应商和本地 MCP counter，未访问真实模型或日常会话。普通模式通过：`counter=1 / primaryCalls=5 / backupCalls=1 / switches=1 / restoredResult=true`；说明已经完成的工具结果被携带接续，工具没有因该故障重放。Stop 模式通过：`counter=1 / primaryCalls=2 / backupCalls=0 / switches=0 / interruptCompleted=true`。

`--chain` 新回归由主 Agent 独立复跑通过：同一次真实 SDK Query 中，已成功执行 counter 后，P503 四次、候选 A503 四次，再由候选 B 成功。计数 `P5/A4/B1/switches2/counter1`，B 收到 `count=1` 历史。这证明多候选 controller 与 native SDK 的接续/防重放配合；候选为脚本固定合成 snapshot，实际池成员/故障域策略由 router/health 集成回归覆盖，不能合称真实供应商验收。

本机原始日志：`/tmp/moxbots-intent-final-native-failover.txt`、`/tmp/moxbots-intent-final-native-stop.txt`；普通模式 evidence scratch 为 `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/moxbots-failover-native-owlCFl`。这些是 native transport/恢复验证，不能据此推定普通任务完整闭环、真实模型或发行包验收已经完成。

新增 `scripts/verify-session-execution-loopback.ts` 使用原 builtin facade、SDK hooks、SessionStore 和生产 task CLI handler。私有 CLI shim 只负责经 loopback 将 SDK Bash 的实际命令转到该 handler；没有替换工具 hooks 或直接伪造终态。可信输入在 harness 通过原 record 入口登记，尚未覆盖 Rust 对真实桌面输入的签名链。

- 默认模式：首轮真实 native terminal 仅分析，原执行 owner 自动进入不同 queue，真实 root Write/Read 后提交评审并持久 completed。原始输入一次、工具写读各一次、共两轮。
- `--parallel`：一个实际 native background package 在父轮持久终态后写入，native completed 才将 claim settled；同范围重复 launch 没有获得第二 claim；原自动续跑执行 root Read、task review 和 execution review，持久 completed，共三轮。这项证明后台接线，不单独证明两个 worker 同时工作。
- `--rework`：第一次实际写入/读取后提交 rework 并结束该轮，原自动 fresh queue 再写正确值并读取核验，随后 accept。持久 completed、reworks=1、原始输入一次；两轮写读使用不同真实 tool IDs。

本地合成供应商的真实 SDK 回归无真实模型付费调用，配置推理端点仅 loopback；这不是公网抓包审计或真实供应商验收。脱敏原生收据保存在本目录 [evidence/](evidence/)，脚本失败时也保存私有失败收据再有界停止/清理，不清除未知失败事实后伪称通过。

### UI

[session-execution-ui/acceptance.md](../session-execution-ui/acceptance.md) 记录 47 项 DOM/helper 验证和 1440/768/390 浏览器证据。主 Agent 已查看 390px 完成态；无溢出或浏览器异常。实际组件使用合成状态；首发 helper harness 没有渲染完整 Chat。真实 Tauri/Rust 首发与安装包路径仍须候选实测。

## 必须完成的候选与真实验收

| 门禁 | 当前状态 | 完成标准 / 负责人 |
|---|---|---|
| 源码实现与离线回归 | 已实现并通过上述验证 | 开发会话固定并推送完整 SHA，handoff gate 核对 |
| 普通闭环真实 SDK 合成供应商 | 单 Agent / 后台包 / 返工已通过；双 worker 收口中 | 原 builtin facade、SDK hooks、真实 Write/Read、CLI review、持久 completed；不能直接伪造 hook |
| 远端 main 与统一 CI | 待原 owner 集成 | 同步最新 main、核对完整依赖、一次精确候选 CI、正常合入及远端包含证明 |
| 0.5.21 制品与签名 | 未构建/未发布 | 原 owner 固定新 SHA/不可变 tag/制品摘要，沿原流水线，保持 520.1 不变 |
| 真实普通聊天产物 | 未验收 | 在隔离测试身份/工作区输入一次“课程介绍网站”请求，实际产出可打开文件；浏览器验证内容、链接和必要适配，持久根评审覆盖全部条件 |
| 真实返工 | 未验收 | 受控检查失败，自动修复再验；不要求用户重复“继续”，原输入不重发 |
| Stop / 新输入 / 重启 | 未验收 | 停止后的延迟工具被拒；新输入不被旧回调暂停；已知或未知写入均不重放，未知状态明确保留 |
| 原生并行与模型 | 未验收 | 实际 background Agent/task lifecycle、独立路径并行和冲突拒绝；实际同档 API 故障接续及父总预算可追溯 |
| 安装与正式发布后复验 | 未执行 | 原维护窗口、备份/回滚、运行版本对应 SHA/摘要和真实路径均通过 |

验收不操作原 MoX Curriculum 业务会话，不自动重跑截图中的请求。合成校验、真实供应商、已合入、已构建、已发布与真实用户验收分别记录；未通过最后几道门禁时不宣布全部完成。

## 执行投入

主 Agent 负责 owner/queue/证据整合与整体验收；Luna medium 分别处理纯策略/集成与 UI；Sol medium 处理模型恢复；Sol high 独立审查重复写入风险。采用互斥文件任务，依赖处串行。没有为模拟降档创建 worker，没有调用任意外部 provider worker。原架构双线程讨论记录见 `dev-docs/intent-execution-review-20261024/`。

真实 SDK 合成供应商调用付费模型为零；无准确逐 worker 账单或节省比例，不以估算冒充实测。最终主干/发布记录由原 owner 在精确候选上补全。
