# MB-RECOVERY-INCIDENT-20261101

## 当前结论

0.5.28/528.1 的真实会话仍失败，不能以此前 CI、本地 fixture 或安装成功认定稳定性已恢复。第一提交交付两项有失败复现的源码修复；后续增量如下，原会话恢复、网络和意图识别问题尚未全部解决。

基线 main `e11ee39b5629d6e74810b75e2155a45400d45005`；已安装包所对应的 release source `9be7cc78a0ecf336d144ae429d4cb7bb4bebcfff`。源码、当前安装包、公共稳定通道是三个状态。负责人当前确认 0.5.28 晋级暂停，正式通道仍 0.5.27。

## 修复与回归

1. Chat 中恢复横幅和操作核查组件同为 sessionId key，切换会话后出现遗留 DOM。抽取原组件组合 SessionRecoveryPanels，使用组件类型加 sessionId 区分身份；保留核查的禁用条件、自动检查 revision、错误内容、原回调和布局顺序。8 次会话切换、错误显隐、卸载和迟到的继续请求回执均验证只保留当前入口。相同 key 基线 2 个测试失败，修复后组件组 22 项通过。
2. protectInference 在已有请求活跃时，拒绝第二个推理的恢复预备，却经通用 stop 同时封锁主 scope。为这一发生在归档、账本写入和 upstream execute 之前的并发拒绝设独立内部错误类型，仅返回该请求 409；原 fingerprint 仍保留，不增加请求重试或工具执行权限。两种 fixture（干净历史/旧未知操作）修复前都在后续主请求得到 409，修复后主请求可继续；旧辅助请求、已完成请求和旧未知操作不能重放。第三项验证实际流失败后主 scope 仍封锁。已坏账本、失去 owner、持久化失败等仍使用原关闭路径。

本次没有让被拒绝的辅助请求自动重试，也没有使缺少结果的旧操作变为成功。若辅助请求自身承担必要工作，仍需原有任务层处理其失败。

## 四个原会话证据

只读快照置于开发任务相邻的私有 evidence 目录，manifest 含文件摘要，原始消息及账本不进入 Git。四个 ledger 与 product/native transcript 均保全，未修改运行数据。

| 会话 | 已核实链路 | 未结事项 |
| --- | --- | --- |
| 双滚动条 | 原生 Bash 三次 INTENT_UNCONFIRMED；随后 WebFetch 辅助推理返回 exclusive recovery authority 409；另一 WebFetch 完成后主推理被 blocked_exact_scope 拦截 | 并发错误扩大问题已有独立复现；线上当时的独占检查含多个分支，不能仅凭通用文案断定都由并发引发。意图失败原因仍未知；2 个未知操作未核销 |
| 行情分析 | Responses 约 302 秒无模型进展，由 idle deadline 中止；后续推理 blocked_exact_scope；界面显示首个协议校验失败 | 原始 upstream frames 未保留，不能认定供应商返回了坏协议；1 个旧未知操作保留 |
| 微信 kevin | proxy 路由、response_headers 阶段，UND_ERR_CONNECT_TIMEOUT，约 10066ms，requestHeadersStarted=false、requestBodySent=false、responseHeadersReceived=false、bytesDelivered=0；bridge 映射 502 | 不等于供应商实际返回 HTTP502；网络连接路径仍需独立验证；5 个旧未知操作保留 |
| 考勤薪资 | 多个重复横幅，16 个旧未知操作；核查无法证明执行结果 | 横幅修复不代表这 16 个操作已经完成或可安全重放 |

旧历史核查报告仅证明 physical native records，未证明 selected chain，不作为清除保护或重放的依据。历史真实复测报告 MB-HISTORY-RETEST-20261031 的 0/3 完成交付仍为失败证据。

INTENT_UNCONFIRMED：当前 classifier 包含 8 秒 utility 时限、JSON/schema 和 continuationOf/steps 校验，多种失败都落为 undefined。现有证据不足以区分超时、不可用模型或返回无效结构；本次没有猜测用户意图、放宽写入门禁或增大重试预算。

## 验证状态

- 134 项 context recovery 单元测试通过（四文件），覆盖操作隔离、原生错误、请求生命周期中的既有保护与新增 3 项并发用例。
- 27 项 context recovery 隔离集成测试通过；无真实供应商调用、无业务重放。
- 22 项恢复组件 DOM 测试通过。
- 全量 TypeScript、定向 ESLint、测试分类、git diff --check 通过。ESLint 仅输出 baseline-browser-mapping 数据过期提示，不是 lint failure。
- 源码自审发现抽取中遗漏的 review disabled / inspectRevision 属性，已在最终改动恢复原值并重跑相关验证。
- 未进行原生安装/页面操作/会话执行：既有部署会话有用户停止原生 UI 的指令。本次未重启 App、未删除会话、未清账本。

## 集成与后续验收

Desktop/macOS-arm64/updater/sharedCI/main 唯一负责会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。本开发分支仅提交推送，交该 owner 独立审阅、正常 CI/main 与下批版本分配。codex 分支推送未匹配共享测试 main/dev 或正式发布触发条件；不创建 PR、不运行共享 CI、不生成正式制品。

下一步：先审阅并集成这两项确定修复；保持 0.5.28 晋级暂停。待允许原生验收时，在原会话切换至少 8 次确认横幅不累积，验证并发辅助调用失败不再封锁独立后续推理，再逐项核查原操作结果。分别验证意图识别、代理连接与 idle/协议错误；四会话真实路径交付前，不将整个稳定性任务标为完成。当前无本任务新版本、制品摘要或发布批次。


## 第二批增量：Responses 推理进展与意图失败证据

用户本轮继续要求彻底解决，并明确答复“解除暂停，由原发布负责人安装并验证”。此授权已转交唯一 desktop owner；旧原生暂停不再作为阻断。原结果未知操作仍先核查，不能自动清账本或重复业务。

### 协议缺陷及修复

`KNOWN_RESPONSES_EVENTS` 漏掉官方 `response.reasoning_summary_part.added/done` 和 `response.reasoning_text.delta/done`；合法事件会把 interruption cause 记为 unproven/protocol_validation，盖过后续真正的 socket/idle 原因。translator 也忽略 reasoning_text delta，不能更新 model-progress，可能在持续推理输出时误判 idle。

新增明确事件类型、合法 metadata 校验、reasoning text 到 thinking/progress 的翻译；仅非空、结构有效的 delta 计为模型进展。非法索引、错误 delta/part 类型仍错误终止，空 metadata 不延长停滞期限；未知事件仍保持不可信。没有扩大重试次数、时间、工具许可或改变历史账本。

真实 loopback HTTP 流通过 bridge + ContextRecovery + ModelFailover 的 fixture 在旧代码失败：合法 reasoning 后真实 socket 中断不能生成既有 settled receipt。修后同一 fixture 通过，且 eof/transport 可识别，authentication、ping-only、half-frame 仍不能恢复。原线上失败没有保存原始 frames，本修复不能反向证明行情会话一定走了此分支。

官方核对（2026-11-01）：https://developers.openai.com/api/reference/resources/responses/streaming-events 。本代码仅适配上述事件，没有整体声称支持所有 Responses 工具/事件。

### 意图识别诊断

沿既有 tool-free utility → classifier → executionAdmission → 状态详情的数据流添加固定枚举原因，区分 timeout/cancelled/unavailable/transport/empty_response/invalid_json/invalid_schema/missing_continuation/missing_steps。只保存枚举，不保存 prompt、模型原文、endpoint 或密钥；旧记录仍显示原通用说明。8 秒时限不变，超时后迟到的返回不会成为有效意图。

诊断不作为权限：没有有效 intent 时仍为 INTENT_UNCONFIRMED，写入/派生任务保持拒绝，Read 仍可核查。添加实际 SessionStore 落盘 timeout 原因与写入拒绝的集成测试，以及展开详情显示准确原因的 DOM 测试。这是补足下一次原生失败的证据，不冒充已经修复识别模型的所有失败。

### 当前网络实测

2026-11-01 00:28（Asia/Shanghai），OpenRouter 公共 models API，无凭据/无推理：当前应用配置未显式代理的路径 3/3 HTTP200，既有 HTTP proxy 3/3 HTTP200。约 80–1228ms。结果保存在私有 network-current.json；未改代理配置。只能说明当前连通，不能证明之前 CONNECT_TIMEOUT 已根除，更不能代替推理和业务实测。

### 验证与发布门

本增量：16 Responses 语义单元 + 28 recovery HTTP 集成 + 2 buffered-progress 集成 = 46；66 session-execution 集成；17 状态详情 DOM，共 129 项定向测试。类型、定向 lint、分类和 diff 检查分别留有日志。此前44fd167由原owner独立复核2 DOM/68单元通过，现有联合CI运行中。

交付本增量精确SHA后由原owner重核最终候选，正式晋级仍须原四会话可继续及相关工作交付。无本开发线程新版本号、制品、tag或安装动作。尚不可宣称稳定性全部解决；下一步根据新包原生结果继续修复，而非清除未知证据。


## 第三批：按用户明确要求取消任务总时限

用户否决“恢复任务，再授权30分钟”的方案，明确要求去掉30分钟总限制。本次因此不新增续期动作/预算窗口/endpoint，不要求定期人工点击续期。原模型请求超时、工具权限和防重放不在取消范围内。

取消 SessionExecution 在父/子推理准入、工具门、任务包注册与派发、自动续跑、完成验收中的总时长比较。保留原deadlineAt序列化字段和旧写入格式以免破坏已有记录/旧版本reader；当前代码不会使用这个历史字段限制任务。旧记录不被离线重写，因deadline_exceeded停止的任务通过新的可信人工继续回到原execution，保留身份、原请求、任务步骤、已完成证据和操作保护。Stop、无进展/返工封顶、未知写入、错误owner、依赖/资源冲突继续拒绝。

特别区分：此前‘手动继续与一键继续’入场路径不同，不能把全部截图409归因于过期。本次取消时间门解决已确认的task-level time expiry；不授权一键继续改写其他执行限制，也不宣称四个会话已经真实恢复。

验证包括旧期限过去一天后真实owner自动派发下一步、旧超时任务同ID人工继续、active native child跨期限继续且Stop仍撤销；另有原资源/依赖/未知写入回归。网络单请求超时和模型重试仍独立覆盖。构建版本、安装和四会话业务验收由原desktop owner统一执行。

第三批最终验证：202项通过（任务策略/派发单元、Session执行/派发/编排集成、模型failover单元、真实HTTP请求超时集成），全量类型、定向lint、测试分类、diff检查通过。3个时间边界行为测试在7b7d0db原实现均失败，修后均通过，保留no-deadline-baseline.log。取消的是运行策略；兼容序列化字段仍存在，回滚到旧二进制会恢复旧版本的时间规则，不能当作当前规则继续验收。
