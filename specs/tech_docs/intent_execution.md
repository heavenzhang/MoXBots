# 普通会话的意图执行闭环

任务：`MOXBOTS-INTENT-EXECUTION-20261024`。本规范描述候选源码；发行与真实业务验收以统一发布记录为准。普通聊天无需为了多步骤工作另开 Goal。

## 归属与准入

原 Rust `/chat/send` 对真实用户输入的可信记录、原 SessionStore task orchestration ledger、SessionEngine facade、builtin queue 和 SDK hooks 共同提供事实。`session-execution.ts` 没有独立调度循环或新数据库，`session-execution-wake.ts` 只保存进程内原 owner 的唤醒回调。

普通桌面输入只有在 `clientRequestId` 与可信原文摘要匹配时进入意图准入。原账本在分类前原子保留 accepted queue；同一个请求的并发重复、跨其他输入后的重试均返回原 queue 的重复准入错误。助手文字、附件、工具输出和内部续跑不能成为新的人类授权。

分类使用当前运行时的 tool-free utility，最多八秒，输出受 schema 约束的 `answer/plan/execute/control`、目标、范围和验收条件。用户明确要求行动时采用 execute；只讨论、先给方案、不开发仍采用 plan。原始用户文本单独保留为 visibleText，执行提醒不伪装成人类输入。分类失败记录 `INTENT_UNCONFIRMED`，不获得自动续跑资格。此版本普通行动闭环仅接入 builtin；外部 CLI 与 DSH 不因分类结果获得这套自动续跑能力。

执行意图不扩大权限。原权限请求、AskUserQuestion、停止、配置撤销、工具权限与所有业务 owner 继续裁决动作。明确答复/讨论/控制的当前 builtin 队列只放行只读及适用的方案记账，不能启动写入或子 Agent。

首发 Chat 在发送前通过既有 pending-session materialization/adoption 建立归属；同一 pending 的并发建立复用同一 promise，失败保留输入。已建立归属的会话不重建；Goal 首发复用该结果。

## 持久状态与续跑

`execution` 位于现有 task ledger，包含原请求、意图、阶段、绝对 deadline、轮数、返工数、无进展数、当前 queue 和唯一 continuation。状态为 running、awaiting_review、rework、paused、incomplete、completed。

原 turn terminal 先保存 transcript，再通知执行 owner。无法确认保存成功时按 `TRANSCRIPT_PERSISTENCE_FAILED` 终止，不能根据模型的完成文本继续。重复或旧 queue 的 terminal 不重复派发。

一次 execute 最多八轮、三次失败返工、连续两次无进展、三十分钟。后续原生轮次、模型故障恢复和任务包使用父执行的同一个绝对 deadline，不因换模型或新 queue 重开时间。验收可在已准入的最后一轮完成；预算只阻止启动更多轮次。

没有真实验收时，终态创建一条 pending continuation，经原队列完成 pending → claimed → dispatched。续跑仍是原 desktop owner，不冒充定时 Task。进入队列和最终 commit 均复核执行 ID、当前 queue、Stop、新用户输入、权限等待、其他队列、后台任务和时间预算。

原 SDK 后台完成/静默事件唤醒同一 owner，无需 UI 轮询。正在运行的后台工作保留 pending；unknown 则暂停。进程恢复时只有已证明尚未派发的 pending 能继续。claimed/dispatched 或原轮结果无法确认时显示明确未知原因，不能重新发送任务。

Stop 和新输入同步撤销进程内 capability，再异步记账；所有异步工具准入返回前再次检查该 capability。旧回调带执行/queue scope，不能暂停或恢复后来的输入。

## 验收与返工

每个原生根工具调用在原 Pre/PostToolUse hook 中按调用 ID 记录开始、完成、结果摘要和顺序。子 Agent 自报、分析文字、Todo 状态不成为根验收证据。最多保留四百条事实；达到上限明确停止，不淘汰未知动作来腾空间。

根 Agent 通过原 CLI 查询真实账本，并提交结构化 `execution_review`，包含每条验收条件的 toolUseIds。HTTP 提交仅暂存随机 receipt；必须由当前根队列真实执行的直接 CLI 命令，在 PostToolUse 收到匹配内容与 receipt，才能提交该评审。复制 receipt、子 Agent 命令、旧 queue 和拼接 shell 均无此权力。

accept 要覆盖全部条件，并引用成功的根只读验证：Read、Grep、Glob、WebFetch 或 WebSearch。验证必须在所有可能修改完成后才开始。Write/Edit/Bash/MCP 结果本身不证明产物通过验收；运行测试可写报告，然后根 Read 读取并判断。结构化门禁证明证据归属和新鲜度，具体内容是否满足业务条件仍由根 Agent 审查，不能把格式合格当成任意业务的自动真值证明。

缺评审或证据不全进入 awaiting_review；评审要求 rework 则修复后重新核验。真正缺权限或用户判断时 paused，并保留具体原因。可能修改的工具失败/丢失回执、未知子任务、持久化失败不能自动重放。界面只有账本已通过验收才显示完成。

## 有约束的多 Agent

执行中的根 Agent 可通过原 task CLI 登记 package，绑定当前 execution、task、assignee、依赖、只读/写入路径和选择理由。资源为工作区内相对路径；目录与父子目录按包含关系冲突，read/read 可并行。真实路径/最近存在的父路径校验阻止软链接逃逸。

原 Agent/Task 工具必须带精确 task marker，且 `run_in_background:true`。同时最多两个任务包，总共最多六次启动、每任务最多两次 attempt。仅当依赖已验收、资源不冲突、当前执行仍有效且预算足够时放行。没有合适包或身份不明时由根 Agent 执行，不为了显示并行而创建 worker。

子工具身份来自原 Query 的 native background registry 与 launch toolUseId；有身份的子 Agent 才能写 package 声明路径。缺身份仅可在无冲突范围只读。子任务不执行不透明 Bash/MCP、嵌套派发或生产动作，根 Agent 负责这些步骤。

启动成功 ACK 只表示 running，不能释放资源。只有带 nativeLifecycle 的真实匹配 attempt completed 才能 settled；转录推断、UI 读账本、自然语言完成均不能释放。failed/interrupted 或不确定写入成为 unknown，迟到成功 ACK/完成事件不能自动解除。根 Agent 可只读核查未知范围，但仍不能写入冲突路径。最终还须根 Agent 对 task 及整个交付验收。

此处使用原 SDK subagent 模型能力；不代表已经实现任意外部 provider/model 组合的独立 worker。模型故障恢复见 [model_failover.md](model_failover.md)。

## 证据与发行

纯 FSM、原 ledger/queue 集成、资源策略、模型链、DOM/helper 和真实 SDK 合成供应商分别测试；合成供应商不证明真实模型遵循交付协议，helper 不证明完整 Chat 页面和 Rust 控制链。

统一验收记录见 [intent-execution-20261024/acceptance.md](../../dev-docs/intent-execution-20261024/acceptance.md)，UI 证据见 [session-execution-ui/acceptance.md](../../dev-docs/session-execution-ui/acceptance.md)。原桌面/combined CI/main owner 统一选择 0.5.21 候选，完成精确源码 CI、签名制品、实际普通聊天交付/返工/Stop/重启未知结果不重放的验收，才可宣布整体交付。
