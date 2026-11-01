# 普通会话的意图执行闭环

任务：`MOXBOTS-INTENT-EXECUTION-20261024`。本规范描述候选源码；发行与真实业务验收以统一发布记录为准。普通聊天无需为了多步骤工作另开 Goal。

## 归属与准入

原 Rust `/chat/send` 对真实用户输入的可信记录、原 SessionStore task orchestration ledger、SessionEngine facade、builtin queue 和 SDK hooks 共同提供事实。`session-execution.ts` 没有独立调度循环或新数据库，`session-execution-wake.ts` 只保存进程内原 owner 的唤醒回调。

普通桌面输入只有在 `clientRequestId` 与可信原文摘要匹配时进入意图准入。原账本在分类前原子保留 accepted queue；同一个请求的并发重复、跨其他输入后的重试均返回原 queue 的重复准入错误。助手文字、附件、工具输出和内部续跑不能成为新的人类授权。

一键继续携带 `continueFromTurnId` 时也进入同一可信输入准入，分类确认的 `continuationOf` 由既有执行 owner 绑定原执行、清单及证据；不能只恢复 transcript 而跳过执行账本。facade 在异步分类前捕获原 transcript 代次与 turn，在提交时组合原 continuation guard 与新 execution guard，并使用新 queue 身份排除自己的队列占位。继续输入的可见 root 在同步 commit 接纳后才创建，否则会让自己的新消息提前使原 turn 校验失效。旧 turn 改变、重复点击、Stop 或执行保护拒绝仍不得进入 SDK；准备阶段被拒绝时释放原执行准入。

分类使用当前运行时的 tool-free utility，单请求最多60秒（包括初始化），直接 builtin transport 提供4096输出token供推理与完整JSON共用；可选建议仍保持8秒/1024输出token。供应商 stop_reason=max_tokens 被记录为 output_limit，即使截断文本看似JSON也不授权、不自动重试。输出受 schema 约束的 `answer/plan/execute/control`、目标、范围和验收条件。用户明确要求行动时采用 execute；只讨论、先给方案、不开发仍采用 plan。原始用户文本单独保留为 visibleText，执行提醒不伪装成人类输入。分类失败记录 `INTENT_UNCONFIRMED`，不获得自动续跑资格。此版本普通行动闭环仅接入 builtin；外部 CLI 与 DSH 不因分类结果获得这套自动续跑能力。

真人原话与执行上下文分开：facade 不向 `text` 追加执行提醒，builtin adapter 通过仅运行时的 `runtimeReminder` 将产品指令作为独立文本块送入 SDK。原 transcript、用户回声与队列预览保留用户正文。经原文摘要验证的输入允许在执行 guard 前先由原 user surface 持久化并推送，再由原 guard 创建/接续账本卡片；排队输入在晋级时遵守同一顺序。该标记不向 Goal/基础设施隐形准入开放，也不绕过 Stop、取消或最终 dispatch commit。准入被拒绝或停止时保留真实用户发言，但不会送入 SDK。自动接续使用纯隐藏 `SESSION_EXECUTION` 系统提醒，不生成新的可见人类发言。

执行意图不扩大权限。原权限请求、AskUserQuestion、停止、配置撤销、工具权限与所有业务 owner 继续裁决动作。明确答复/讨论/控制的当前 builtin 队列只放行只读及适用的方案记账，不能启动写入或子 Agent。

首发 Chat 在发送前通过既有 pending-session materialization/adoption 建立归属；同一 pending 的并发建立复用同一 promise，失败保留输入。已建立归属的会话不重建；Goal 首发复用该结果。

## 实际执行前的 To Do List

新 execute 分类必须返回原授权范围内的有序 `steps`；单个动作保留一个步骤，不人为拆成多步骤。读取 legacy intent 时此字段可缺失。至少两个步骤时，原 native `beforeDispatch` 在同一 metadata CAS 内先写入正式 `tasks/plan`，再允许原队列进入 Runtime。列表不依赖模型先自发调用 Todo 工具，也不创建 proposal 或伪造人类确认。真正只讨论方案的请求仍保留原确认流程。

`executionAdmission.taskPlanId` 和 `task.workPlanId` 仅标识同一列表，不构成新的执行权限或 scheduler。Server 分配稳定 `[task:work:<planId>:step-N]`，首步随原队列启动进入运行中；模型读取现有清单，用原生 TodoWrite/TaskCreate/update_plan 及同一标记持续同步。TaskCreate 返回的原生 ID 只用于原生 TaskUpdate。明确新增的细分任务先通过原 `ensure` 登记，同步仍保留缺省步骤；不得按标题猜关联。分类为单步的请求仍可沿原生工具建立后来发现的待办。

native producer 以当前原 queue 身份提交更新，先规范化精确 marker 再合并。DSH 原生 task ID 与产品 ID 不同，外置 Claude Code 的成功根 Todo/Task 结果也接入原观察者。未标记、旧 queue、整段历史 GET 和迟到事件不能覆盖当前清单；新目标保留旧记录但隔离展示。同一 builtin execution 的人工/自动接续复用任务身份和进度，不重新确认或重置自动重试计数。外部 Runtime 的列表预建及同步不赋予 builtin 的自动续跑能力。

原生 completed 仍只进入待验收；子 Agent 仍须对应 attempt 的根验收。builtin 的整体验收在成功根证据及真实持久化终态通过后，可以同时结清本次原清单中的主 Agent 步骤；不能通过 Todo 完成、失败/未知工具或未结清的后台任务提前完成。Task 工具仅记进度，不作为业务写入或验证证据。

## 持久状态与续跑

`execution` 位于现有 task ledger，包含原请求、意图、阶段、兼容旧版本的历史 deadline 字段、轮数、返工数、无进展数、当前 queue 和唯一 continuation。状态为 running、awaiting_review、rework、paused、incomplete、completed。

原 turn terminal 先保存 transcript，再通知执行 owner。无法确认保存成功时按 `TRANSCRIPT_PERSISTENCE_FAILED` 终止，不能根据模型的完成文本继续。重复或旧 queue 的 terminal 不重复派发。

普通 execute 不以固定总轮数或固定任务总时长作为完成进度和停止条件；轮数仅用于诊断。用户于2026-11-01明确要求取消30分钟总时限，父任务、子任务、原生推理、工具、接续及验收都不再读取历史deadline作为执行门。历史deadline字段及其旧写入格式只为数据/回滚兼容保留；新旧任务在当前版本都不因这个时间戳过期。仍保留返工评审计数上限三次、连续两次无进展、Stop、权限、未知操作和资源归属保护；单次网络请求/模型故障恢复的有界等待和重试不属于任务总时限。

没有真实验收时，终态创建一条 pending continuation，经原队列完成 pending → claimed → dispatched。续跑仍是原 desktop owner，不冒充定时 Task。进入队列和最终 commit 均复核执行 ID、当前 queue、Stop、新用户输入、权限等待、其他队列、后台任务、无进展和返工限制及原操作保护。

原 SDK 后台完成/静默事件唤醒同一 owner，无需 UI 轮询。正在运行的后台工作保留 pending；unknown 则暂停。进程恢复时只有已证明尚未派发的 pending 能继续。claimed/dispatched 或原轮结果无法确认时显示明确未知原因，不能重新发送任务。

阻塞当前交付的原生后台工作未结束时，即使根 Agent 已读取中间产物并提交 accept，也不能显示完成；保留 pending，待后台结束后在新队列重新读取并验收。验证证据必须在 PreToolUse、成功 PostToolUse 和根终态三个观察点对应同一个原生 Query/后台代次；仅后台集合变空不替代原生终态，缺失身份或未知生命周期不能获得验证资格。后台在读取后、根终态前完成时，旧读取也必须失效；工具本身的成功事实保持不变。运行时明确标记为不阻塞接续的 detached 工作不会因此阻止已验证的交付。

Stop 和新输入同步撤销进程内 capability，再异步记账；所有异步工具准入返回前再次检查该 capability。旧回调带执行/queue scope，不能暂停或恢复后来的输入。

## 验收与返工

每个原生根工具调用在原 Pre/PostToolUse hook 中按调用 ID 记录开始、完成、结果摘要和顺序。子 Agent 自报、分析文字、Todo 状态不成为根验收证据。最多保留四百条事实；达到上限明确停止，不淘汰未知动作来腾空间。

失败终态与结果未知分开：Bash 的正常非中断退出由既有 ContextRecovery 原生回执与 operation journal 先耐久结算（`bash-exited` / `returned, bash-exit`），再通知 execution owner，保留 `successful=false`，但不再永久 `pending`。退出码识别沿用原 owner 的严格合同，任意工具错误、超时/信号、中断或缺乏原生 admission 的结果不获得该资格。原命令仍受精确操作防重复保护，不因任务记账更新而重新执行。

历史 pending Bash 只在新的可信人工输入准备阶段通过原 builtin Session mutation owner 核对：已有原生退出回执、对应 operation attempt、SDK 当前选中链中唯一 tool_use/tool_result，以及 execution 原工具名/参数/结果完整摘要必须一致。跨读取与落盘再次校验 Session/Query owner、execution ID、原操作账本摘要；改变或缺证据均保留保护。对账仅更新已证实失败的执行事实与对应暂停原因，不写原 ContextRecovery 操作账本、不改成功状态、不自动发起模型或旧命令。读物理日志、普通错误文本或一个退出码本身均不具备核销资格。

根 Agent 通过原 CLI 查询真实账本，并提交结构化 `execution_review`，包含每条验收条件的 toolUseIds。HTTP 提交仅暂存随机 receipt；必须由当前根队列真实执行的直接 CLI 命令，在 PostToolUse 收到匹配内容与 receipt，才能提交该评审。复制 receipt、子 Agent 命令、旧 queue 和拼接 shell 均无此权力。

accept 要覆盖全部条件，并引用成功的根只读验证：Read、Grep、Glob、WebFetch 或 WebSearch。验证必须在所有可能修改完成后才开始。Write/Edit/Bash/MCP 结果本身不证明产物通过验收；运行测试可写报告，然后根 Read 读取并判断。结构化门禁证明证据归属和新鲜度，具体内容是否满足业务条件仍由根 Agent 审查，不能把格式合格当成任意业务的自动真值证明。

成功评审 receipt 明确返回 `settlement=native_turn_terminal` 和 `nextAction=finish_current_reply`。根 Agent 给出产物位置、检查结果或具体阻断后结束该轮；宿主在持久终态中结算 accept/rework。不能在同一轮等待 completed 或反复提交评审，返工修复由后续 fresh queue 处理。

缺评审或证据不全进入 awaiting_review；评审要求 rework 则修复后重新核验。真正缺权限或用户判断时 paused，并保留具体原因。可能修改的工具失败/丢失回执、未知子任务、持久化失败不能自动重放。界面只有账本已通过验收才显示完成。

## 有约束的多 Agent

执行中的根 Agent 可通过原 task CLI 登记 package，绑定当前 execution、task、assignee、依赖、只读/写入路径和选择理由。资源为工作区内相对路径；目录与父子目录按包含关系冲突，read/read 可并行。真实路径/最近存在的父路径校验阻止软链接逃逸。

原 Agent/Task 工具的 description/prompt/message 每个非空字段都必须以同一精确 task marker 开头，`subagent_type` 必须等于 package.assignee，且 `run_in_background:true`。同时最多两个任务包，总共最多六次启动、每任务最多两次 attempt。仅当依赖已验收、资源不冲突、当前执行仍有效且预算足够时放行。根 Agent 可在后台工作进行时通过原严格 CLI 登记新的独立包，但不能据此运行不透明 shell。没有合适包或身份不明时由根 Agent 执行，不为了显示并行而创建 worker。

子工具身份来自原 Query 的 native background registry 与 launch toolUseId；有身份的子 Agent 才能写 package 声明路径。缺身份仅可在无冲突范围只读。子任务不执行不透明 Bash/MCP、嵌套派发或生产动作，根 Agent 负责这些步骤。

后台推理没有逐请求 agent_id，因此同 Query 有 managed 活动 claim 时，所有 active native rows 都须精确归属当前 execution 且仍 reserved/running，才能沿用父任务的活动权限。缺 launch ID、混杂旧 execution、unknown/已结束身份都拒绝，不能因当前另有精确新 root 而升级旧子任务权限。完全没有 managed 活动 claim 的 legacy 后台沿旧策略；背景清空后历史 unknown 仍保留资源锁，但不会阻断新 root 的无关推理。

启动成功 ACK 只表示 running，不能释放资源。只有带 nativeLifecycle 的真实匹配 attempt completed 才能 settled；转录推断、UI 读账本、自然语言完成均不能释放。failed/interrupted 或不确定写入成为 unknown，迟到成功 ACK/完成事件不能自动解除。根 Agent 可只读核查未知范围，但仍不能写入冲突路径。最终还须根 Agent 对 task 及整个交付验收。

此处使用原 SDK subagent 模型能力；不代表已经实现任意外部 provider/model 组合的独立 worker。模型故障恢复见 [model_failover.md](model_failover.md)。

## 证据与发行

纯 FSM、原 ledger/queue 集成、资源策略、模型链、DOM/helper 和真实 SDK 合成供应商分别测试；合成供应商不证明真实模型遵循交付协议，helper 不证明完整 Chat 页面和 Rust 控制链。

统一验收记录见 [intent-execution-20261024/acceptance.md](../../dev-docs/intent-execution-20261024/acceptance.md)，UI 证据见 [session-execution-ui/acceptance.md](../../dev-docs/session-execution-ui/acceptance.md)。原桌面/combined CI/main owner 统一选择 0.5.21 候选，完成精确源码 CI、签名制品、实际普通聊天交付/返工/Stop/重启未知结果不重放的验收，才可宣布整体交付。


## 同任务的人工接续与状态投影

可信人工输入仍由原意图分类与 native turn-boundary admission 处理。分类必须明确返回 `continuationOf`：同一未完成任务返回原 execution ID，新目标返回 null。分类缺字段或失败不推测任务关系，不自动获得持续执行能力。分类只暂存，实际派发时在现有 ledger 串行 CAS 再核实原 ID、前轮真实终态与停止/预算/未知写入门禁。

同任务接续更新当前人类 request ID 与 queue，轮数仅累加一次；原 execution ID、原始请求、目标、范围、验收条件、startedAt/deadlineAt、返工/无进展计数、实际工具证据、任务包与 delegation launch 预算全部保留。清除上一轮 continuation、评审提案与 assessment，必须重新提交本轮真实评审。重复 guard 幂等，旧 queue 的终态、取消或负 ACK 不作用于新 queue。若分类时的任务已完成/被新目标替换，拒绝该接续，不能回退为新 execution。普通“继续”可在原身份与真实终态验证后恢复仅因历史deadline_exceeded停止的任务，连续无进展/返工上限只禁止自动空转：新的可信人工输入可沿原 execution 恢复一轮，计数不重置；本轮无新进展则再次停止自动续接，返工已封顶时未获真实验收也停止。仍不得绕过未知写入、未结算前轮、权限/后台等待、Stop、业务阻断或重复输入。Stop 后真实终态仅补记结算凭据，不解除暂停；transcript 持久化失败保留未知结果并拒绝自动接续。

`SessionTaskSnapshot.executionRecovery` 是已有 ModelRecoveryState 的只读投影，只有 builtin 当前 execution queue 匹配才返回 turn/status/attempt/lastStatus/nextRetryAt，不复制 routeIdentity 或 native session 身份，也不写入 ledger 或另建调度器。原有快照读取可在 ledger revision 不变时更新 recovery；ledger SSE 不能捏造/抹除它。界面仅在当前 queue 的 running/rework 上显示模型等待/恢复暂停，执行终态优先。摘要不再显示第 x/8 轮；详细信息中的已执行轮数不表示任务完成率。生产真实路径验收由原部署单元负责人随下一候选批次完成。


## 原生评审回执未确认的接续

任务 review 与 execution_review 的 success/pendingMainAgentReview 仅代表提案；原根工具完整回执才可提交验收。系统指引要求单独直接CLI命令及完整JSON，禁止Python/子进程包装、Shell组合和截取success后声称验收。上一queue有未确认提案时，自动接续明确要求仅重新提交本轮评审并结束回复，不重做已有业务步骤、不沿用旧回执，所有真实证据检查保持。历史错误文本和旧deadlineAt不构成当前整段会话封锁依据，独立只读核对仍须实际尝试，未知原操作不可重放。

提案发生时只关联当前queue唯一pending根Shell为reviewProposalCarrier；并发/无主工具/非Shell不归因。该fact保留完整证据、mutating/pending和未知保护，仅其回执波动不计进展，独立成功业务facts照常计入。纯评审空转沿既有noProgress上限停止；正确回执、人工继续与原证据保留，不恢复任务总时限。
