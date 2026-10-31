# MB-REPLAY-RECOVERY-20261030：原会话只读诊断

- 状态：诊断完成；未修改 live ledger、原历史或运行实例，未重放、清标记、重启。
- 范围：仅原会话 `f49de4ec-7176-4e38-bfac-beabd930acd8`（MyAgents 交互问题排查）的四对 Bash 调用/结果与相关产品操作记录。
- 源码定位基准：`f072eff9a94724fc8802e939e51255dbf625ea3d`。下列源码行号属于该提交；实现中的行号可能变化。
- [x] 定位原两条 uncertain action，完整 input/name canonical SHA-256 复算匹配。
- [x] 核实 native 错误和结构化 hook 拒绝、产品字段丢失。
- [x] 定位首次 replay block 与源码根因。
- [x] 对实现者最终修改进行独立安全审阅；发现的两项实现问题已修复，最终只读复核通过。
- [ ] 原会话恢复与真实 UI 验收：由主 Agent / 现有桌面 owner 按授权和恢复门禁执行。

## 结论

原两条 Bash 均被 SDK 的 PreToolUse permission hook 拒绝。native 不仅记录 `is_error:true`，还记录 `toolDenialKind:"permission-rule"`、`permissionDecision:{decision:"reject",source:"hook",reasonType:"hook"}`，以及与调用 assistant UUID 精确一致的 `sourceToolAssistantUUID`。这是“执行前拒绝”的结构化证据；不能将该结论推广为任意 shell 错误均没有副作用。

源码中 execution denial 在 recovery controller 的 authorizeTool 之前直接返回，因此原拒绝没有通过 controller 登记为可信 `nativeErrors`。之后请求历史分析见到 Bash 的错误结果、却没有 controller 拒绝收据，按保守策略归入 uncertain，并持久化为 `legacyUncertain`。后续两个新 Bash 因已有 uncertain 被总闸拒绝。产品层还丢失了 native 的错误布尔字段，导致用户界面没有完整表达这些失败。

## 精确证据索引

native 文件：`~/.claude/projects/-Users-zhangshaohua-Documents-WPS-Cloud--------MoxBot/f49de4ec-7176-4e38-bfac-beabd930acd8.jsonl`。
产品文件：`~/.moxbot/sessions-v2/f49de4ec-7176-4e38-bfac-beabd930acd8.jsonl`。

| native 调用 / 结果行 | UTC 结果时间 | action hash | 结果与产品对应行 |
| --- | --- | --- | --- |
| 21 / 22 | 2026-10-29T17:15:55.454Z | `73e15227fad4735daa3e58c309d12d2661d759bb1f9aa954e15e995dcf7b4fe5` | 执行意图限制 hook 拒绝；产品 15–16 |
| 50 / 51 | 2026-10-29T17:17:03.456Z | `8b67c0cf1321aed69d800dd419b73311a2496fe3483a507f23ca4db4774f2cca` | 同上；产品 125–126 |
| 119 / 120 | 2026-10-29T17:22:11.239Z | `97ef38f3ae182fc4c34211863f3647afa2098e49a3553597ec7ac0e7f5dc7c1e` | 首次可见 `automatic_replay_blocked`；产品 328–329 |
| 149 / 150 | 2026-10-29T17:24:06.939Z | `edad1b0706245573577d10b28ce703649c013f86c81a632aa33285714f6f3494` | 再次被 uncertain 总闸拒绝；产品 374–375 |

前两条命令意图分别是读取路由记忆并列目录、读取 Chat/i18n 源码，均有完整输入供私有证据中的 hash 复算。该“命令意图”不是运行证明。四条 native 结果均有 `is_error:true` 和上述结构化拒绝字段；没有 shell stdout/exit-code 执行回执。前两条 sourceToolAssistantUUID / parentUuid 分别为 `9dcf9f6c-5da4-4639-a8f0-f2bc0bbe3712`、`52992a56-d861-40c7-8ea6-f7c8de7951b0`，精确指向调用行。对应 tool IDs 分别为 `toolu_bdrk_01SHkav8zZP4Nic3VakFgQYi`、`toolu_bdrk_01SR1GEGuaMYBcwjSaEF8Fa8`。

物理文件共 154 行，无重复 UUID。以最后会话记录 154 行 UUID `d33f76fd-e46b-424a-b8f1-f54fcd8b7524` 回溯 parentUuid，以上八行均处于该物理祖先链上。此检查不能替代 SDK persistence owner 对当前选定链、会话身份和恢复 epoch 的确认。

ledger `~/.moxbot/context-recovery/<sessionId>/ledger-<sessionId>.json`：两个原 hash 在 `uncertain` 与 `operationAttempts.legacyUncertain`；后两个 hash 仅有对应 `nativeErrors` 的 `pre-tool-denied` 收据。`completed=[]`、`operationAttempts.entries=[]`、`blocked=false`，不代表业务动作已完成或已获恢复权限。

## 源码因果链

- `src/server/session-engine/session-execution.ts:714–723`：answer/plan/control admission 拒绝非 READ_TOOLS 的 Bash。只从已读代码和错误回执可以定位到该拒绝分支；没有把用户原话的分类正确性当作已验证事实。
- `src/server/agent-session.ts:12805–12818`：executionDenial 在 PreToolUse 直接返回 deny；`:12831` 才调用 recovery authorizeTool，原拒绝没有进入该路径。
- `src/server/openai-bridge/context-recovery.ts:268–281`：历史 Bash 的错误结果若没有精确 nativeError/noDispatch 等可信收据，则进入 uncertain；`:928–929` 归并并标记 legacy。
- 同文件 `:969–976`：已存在 uncertain 时只放行狭义只读核对，拒绝新业务动作；这是首次 replay block 的直接原因，不是某条原 Bash 被实际重试后失败。
- `src/server/agent-session.ts:14429–14456`：SDK user-tool-result 路径没有给 handler / broadcast 传递 `is_error`。`src/server/session-transcript/presentation.ts:421` 只在收到布尔 `isError` 时写入产品状态。对应四个产品工具块的全部更新都没有 `isError`/`is_error`；仅保留 result 文本与 loading/timing。
- `src/server/builtin-session/recovery-ledger-inspection.ts:9,59–62`：物理 native 记录是只读调查线索，不能自行授权恢复。`recovery-reconciliation.ts:55–64,79–85` 的现有 review 仅为 TaskGet/TaskList 生成收据，Bash 不具备现成核销通路。

## 恢复证据边界与审阅要求

恢复实现须从 SDK/persistence owner 的当前选定链取得结构化拒绝字段，绑定 session/sdkSession、调用 UUID、tool ID、完整 input/hash 与结果来源。不得仅用 `PreToolUse` 字符串、`is_error:true`、shell 命令看似只读或缺少 stdout 推断未执行；普通进程非零退出可能已有副作用。缺失、重复、冲突、跨 session/chain 或不匹配的拒绝证据必须继续 fail closed。

恢复收据只能表达该次调用被执行前拒绝，不能表达其业务工作已完成，不能重新授权自动重放。保留原 ledger/history，按既有 owner、锁、digest/epoch 和可追溯收据路径恢复；并发变更后原核销请求必须失效。

## 私有证据

必要摘录存放在工作区 `work/MB-REPLAY-RECOVERY-20261030/`（目录 0700、文件 0600），不提交原始会话历史：

- `native-tool-denial-evidence.json`：仅四对 Bash 调用/结果及拒绝字段，排除 thinking/signature 和无关文字。
- `product-tool-denial-evidence.json`：仅四个工具块 input/result/tool metadata 操作。
- `ledger-readonly-snapshot.json`：本次 ledger 只读快照。
- `provenance-readonly.json`：源文件路径、sha256、大小、行数和物理祖先链检查边界。

原始历史的全部内容不应进入 Git、PR 描述或发布制品。本文仅保存脱敏因果结论和精确定位。

## SDK 选定链只读实测

随后使用本地 SDK `0.3.296` 公开 API 完成只读核对：`importSessionToStore` 写入自定义纯内存 collector，指定原项目目录、`includeSubagents:false`、`batchSize:100`；`getSessionMessages` 限制 50,001 条（超过 50,000 即失败）。得到 154 条 raw records / 两批，以及 90 条 SDK 当前选定消息。四条拒绝均位于 SDK 选定消息中，UUID、session_id、完整 message canonical digest 与 raw record 完全一致，结构化拒绝字段完整。

本地 SDK `sdk.d.ts:991–1032,6620–6720` 明确公开导入 API、批量 append 及 opaque raw payload 合约；实际 `sdk.mjs` 导出 `iIt` 通过 `wZ` 的 readline/createReadStream 读取并调用 store.append。纯内存 collector 不调用 SDK query/resume/load，导入不写会话文件。导入前后 native/product/ledger 的 SHA-256 和 mtime 全部一致。结果保存在私有 `sdk-readonly-chain-probe.json`。

读取限制仍须实现层核实：SDK 流式导入没有总字节上限；collector 只能在一批解析完成后拒绝超限，不能防止超长单行的临时内存。超时或截断不能作为无副作用证明；重复 UUID、外来 session/subpath、缺少选定链结果或 digest 不符均应拒绝生成恢复收据。

主 Agent 追加要求下，三个确切原文件的恢复前完整快照另保存在私有 `pre-recovery-snapshots/`，目录 0700、文件 0600；没有输出正文，不提交 Git。该目录的 `manifest.json` 保存完整路径、SHA-256、字节数、行数和读取稳定性，用于之后恢复前后对照。

## 非实现者审阅进展

- UI 最终源代码审阅已通过：同会话分批核销使用最新 digest、失去 owner/关闭面板会停止剩余核销、自动检查为只读且失败不打扰普通会话。中英文显式说明“执行前被拒绝、业务未完成、新消息才继续、不重发旧命令”。真实组件/UI 验收由主 Agent 负责，源代码审阅不替代该验收。
- 预审提出的旧产品输入形态问题已修复：原记录 `tool.input={}`、完整输入在 `inputJson`，必须经既有 `projectTranscriptToolInput` 投影后比对 hash。精确错误标记补回先验证全部唯一目标、工具名和输入 hash，再只追加 `isError:true`；不改正文、不伪造工具结束事件，等待 writer 实际持久化。
- 服务端最终安全审阅已通过：typed pre-execution rejection 与 SDK 选定链双重配对、同 hash 全部调用完整证明、输入/工具身份不可替换、保留原 uncertain 加审计、新尝试独立记账、不复用旧 tool ID。普通 shell 错误、文字伪造、重复身份、跨 session/sidechain、同 hash 未证实其他调用均维持保护。该结论是源代码审阅，不替代测试执行、原会话恢复或发布验收。
