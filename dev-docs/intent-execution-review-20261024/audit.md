# MoXBots 意图执行闭环：独立代码审计与反方检验

任务 ID：`MOXBOTS-INTENT-EXECUTION-20261024`。审计线程：`01a169c4-6244-7143-8d84-a4a59d546aef`。日期：2026-10-24。

**结论：删除独立备用设置，能消除“指定备用覆盖自动同档候选”的冲突；当前实现仍未构成普通行动请求的意图执行闭环。** 自动路由确定的是难度档位、主模型和一个候选；任务拆解、何时委派、实际验收及普通会话的持续推进，仍主要依赖主模型主动调用工具。现有账本、原生执行身份、确认和防重放机制值得保留，缺口集中在它们之间的决策与接线。

同时必须纠正一种过度否定：**当前接管控制器能够在主模型首调零输出失败时切换候选，不需要故障模型先生成委派指令。** 本审计的无网络合成探针已验证这一点。它能修复推理可用性，不能因此证明建站、验收、返工和持久接续已经闭环。

## 1. 范围、代码基线与实际动作

- 权威源码：`本次审查分支的源码工作树`。
- 分支：`codex/unified-routing-20261024`。
- 开始读取时 HEAD：`fda7728fa11ee0b1138e9357b2b81e680f408043`，存在主会话的未提交清理改动；审计读取的是这些改动后的工作树。
- 最终核对 HEAD：`f7ea3565ac6b60da8e59ceb62dbb02e460937ad0`，工作树 `git status --porcelain=v1` 无输出。实现提交为 `0ddd2248dc0efe15215b6307814f0e1a44671754`；从该提交到最终 HEAD 的文件差异仅为 `.agent-sync/tasks/codex-unified-routing-20261024-af151ae1.md`，本报告涉及的实现没有在此期间变化。
- 已读取：适用 `AGENTS.md -> CLAUDE.md`、架构总览、Session、任务编排、Task Provider routing、Goal、系统提示、模型恢复/接管、上下文恢复和权限规范的相关章节；沿调用方检查实现和已有测试。
- 本线程执行了两组合成探针：纯函数状态/路由探针；`ModelFailoverController` 内存响应探针。都通过 `node --import tsx/esm --input-type=module` 执行，无 `fetch`、无真实模型、无真实工具或业务数据。
- 本线程只新增本文件；未修改源码、提交、推送、触发 CI/构建/发布、操作日常客户端、创建线程/子 Agent，未读取用户完整配置、凭据值或生产日志，未跨聊天发消息。
- 主会话报告的 243 项测试和浏览器验收，本线程没有复跑，不能记作本线程的独立验收。

To Do：

- [x] 核实仓库、分支、工作树与阅读规范。
- [x] 追踪输入、选模、拆解、委派、执行、验收、继续、恢复链路。
- [x] 对关键判断做只读反证探针。
- [x] 输出严重性矩阵、正确边界、最小补线及验收场景。
- [x] 复核最终源码基线及未写源码。
- [ ] 产品实现、真实供应商、签名客户端及生产业务验收：本线程范围外，未执行。

## 2. 事故事实与证据边界

下列为主会话提供的脱敏事故事实，本线程未重新访问已安装客户端或供应商：已安装 `0.5.19/build519.2`；会话 `6c46df7d-62f2-4afe-9258-089d8c1594a1` 的行动请求是把课程体系做成网站；路由 strong，主模型为 `RC-Claude-awsq/claude-opus-5-5`；经 right.codes 的请求在响应头前 `ECONNRESET`，映射 502，输出 0 字节；原独立设置 specified 指向 DeepSeekFlash，而跨档门禁拒绝该候选；编排 GET 返回 revision 0、空 tasks/attempts/reviews，supported=true。

这组事实支持“本次请求链路连接失败，主模型未发出工具调用，因此没有任务/子 Agent 启动”。它不证明模型服务本身损坏，也不证明编排代码发生异常。空账本正符合当前由模型工具调用产生任务的实现路径。新清理尚不能被当作已安装 519.2 的行为或本次业务已恢复的证据。

## 3. 实际链路：程序负责什么，模型负责什么

| 环节 | 当前实际路径与依据 | 程序裁决 | 仍依赖模型或未知 |
|---|---|---|---|
| 用户输入与授权 | Session-scoped API → Rust proxy → SessionEngine → adapter；[架构:145](../../specs/ARCHITECTURE.md#L145)、[权限 hook:12560](../../src/server/agent-session.ts#L12560) | Session/queue/Query 身份、模式、MCP、Stop 与工具权限 | 普通输入没有持久的“问答/只讨论/执行、范围、产物、完成条件”决策事实 |
| 分类和选模 | [classifier prompt:37](../../src/shared/autoRoute.ts#L37)、[routeTurn:108](../../src/server/auto-route/router.ts#L108)、[admission:143](../../src/server/auto-route/admission.ts#L143) | 接受三档分类；池成员、凭据/历史、暖缓存、模型与 effort 选择；CAS 防竞态 | 分类模型只返回档位，没有任务图、授权、验收或并行决策 |
| 任务拆解/计划 | [产品提示:313](../../src/server/system-prompt-cli-tools.ts#L313)、[观察/读取:67](../../src/server/session-engine/task-orchestration.ts#L67) | 保存模型显式产生的 Todo/Task、ensure、proposal | 模型是否拆解、是否写标记和验收条件；`requiresSessionPlan` 没有生产调用方 |
| 方案确认/开始 | [确认并物化:342](../../src/server/session-engine/task-orchestration.ts#L342)、[单次原队列启动:274](../../src/server/session-engine/task-orchestration.ts#L274) | 精确版本真人 proof、CAS、一次 claim、最终 native gate；不伪造确认 | 是否原本就无需新方案决策，当前依赖提示理解；计划内容的实际执行仍由模型决定 |
| 委派与执行 owner | [delegate policy:13](../../src/server/session-engine/session-plan-policy.ts#L13)、[Agent/Task hook:12564](../../src/server/agent-session.ts#L12564) | Runtime 执行；原 queue/Query/工具权限负责准入；未确认方案阻止该方案委派 | 是否并行、分工、文件互斥、具体模型组合与步骤依赖的执行约束 |
| 回传/验收 | [投影:158](../../src/shared/sessionTaskOrchestration.ts#L158)、[root receipt:377](../../src/server/session-engine/task-orchestration.ts#L377) | 子 Agent completed → awaiting_review；当前 root 命令/回执才写 review；attempt 和依赖校验 | 主 Agent 是否真正核对成果；evidence 是文字，没有可执行验收事实 |
| 返工/自动继续 | [普通终态:846](../../src/server/builtin-session/turn-lifecycle.ts#L846)、[Goal continuation:925](../../src-tauri/src/session_goal/manager.rs#L925) | Goal 有 durable continuation；普通 turn 按 Runtime terminal 收束；人工 review 请求走原队列 | 普通任务未验收、rework 或模型只给方案时没有业务完成驱动的自动下一步 |
| 故障/停止 | [接管:187](../../src/server/openai-bridge/model-failover.ts#L187)、[同档候选校验:47](../../src/server/builtin-session/model-failover.ts#L47) | 短重试、一个候选、30 分钟绝对恢复窗口、Stop/不确定动作 fence | 多候选故障域、整体费用预算与任务完成状态未汇成统一决策 |
| 持久恢复 | [冷恢复:1765](../../src/server/agent-session.ts#L1765)、[账本冷读:88](../../src/server/session-engine/task-orchestration.ts#L88) | Session metadata、native history、ledger、Goal 与动作证据各由原 owner 保存；unknown 不重放 | 普通行动意图/下一步没有统一持久入口；安全停下后不等于能自动完成业务 |

## 4. 按严重性排序的缺口矩阵

P1 表示对“已授权普通任务可靠完成”有直接影响，或存在执行/验收边界缺口；P2 表示可用性、可观察性或扩展治理缺口。本次没有证据支持新增 P0 或已发生数据损坏。

| 编号/性质 | 触发条件 | 当前路径与源码行号 | 用户后果 | 最小修正（沿原 owner） | 可验证测试 |
|---|---|---|---|---|---|
| **P1-01 设计/接线：普通行动输入没有执行决策事实** | “把课程做成网站”；或“只讨论怎么做”，两者难度都可能 strong | [难度分类:37–48](../../src/shared/autoRoute.ts#L37)；[路由结果:172–206](../../src/server/auto-route/router.ts#L172)；[结构化 plan requirement:37–53](../../src/shared/sessionPlanConfirmation.ts#L37) 仅定义及单测使用；[提示词发起:314–321](../../src/server/system-prompt-cli-tools.ts#L314) | 程序不能保证行动请求进入执行、讨论停在讨论；主模型未输出时既无任务目标也无业务进度 | 在原 SessionEngine admission 内形成有来源的执行决策，绑定原用户输入、queue、范围、预期产物、完成条件与所需新授权；写入原 taskOrchestration。语义模型可提议事实，程序校验授权后裁决。不要把所有复杂输入一律弹确认，也不要直接接入当前过宽的 requiresSessionPlan 来决定确认 | 同一难度的问答、方案讨论、已授权制作三种输入得到不同执行决策；首推理 502 时已保存原目标，接管后仍是同一任务；不伪造任务已开始 |
| **P1-02 设计/接线：Runtime final 没有业务未完成结算与继续** | 模型输出“下面是方案”后 success；或仍有 pending/awaiting_review/rework 时 final | [普通 completion:846–878](../../src/server/builtin-session/turn-lifecycle.ts#L846) 不读取任务验收；[计划启动:308–315](../../src/server/session-engine/task-orchestration.ts#L308) 只发送一次提示；[Goal 明确要求:72–80](../../src/server/system-prompt-cli-tools.ts#L72)；[Goal 真正继续:932–938](../../src-tauri/src/session_goal/manager.rs#L932) | 普通会话停在计划、待验收或返工，等用户再说“继续”；运行成功容易被当作用户任务完成。Goal 能继续，但不能补普通会话的缺口 | 保留 Runtime complete 的原含义；在原 terminal observer 结算任务结果，未满足验收时投影 incomplete，并在原 queue 排一次有界的继续/验收/返工；使用原 task/proposal 的 continuation identity 和 generation，Stop、待审批、后台 work、未知动作与预算均优先。无需自动创建 Goal | 假模型第一轮只返回文本、第二轮生成产物、第三轮验证；用户只发一次行动请求。第一轮只能结束 turn，不能完成任务；重复 terminal/重连仅排一次；问答、讨论、Stop 不自动续跑 |
| **P1-03 设计边界：proposal 未确认主要拦委派，未形成同范围 root 副作用门禁** | 主模型提出需要新确认的方案后，仍在同一授权不足的工作范围调用 Write/Bash/MCP；Session 为 auto/fullAgency | [delegate hook:12564–12575](../../src/server/agent-session.ts#L12564) 只检查 Agent/Task；其后 [plan-mode gate:12599–12614](../../src/server/agent-session.ts#L12599) 依赖独立 permission mode；proposal 不把 auto/fullAgency 自动改为 plan | 用户看见待确认方案，但 root 仍可能在模型误判下先改动。现有承诺明确覆盖委派门禁，不能扩大宣传为所有动作都被方案确认控制 | 把“当前 scope 是否已有执行授权”加在原 PreToolUse/adapter 的行动边界；对确需新决策且尚未授权的 proposal 范围，只允许规划/只读，对其它原 owner 已授权工作保持原准入。不能全 Session 改权限、不能全局禁止合理读取，也不能删除现有确认 proof | 同一原 queue 在待确认方案下 Agent、root Write、业务 MCP 写均被拒；Read 和合法方案文件仍可用；已授权且独立的 Task/Goal 不被别人的草案拦截；fullAgency 不绕过适用的新授权边界 |
| **P1-04 设计：步骤依赖、assignee 和并行冲突未进入准入** | 已确认 A→B，A 尚未验收，模型先启动 B；或两子任务写同一文件 | [steps:4–8](../../src/shared/sessionPlanConfirmation.ts#L4)；[物化:177–185](../../src/server/session-engine/task-orchestration.ts#L177) 不保存 assignee；[委派 policy:13–34](../../src/server/session-engine/session-plan-policy.ts#L13) 不接受 taskId；[blocked 投影:187](../../src/shared/sessionTaskOrchestration.ts#L187)；[依赖仅在 review 检查:233](../../src/shared/sessionTaskOrchestration.ts#L233) | blocked 主要是显示和事后验收约束；前置依赖未就绪时仍可能产生写入，assignee 标签不代表真正执行归属 | 将稳定 taskId、精确 attempt、依赖满足情况和最小写范围交给原 delegate/工具 admission；未知 task 不能冒领计划权限。并行仅在依赖与写范围相容时接纳；原 Runtime 调度，不添加第二 scheduler。人工 assignee 或计划标签不能当作真实 runtime handle | 合成已确认 A→B 显示 B blocked 时，B 的带 taskId 派发必须被拒；A 当前 attempt 验收后才放行一次；不同文件可并行、同文件串行；旧 attempt 回执不解锁 B。探针已证明当前全局 gate 在 A pending/B blocked 时仍为 true |
| **P1-05 设计：review 证明 root 身份，不证明验收事实；Goal complete 也未联动验收** | 主 Agent 没有检查产物却用任意文字 evidence accept；或 Goal 尚有未验收任务便声明 complete | [review DTO:11](../../src/server/routes/session-task-orchestration.ts#L11) 仅非空文字；[accept:228–236](../../src/shared/sessionTaskOrchestration.ts#L228) main 无 native attempt 可直接接受；[root receipt:377–403](../../src/server/session-engine/task-orchestration.ts#L377)；[Goal terminal:1155–1185](../../src-tauri/src/session_goal/manager.rs#L1155) 验身份和 aiCanExit，未读任务验收 | 子 Agent 不能自行验收，这是正确保护；但主 Agent 的错误自信仍可产生 completed/Goal complete，缺少产物或用户路径的证明 | 保留 root receipt；让验收引用原工具结果/产物摘要及验收项，程序核对当前 attempt、证据归属、新鲜度和必要检查结果。能机器判定的文件存在/测试/HTTP 路径使用对应验证器；不可自动判定的业务质量如实标待确认。Goal Complete 在原 owner commit 前核对适用必需验收，不能把 Rust 变成第二任务 store | 子 Agent 自报及复制 receipt 继续不能完成；主 Agent 只有文字而无必需证据也不能完成；产物检查失败、过期证据、新 attempt 均拒；Goal 的 aiCanExit=true 也不得绕过该目标关联的必要验收。纯函数探针已复现 main 在无执行/产物的合成状态下完成 |
| **P1-06 可用性设计：只选一个接管候选，不避共同故障域** | 同档 A、B 同一聚合网关不可用，独立 C 健康；或第一候选执行时才发现能力不兼容 | [候选 find:548–553](../../src/shared/autoRoute.ts#L548)；[单 ref 冻结:109–122](../../src/server/builtin-session/model-failover.ts#L109)；[长等待:264–288](../../src/server/openai-bridge/model-failover.ts#L264) 只重复 usingBackup 对应目标 | B 失败后可能消耗整个恢复窗口而不尝试健康 C；“池里还有模型”不等于系统会遍历。同 providerId 不足以发现共同网关，不同 providerId 也不保证独立 | 在原 route 决策中固定有序兼容候选列表，优先已知不同 endpoint/故障域；保留全局恢复 deadline、尝试上限和动作 ledger，每次取候选仍 fresh-check。若产品选择只允许一次接管，必须清楚显示未尝试 C 及原因，不能宣称自动池全面恢复 | A、B 同故障域、C 独立，合成 502 时有界到 C；同一 endpoint 不产生热循环；所有兼容候选都失败后保留进度并给停因/nextRetry/deadline；不自动跨档/换 Runtime。纯探针显示当前优先选同 provider B，控制器只接纳一个 backup |
| **P2-07 设计：跨模型外援与原生子 Agent 尚非统一执行尝试** | 期待配置多个模型后自动分工；主模型未能生成工具调用；或外援输出需要纳入验收 | [assist:1–8](../../src/server/auto-route/assist.ts#L1)；[runner:167–180](../../src/server/auto-route/assist.ts#L167)；[dispatch return:307–315](../../src/server/auto-route/assist.ts#L307)；[原生子 Agent 配置:12216–12231](../../src/server/agent-session.ts#L12216)；[bridge 子模型:1913–1917](../../src/server/agent-session.ts#L1913) | 外援是无工具、无会话历史的单次文本请求，非能接管建站的 worker；是否调用由主模型决定。原生 Agent model/alias 也不是跨 provider 的工作包路由，无 aliases 时 bridge 会统一强制当前模型 | 在原账本为协作工作包关联 target provider/model、能力、输入范围、attempt 与返回证据；外援仍可作为只读分析尝试，原生/其它 Session 执行仍由现有 owner 接纳。角色和模型分配属于执行决策，不能把所有池成员都启动，也不应把纯文本外援包装成已执行 worker | 已有授权且可并行的分析/实现分别留下模型及 attempt 回执；只有一个可用模型时单 Agent 完成；未启用/不可执行工具时明确降级；主模型首调失败先由原推理接管恢复，不能等它先提出外援 |
| **P2-08 实现活性缺口：已确认但 proven-not-dispatched 的计划缺少可见恢复入口** | 确认 CAS 成功后派发前失败，planStart 回到 pending；或确认后、进入启动前崩溃 | [guard.cancel:299–303](../../src/server/session-engine/task-orchestration.ts#L299)；[启动调用点:269/371](../../src/server/session-engine/task-orchestration.ts#L371) 仅确认路径；[UI submit:118–126](../../src/renderer/components/agent-status/OrchestrationPlanCard.tsx#L118) 与 [按钮:280](../../src/renderer/components/agent-status/OrchestrationPlanCard.tsx#L280) 仅 awaiting_confirmation；[合成现有测试:327–341](../../src/server/session-engine/task-orchestration.integration.test.ts#L327) 需再次 actOnSessionPlan | 计划已确认而未执行，卡片可显示排队/异常，但普通确认控件消失；恢复依赖新的会话指令/内部再次调用，不是持久自动推进 | 原 Session restore/queue reconcile 对已证明未发送的 pending 重用同 queueId 接纳一次，或提供同一幂等恢复 action；confirmed 不要求重复批准。claimed 丢 ACK 属未知，继续保留只读核对/显式恢复，不可当 pending 自动重放 | CAS 后、dispatch 前崩溃恢复可自动启动一次；双恢复并发只有一个 claim；native 已进入但 ACK 丢失仍 unknown 且零重派；UI 能区分可恢复未发送与结果未知 |
| **P2-09 设计：局部超时和统计不等于任务共享预算** | 自动继续、多模型协作、反复返工，费用或次数持续增长 | [Goal end conditions:150–165](../../src-tauri/src/session_goal/types.rs#L150) 仅 deadline/maxExecutions/aiCanExit，默认前两项空；[token 统计:862–865](../../src-tauri/src/session_goal/manager.rs#L862)；[assist 无 wall-clock:174–176](../../src/server/auto-route/assist.ts#L174)；[恢复窗口:22](../../src/shared/modelRecovery.ts#L22)；子 Agent 的配置 maxTurns 已有，不是共享预算 | 当前 30 分钟恢复窗口能限制等待；不能限制新 turn/外援/子 Agent 合计费用。不能在补自动继续时默认建立无限任务循环 | 使用原执行身份和账本保存/引用用户既有预算 policy、累计使用与有界继续次数；在原 inference/delegate admission 扣减/预留，未知价格不得伪造精确花费。暂停原因区分 budget、deadline、no-progress 与 waiting-user；不额外给合法审批等待强加倒计时 | 并发两个 child 争最后一次额度，只能一个获准；切模型/恢复/重启不重置额度；价格缺失显示 unknown；达到上限保留任务并停，Stop 无条件优先 |
| **P2-10 能力证据边界：协议/目录数据不足以宣称完整请求兼容** | 候选声明 openai/anthropic，但未证明工具功能；上下文容量或当前 token 缺失；主模型首请求失败没有 usage | [ModelEntity:99–108](../../src/shared/config-types.ts#L99)；[候选 validate:123–151](../../src/server/builtin-session/model-failover.ts#L123)；[contextTokens 来源:2073–2076](../../src/server/agent-session.ts#L2073) | 图像缺能力会拒绝，已有正确保护；工具主要验证传输协议，窗口只在双方数字已知时比较，未知时仍可能尝试。配置 available 不证明当时健康或真实能力 | 先把兼容性拆成 verified/declared/unknown，显示真实证据边界；按请求风险规定哪些未知允许有限尝试、哪些需确认/拒绝，不能一律把未知全禁导致池失效。关键工具和容量可用隔离供应商探针或已验收元数据提供能力证据；继续使用原 request/route owner | 图像未知继续拒绝；工具协议相同但不支持工具的候选不被称为已验证；无 usage 的首请求容量标 unknown；不足窗口明确拒绝；不得把模型命名或 HTTP 200 当作工具能力/完整验收 |

## 5. 针对架构线程方案的反方检验

“目标/范围/步骤/验收沿原方案账本，原输入/Task/Goal owner 给授权，原 turn/Query 持运行身份”方向成立，但存在三项必须补清的约束。

### 5.1 不能将自动计划伪装成人工 confirmed proposal

当前 `SessionPlanProposal` 只有 awaiting_confirmation/revising/confirmed；`isSessionPlanConfirmed` 明确要求 button/user_message 的同版本 proof。`commitConfirmedPlan`、delegation policy 和 planStart 均建立在此合同上。把“做网站”直接写为 confirmed，或生成一个假的 button/message evidenceId，会破坏现有信任边界；让模型调用 confirm_from_message 认领任意历史 user 行同样错误。

最小方案是在**同一个 taskOrchestration 的 owner 和 CAS** 内区分两类计划授权，而不是增加数据库或执行 owner：

1. 需要新的人类决策的 proposal：继续走当前原生 proof、精确版本、确认后物化规则。
2. 原输入已充分授权的执行计划：由原 admission owner 使用可信原输入及 queue/owner 身份，内部记录授权依据、范围和派生计划版本；可以直接 materialize 已授权任务。它没有“真人看过这份计划”的含义，不伪造 confirmation。CLI/模型不能通过自填 kind/source 字段取得该权限。

可复用现有 materialization/dispatch validator，但应抽出统一的“当前计划是否在有效执行授权内”判断；不要简单把 `isSessionPlanConfirmed` 改成对自动计划永远 true。范围变化、新外部后果或用户明确“先给方案”时，适用原确认链。`planSupport` 仍是当前 Runtime 原生能力事实，不能持久成授权或伪造 unsupported Runtime 的动态 gate。

制作本地网站在既有请求范围内可直接推进；收费、对外发送、新增公网暴露及生产业务写入等不从“做网站”自动推导为已授权。执行计划只解释原授权，不能扩大它。

### 5.2 自动继续必须接入原队列结算，不另起 Goal 或外层 while loop

普通 taskOrchestration 已能持久化任务、尝试和 review，但没有 durable 的业务执行/继续状态。仅把目标文字放进去、再多加一句“持续执行”提示不能填补 P1-02。最小补线应落在原 SessionEngine turn terminal 与原队列 admission：结算当前任务状态，原范围仍未满足且门禁允许时，排一个稳定身份的有界 continuation。

Goal 继续保留显式长期目标语义，不能为解决普通任务 final 提前结束而自动创建。已有 Goal 的 terminal 仍由 Rust owner 裁决；需要任务验收时从权威 taskOrchestration 读取校验快照/收据，不能复制一份 task list 到 Goal Store。原运行已在 native 后不确定时，不允许借“任务尚未完成”打开另一个执行或重放原用户输入。

### 5.3 多 Agent 不等于跨模型可靠执行

Native Agent/Task 的 spawn、route assist 的无工具文本分析、另一个已有 Session/Runtime 的执行是不同能力。可以统一工作包/attempt/证据表示，不能伪装成相同的工具权限、历史兼容或恢复保证。先补任务身份、依赖、验收和预算，再把可独立且有收益的工作分给真实可用 worker。当前源码没有依据保证“池中 strong 模型”一定能作为任意子 Agent 的跨供应商工具执行目标。

## 6. 已执行反证与结果

### 6.1 纯函数探针（无文件/业务动作）

导入实际 `sessionPlanConfirmation.ts`、`sessionTaskOrchestration.ts`、`session-plan-policy.ts`、`autoRoute.ts`，构造 synthetic Session、真人确认形状的**测试 fixture**，其中 A pending，B 依赖 A；仅在内存中执行函数。这不是生成真实人类 proof，也没有调用真实写入入口。

实测输出：

```json
{
  "planRequirement": true,
  "dependencyPhases": [{"id":"a","phase":"pending"},{"id":"b","phase":"blocked"}],
  "globalDelegationGate": true,
  "acceptWithoutArtifactOrExecution": "completed",
  "pickedBackup": {"providerId":"gateway-x","model":"backup"},
  "thirdCandidatePresent": true
}
```

含义限于：当前纯 policy 可同时显示 B blocked 并开放全局委派；main review 没有内建产物 verifier；候选选择不偏好独立供应商。它不证明真实系统已发生越权写入或错误验收。`rg -n 'requiresSessionPlan|SessionPlanRequirement' src` 的实际命中仅函数定义、类型定义和单测，无生产接线。

### 6.2 推理接管控制器探针（execute 回调只返回内存 Response）

导入实际 `ModelFailoverController`，短重试延迟在 fixture 中置 0；primary/backup 使用 `.invalid` 作为身份标签，没有发网络请求。`recovery.wait` 为合成 hook，返回 undefined，不代表生产已执行持久等待。

| fixture | 实测请求序列 | 实测结果 | 能证明的范围 |
|---|---|---|---|
| primary 每次 502，backup 成功，首调前无模型输出 | P、P、P、P、B | HTTP 200，switches=1，waits=0；断言通过 | 当前控制器能在首次输出前接管，无需主模型发出委派 |
| primary 与唯一 backup 均 502 | P×4、B×4 | 最终 502，switches=1，waits=1；断言通过 | 既有短预算各用一次；之后请求原 recovery hook，未访问第三候选 |
| canRetry=false | P | 最终 502，switches=0，waits=0；断言通过 | retry fence 不会被候选可用性绕过 |

现有测试源码也提供重要反证：[子 Agent receipt 不能完成:56–82](../../src/server/session-engine/task-orchestration.integration.test.ts#L56)、[确认一次启动:239–248](../../src/server/session-engine/task-orchestration.integration.test.ts#L239)、[丢 ACK 不重派:309–325](../../src/server/session-engine/task-orchestration.integration.test.ts#L309)、[异步校验后 Stop/撤权:14–37](../../src/server/openai-bridge/model-failover.unit.test.ts#L14)。这里只确认测试表达了这些约束，本线程未运行这些测试。

## 7. 不应删除或放宽的正确边界

1. **Stop、撤权、待审批先于继续/换模型。** 自动路由成功或“任务未完成”均不能取得新执行授权。不要换 Session/Query/线程来绕过。
2. **结果未知不是失败证明。** 写入、发送、提交或部署的结果未知时，保留原 ledger/fence，由原 owner 只读核对；核对不清必须暂停。不能为了闭环而自动重放。
3. **订阅/托管/scoped 与普通 API 凭据不能混借；history-family 不兼容不能直接续接。** 池中有模型不代表它是当前请求的合法接管目标。
4. **子 Agent completed 只到 awaiting_review。** Root tool receipt、精确 attempt、旧 Query/旧 activation 拒绝均应保留。P1-05 是增加验收事实约束，不是废除已有 root gate。
5. **新方案确有决策需求时保留真人 proof。** 不把所有复杂任务强制再确认，也不把已有授权解释成可以忽略明确的方案等待。
6. **Runtime unsupported 如实拒绝。** Codex/外置 Claude Code 当前不能承诺新的同轮强方案 gate；不能靠提示词、启动快照、事后通知替代。已授权普通任务和 ensure/bind/review 不应因此被一并禁用。
7. **只对可恢复可用性错误做推理重试/接管。** 当前 [状态集合:9–12](../../src/shared/modelFailover.ts#L9) 不将普通参数/权限问题当作模型不可用。工具参数错应修工具路径，不能盲换模型掩盖。
8. **全兼容池不可用时应有界等待并可解释地停下。** 显式空池不得偷用移出池的模型；不能自动跨档、改 Runtime、扩费用或绕过凭据限制。
9. **持久恢复有证明范围。** [liveProof 冷恢复拒绝:1777–1792](../../src/server/agent-session.ts#L1777) 和 claimed 丢 ACK 进入 unknown 是有效保护；P2-08 只补已证明未发送的恢复。
10. **不把技术终态包装为业务验收。** HTTP 200、模型 final、工具返回、截图和 CI 都只证明对应层级；远端主干、制品、安装、真实 Provider 和用户路径分别验收。

## 8. 推荐实施顺序与完成标准

### 第一批：保留本次局部修复，先形成一条普通任务最小闭环

- 接受已完成的同档自动候选清理，不恢复 off/specified/crossTier 第二套配置。
- 在原 admission 和 taskOrchestration 中补 P1-01 的输入/授权/目标/验收关联，按第 5.1 节区分内部自动计划与人类待决 proposal。
- 在原 terminal/queue 中补 P1-02 的 incomplete 结算和有界继续，不创建 Goal/新 store/新 scheduler。
- 同批补 P1-05 的必要证据校验，防止“自动继续到一段自信文字就 completed”。

完成标准：用户一次发“用已有课程做成本地网站”，系统保存同一目标，首模型 502 可同根接管，模型仅出计划不能完成任务；最终产物存在、可打开、关键链接/导航经工具验证后才完成。原始请求没有公网发布授权时，本地交付可完成，不把公网发布当作应默认执行的下一步。

### 第二批：让计划成为真实执行约束

- 补 P1-03 的 root 同范围动作授权检查。
- 补 P1-04 的 taskId/依赖/写范围/真实 assignee 准入。
- 将可用的 native worker 和纯文本 assist 统一关联到原 task/attempt，但保留各自能力边界（P2-07）。

完成标准：A 未验收时 B 不可派发产生副作用；无冲突工作包可以并行；子 Agent 回传必须待验收，失败或拒绝产生同 task 的新 attempt；无可用 worker 时单 Agent 可继续，不能假称已并行。

### 第三批：恢复、预算和多候选韧性

- 补已证明未派发的 pending 恢复（P2-08），继续保持 unknown 不重放。
- 在增加自动继续/多候选前明确共享预算（P2-09）。
- 原恢复控制器增加有界候选链与故障域选择（P1-06），不增加绝对恢复窗口、不重置工具 ledger。
- 标明能力证据强度与未知（P2-10）；补配置就绪和真实健康的区分。

完成标准：重启、双恢复、Stop 与最后一次预算竞争均幂等；同网关故障时可按已授权策略尝试独立兼容候选；所有候选耗尽后明确停因和解除条件，保留原任务进度，不重复业务动作。

### 发布和真实验收

本报告不分配版本、不触发共享 CI 或发布。桌面/macOS/updater 仍沿既有唯一发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 处理；清理提交 `0ddd2248dc0efe15215b6307814f0e1a44671754` 与 handoff `f7ea3565ac6b60da8e59ceb62dbb02e460937ad0` 是源码证据，不等于用户已安装版本包含。

必要验收分别保留：pure policy、原 SessionStore 磁盘/CAS、实际 adapter/mock-native、隔离 loopback SDK、签名制品原生界面、真实 Provider、获授权测试账号及真实产物/用户路径。对本次原会话只做经授权的恢复，不能为了测试重放原始网站制作任务或未知工具动作。

## 9. 仍具体未知的事项

- 本线程没有真实供应商请求证据，不能判断 right.codes 当前健康、模型服务根因或新清理能否在用户那一轮实际成功接管。
- 未读完整用户配置，不能断言事故当时的其它同档候选全部具有兼容历史、工具和容量能力，也不能断言其费用授权相同。
- 未启动已安装 519.2、签名新制品或日常客户端，不能将源码推断当作当前用户界面的实际行为。
- 普通未完成任务依靠模型自觉能做完的概率未知；本报告没有编造成功率或“多模型提升比例”。
- 探针只验证已列纯 policy/控制器行为；未证明真实写入、跨进程 exactly-once、UI 停止传播、真实文件互斥或生产业务验收。
- 方案中某些验收项最终需要人工业务判断。系统应明确待验收原因与已有证据，不应宣称通用机器 verifier 可以判定所有内容质量。

## 10. 普通任务跨 turn 推进的最后边界

“复用原 SessionEngine terminal/queue”是建议补线的位置，不是对现有实现已具备自动任务闭环的描述。不能仅在 final 回调追加一条“继续”消息便宣告修复；至少满足以下约束：

1. **原 turn 真实结束，任务可仍未完成。** 保持 Runtime complete 的原含义，并在原 taskOrchestration 中分别保存业务验收状态。未完成不等于模型故障，不触发不适用的供应商重试/切换。每个后续 turn 使用新的正常 queue/turn 准入身份，关联原任务与授权；不得复用已终结 root 的 inference lease、放开旧请求 fingerprint 或伪造“仍为同一 native turn”。首调失败时的同根推理接管与这种跨 turn 推进须分清。
2. **继续意图先持久化，再由原队列认领。** 继续请求的稳定身份至少绑定任务/计划版本及已结算的前序 turn，写入原 SessionStore metadata CAS 后由原 SessionEngine queue 接纳。重复 terminal、SSE 重连和恢复读取不能各产生一次继续；重启只恢复已证明未发送的 intent。native 已进入而回执丢失仍按 unknown 处理，不能靠“任务未完成”重派。
3. **原授权和最新用户控制持续有效。** 新 turn 必须复核原范围、适用确认、Stop/撤销、待审批、后台执行、当前任务 attempt 和预算。后来的用户输入可改变或终止原任务，不得被后台继续覆盖；输入的 source 标签、模型叙述或 persisted confirmed 状态都不能自行证明新的 native 准入。改变范围或增加外部后果需沿适用的原确认入口。
4. **进度和费用边界随任务累计。** 新 turn、换模型或进程恢复不重置任务的继续次数、无进展次数和预算。何为进展由产物/步骤/验收事实解释，输出更多文字或重试计数增长不能独自证明推进。达到边界时保留 incomplete 与具体原因，不能伪记 completed，也不能把合理等待用户计成模型失败。
5. **不承诺当前 owner 生命周期之外的无人值守。** 已接纳的继续按现有 Sidecar owner 生命周期保活；关闭 Tab、App 退出、休眠及冷恢复分别受现有合同约束。若需要延时唤醒、持续长期运行或其它后台调度语义，仍走用户明确启用的 Task/Goal 能力，不在 renderer、计时器或第二队列中暗建同类调度器。
6. **显式 Goal 保持原管理链。** 已有 Goal 的 turn 结算、控制和继续仍由 SessionGoalManager 决定；普通任务的有界推进不自动创建 Goal，不向 Goal Store 复制任务账本，不把同一份待办同时交给两个 continuation producer。

这一补线无需新增数据库、执行 owner 或 scheduler，但必须扩展并验证既有 owner 内的持久准入与幂等状态，不能只修改提示词。

本次审计的完成物是此报告和上述可复核探针结果；代码修复、主干合入、发布与真实验收均未由本线程执行。
