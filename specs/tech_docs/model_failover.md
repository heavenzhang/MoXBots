# 内置 API 模型自动接管

任务 MOXBOTS-MODEL-FAILOVER-001。参考 [OpenClaw model failover](https://docs.openclaw.ai/concepts/model-failover) 的主备候选、有限重试、本轮接管和可见提示；实现遵守 MoXBots 自己的 Session/Query/配置 authority，不移植另一套会话 owner。

## 用户行为

设置 → 模型策略 → 故障接管（高级，默认折叠）。自动选模型为主设置；故障接管支持“跟随自动选模”“使用指定备用”“不自动切换模型”。默认跟随自动，只在同档有可用候选时接管；自动与指定备用均须显式开启跨档才允许越档。指定模式失效时不暗自改用自动备用；关闭切换仍保留原模型有限重试及Stop/动作guard。配置摘要区分已就绪与失效原因，实际发送前仍检查兼容性。

会话desired主模型不被临时接管改写；同轮固定备用身份，下一轮恢复主模型。空闲新轮次在分类前清除旧自动备用，manual/null/分类失败/异常/CAS冲突不能沿用；busy/工具往返保留当前轮次。自动候选绑定实际primary且Session须仍auto。模式、跨档、模型及凭据在异步校验后重新读取，停止/权限撤销优先，不重启任务。

支持内置 Claude Agent SDK 的普通 API 模型，包含 Anthropic Messages、OpenAI Chat Completions、OpenAI Responses。主备必须经过既有 providerHistory policy（含精确 model isolation）；与主模型同一对、被禁用/删除或缺凭据的备用不参与。订阅/OAuth、专属 cloud-session grant、DSH 与外部 CLI 保持原执行 authority，不借 API 配置切换。已存在 SDK 后台任务时不发起新接管，因为公共 Query token 不能证明请求归属哪个 root。普通 API 模型即使未配置备用，也经同一 Query 的有限推理重试控制器；后台推理仍可对未交付的临时故障有限重试主模型。能否切备或缩减历史在请求接纳时固定，后台列表随后归零不能把旧后台请求升级成前台恢复 owner；动态撤销门禁仍持续生效。

## Owner 与执行位置

- config.json 是 desired 配置唯一权威；`AppConfig.modelFailover` 包含可选mode（auto/specified/off）、可选allowCrossTier、旧enabled投影及备用providerId/modelId，无密钥。无mode时旧enabled=true映射specified，否则auto，显式mode优先。Renderer 使用原 updateConfig/atomicModifyConfig，保留并发其它字段。
- Session 仍拥有选定主模型。`builtin-session/model-failover.ts` 从原 effective catalog/credential resolver materialize 备用，不能把临时接管写成用户主模型。
- 每个 Query 的既有 `/bridge/<token>/v1/messages` registry entry 拥有一个 controller。退役 token 隔离旧 Query，控制器 exact state 防止旧请求修改后续轮次；root 采用首次请求的稳定 scope，人工 steering 不重开预算。原 turn-lifecycle 终态清理仅释放该 root 的新接管/缩减权限，不撤销 Query 中已经接纳的合法请求。Query/token/Session/route 与 request abort 决定单次请求有效性；父 turn 的完成或 idle 不构成 Query 退役。每次请求捕获自己的 route fence，合法同 Query 切模型后的新请求重新捕获当前 route，旧 route 的迟到输出仍被拒绝。
- 原生 SDK transcript 继续拥有执行上下文，原 SessionStore 继续拥有产品历史。SDK 接到的仍是同一次推理请求的响应；应用不重新 enqueue 用户指令，不创建 fresh native session，不回退历史、不执行任何工具。
- 本轮切换在原产品历史插入独立 diagnostic，原有工具结果/TODO 不被替换。OpenAI 备用响应投影实际备用 model，主模型 desired 不变。

## 故障与预算

可恢复错误仅 HTTP 408/429/500/502/503/504/529，以及桥接层映射的连接失败/headers timeout。每个推理请求在尚未交付任何成功响应时，主模型首调失败后最多再重试三次，退避为 250/750/1500 毫秒，等待可被 request abort、Query/route 退役或原有 Stop interrupt owner 中止；仍失败且原 root 有效、无后台歧义并配置了合法备用时，才切换到一个备用。备用请求同样最多首调加三次安全重试；后续该轮推理使用同一备用身份，凭据每次重新读取，失败不回切主模型。一次 SDK 重发不能获得新恢复预算。已知不确定工具结果或恢复 ledger 阻断时，不自动重试推理。headers 上限 30 秒。错误正文读取上限 1 秒/16 KiB，截断、损坏或超限保留上游 HTTP 状态并停止自动恢复。

认证、权限、余额/付费额度、参数/上下文/模型错误和策略拒绝不切换。429 的结构化 billing code 与明确欠费消息复用既有错误分类。工具错误不是模型服务错误。可见 HTTP 200 文本不被猜测成故障；不按回答质量自动换模型。

## 重复执行与不确定性

每个 logical root 对 model/system/messages/tools 的指纹只允许一条在途/已交付请求；cache_control 不参与指纹。已退休 root 的请求证据保留至 Query 释放；无法证明 root 的后台请求也必须通过同一守卫，不能因为 scope 消失而裸转发。明确的新前台 root 与旧后台请求隔离，不继承其恢复预算或诊断归属。每个控制器最多保留 4096 条请求指纹，达到上限明确停止接纳，不能静默淘汰安全证据以重新开放重放。桥接内部有限重试属于同一请求，SDK 之后自动再次发送相同请求会收到 409，避免依赖 SDK 自己的重试配置实现安全边界。

SSE 已向 Runtime 交付后如断流、error event 或 EOF 缺 message_stop，旧 HTTP 请求和指纹仍永久封闭，包括修改历史后的隐式续发。原 SameTurnStreamContinuation 可以在精确 native marker 下开启原 root 的新 inference namespace，而非重放旧请求；恢复链沿原 id 和绝对 deadline，不增加备用权限或预算。原 native result 到达时已全部结清的后台零工具断流，另须满足 [严格 settled 证明合同](context_recovery.md#settled-background-stream-continuation)；不满足时原会话明确显示暂停原因，保留所有旧 fence、工具结果和 Goal 进度。普通显式新输入仍走原 admission。取消、Query/token/turn/config 变化在每个异步决策后重新检查；旧 Query 的迟到 result 不操作新 owner。

备用请求检查实际图片、工具协议和已知上下文约束：图片能力不明拒绝；工具目录声明存在时必须支持实际transport；已知上一轮context usage与实际输出预算超窗拒绝。OpenAI翻译器丢弃SDK max_tokens，故使用target显式cap而非SDK值。未知完整请求token量/真实工具能力仍属未知，配置就绪不表示已证明完整兼容。不会删内容强行适配。

备用推理收到完整历史和应用控制的接续指令：基于已有工具结果继续，不重做已确认写入/发送/提交/部署；结果未知时先只读核实，不能核实就停止。此机制防止本应用因故障重放整条任务，**不提供任意外部工具的 exactly-once 事务保证**；模型仍可能提出新的同义动作，外部幂等和业务核验仍由原工具/业务 owner 负责。不会删历史、工具或图片来强行适配备用；实际不支持时终止并保留现场。

## 验证与发行

`src/server/openai-bridge/background-lifecycle.integration.test.ts` 经真实 registry 和双控制器 handler 验证后台/取消/重试/隔离；`src/server/openai-bridge/model-failover.integration.test.ts` 使用真实 loopback HTTP；`builtin-session/model-failover.integration.test.ts` 验证配置/生命周期策略；组件 DOM 测试覆盖精确路由、保存与失效状态。`scripts/verify-model-failover-loopback.ts` 使用安装的真实 SDK/native child 和本地 MCP counter，无供应商调用；普通模式验证工具执行一次后503接管，`--stream-failure`验证已交付断流后停止且无备用/重复计数。

模型策略六项追加验收见 `dev-docs/model-settings-20261022/acceptance.md`，入口/三模式/同档/可用性/可见决策/恢复操作分别覆盖。原接管验收摘要见 `dev-docs/model-failover-001-acceptance.md`。模拟供应商、真实 SDK loopback、原生安装/真实供应商分别追踪；本任务不改变已冻结的发行候选，由统一发行 owner 选入后续批次。

任务 MOXBOTS-REQUEST-499-20261018 的完整验收、实际 SDK 后台 Agent 与有限重试/工具防重放证据见 `dev-docs/request-499-20261018-acceptance.md`。`scripts/verify-background-lifecycle-loopback.ts` 和三种 failover native 模式（接管、已交付断流、停止重试）进入正常 CI，使用隔离本地合成供应商，不连接用户账户或真实模型。


### 流终态的安全首因提示

`onStreamInterruption(cause, diagnostic?)` 的第二参只承载受限origin/category枚举；原cause时机/次数及transport/unproven许可判断不变。provider code仅通过严格allowlist映射到固定类别，未知code/message/body/header均不保留。MF候选与attempt/response绑定，授权retry/backup成功或旧attempt退休后不落Query槽；Context候选只在最终下游error/EOF边界提交。两层都沿现有request取消及owner守卫，诊断不是恢复authority。

exactscope首次失败只存在现有有界QueryRequestGuard admission row，不新增map、revision、持久化、checkpoint字段或cold恢复。相同scope后续blocked409与原blockedSSE附加固定中文首因，既有SDK terminal错误转发显示给原Session；不同显式root即便fingerprint相同也不继承。原HTTP状态/blocked headers和所有防重放/Stop/预算/receipt约束保持。诊断只说明故障来源类别，不表示原任务成功或允许重试。
