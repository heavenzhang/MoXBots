# Session task orchestration

Product Session 的 To Do 与子 Agent 执行共用 `SessionMetadata.taskOrchestration`。原 SessionStore metadata CAS 是唯一持久化入口；SDK、DSH TaskGraph、Codex/Claude Code 仍拥有执行、队列、重试和 native history。这里没有第二个 scheduler 或数据库。

## Task、attempt 与验收

- `task.id` 是稳定业务身份；`toolUseId` 是派发身份；activation/run ID 区分同一 handle 的不同尝试。nativeTaskId 只是执行来源，不推断为业务 task ID，不按标题或数组下标关联。
- 主 Agent 在原生 TodoWrite/TaskCreate/update_plan 中使用 `[task:stable-id]` 显式标记。根 Agent 派发时可在 description/prompt 第一行使用同一标记：确认后、时间晚于确认的根派发可直接关联任务；历史和子 Agent 编写的标记不取得该关联。缺少该元数据时，用 `session tasks` 的 bind 指定精确 toolUseId；每次重试保留 task ID、使用新 attempt。
- running 来自确切 live tool、SDK background task/run 或 DSH Agent activity，不由整个 Session busy、历史 loading 或 inactive catalog 推断。失去执行证据显示 unknown。
- 回传 completed 只进入 awaiting_review。主 Agent 实际检查成果后，通过 CLI review 提交当前 attempt 与证据；CLI 先持久化 intent，原 owner 的 root shell tool-completion 核对完整命令、回执和当前 Query/turn 权限后才写最终 review。子 Agent、复制的回执、失败 shell、旧 Query 和旧 attempt 均不能完成任务。
- Chat、Session activity 和项目板共享同一进度投影；完成数只统计验收通过的任务。旧结果晚到不能覆盖新 activation；main 工作重做采用新的 main attempt，保留旧 review 作历史。

## 方案与人类确认

需要新的人类方案决策时先 propose，讨论与 revise 仍写在同一账本；确认前不创建该方案正式 steps、不派发其子 Agent。没有 proposal 的会话沿用原执行授权；已有 Task/Goal 等由原生队列 owner 证明的独立工作不被别人的草案误拦。草案在同一 metadata CAS 中保存服务端采集的 originTurn，同 owner 提出的新草案仍需其适用确认；未知 origin 不推断独立授权。不能通过 source 字符串、CLI 或模型自报取得权限。简单回答和已有授权内的执行不新增确认。确认绑定 Session、proposal ID、revision；同 requestId 幂等。范围、目标或验收标准改变使受影响 steps 进入新验收代次；删除的旧 steps 只保留历史，不能通过旧授权复活。

原生 Tab proxy 用仅驻 Rust 内存的 P256 私钥签署限定的 plan POST 与 chat/send 请求；Sidecar 只收到 SPKI 公钥。Node 验证精确 Session/path/body SHA、时间窗、nonce 和 DER 签名。工具环境、CLI credential、普通 loopback POST、客户端自填 source 均不证明人类操作。浏览器开发夹具不能替代此原生边界。

自然语言快捷确认只接受完整明确短句，不能包含额外范围或等待约束。UI 在方案真实 render commit 后捕获已显示的 proposal/revision，随原 chat/send body 签名；Node 严格匹配后记录 humanInput。CLI 再以真实 user message 的 clientRequestId、内容 hash、消息边界与该 receipt 绑定。模型、工具、引用、后台注入的 user-role 行或修改前旧消息均不能确认新版本。已确认的同版本无需再次确认。

调整意见也通过同一账本与原队列的一次性 revision 请求唤醒主 Agent 修改草案，不创建正式任务、不授权子 Agent。

确认后只通过原 SessionEngine 的 turn-boundary queue 启动一次。pending 状态不打开委派权限；原队列持久化 claim 后才开放。claimed 还必须匹配本进程原 queue lease，重启遗留的未知 claim 不自动授权。最终同步 validator 一直传到 SDK admission、Codex RPC、Claude Code stdin 或 DSH turn/start 前；中间异步配置/重启不能绕过。真正 native entry 有一次性 fence。

## 恢复与原生边界

事件更新以同一 Session 串行化和 metadata CAS 发布；冲突有界 fresh-read 重算，只广播已持久化结果。SSE 用 ledger revision，GET 冷恢复/串行轮询保底；旧 REST、跨 Session 迟到响应和断线不能回退已确认状态。活动 Session 优先读取原 owner 的内存 projection，避免每次轮询重读磁盘。

原 owner 证明尚未发送时，先 await guard.cancel 释放 claim 再返回拒绝。进入 native 后丢失 ACK 保留未知 claim，不自动重放；UI 明确提示核对已有结果后在会话继续。已派发回执、确认、attempt 和 review 均跨重启恢复；恢复不把 native complete 升级为 accepted。账本有历史数量/大小上限，失败保留上一份确认状态并显示同步问题。

SDK PreToolUse、DSH 和 Codex 使用同一原队列作用域 policy；没有 proposal 不额外撤销原授权。方案 continuation 使用保留的 session-plan: 队列身份并精确匹配当前 proposal/revision/claim，旧队列不能降级成一般 Task 授权。SDK PreToolUse 在所有模式拦截该方案未授权的 Agent/Task。DSH 固定注册所有 origin 的 product hook，并要求 native ready 回执，不支持时拒绝准入。Codex 没有逐次 spawn 的 Host hook：委派 feature 是出生快照，变化通过原 owner idle/terminal 的 config restart 生效，保留原 thread/队列/promotion；当前 turn 仍遵守原授权快照，不能宣称运行中即时撤销权限。

## 发布验收

本任务本地 pure、真实 SessionStore 磁盘、实际 adapter/mock-native 与生产 React 组件合成浏览器检查，分别证明对应层级。6 个宽度/主题组合与证据见 `dev-docs/session-orchestration/review.md`。本地 web/server/CLI 构建不等于签名客户端和真实 Provider 验收。

桌面/macOS/updater 唯一现有发布负责人仍为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。候选必须包含本任务精确 SHA，正式资源准备后运行 Rust 编译/CI，再在签名制品验证：未确认拦截→确认一次启动→真实子 Agent 回传待验收→主 Agent 验收完成；拒绝/重试与晚到；断线/重启 unknown/receipt 对账；三 Runtime 的真实 gate 和 DSH hook ready。当前冻结批次不追加本任务，不在开发会话重启日常客户端或分配正式版本。

## 原布局中的增量交互

Chat 内只有一个任务 snapshot/event 观察者，原工具行、结果节点与统一状态栏复用其投影；未修改工具调用、附件、排队、权限卡及完整 Composer 的执行 owner。普通工具行不订阅任务 Context，避免长会话每个工具行因任务轮询重新渲染。

工具关联按 toolUseId + activation 定位当前/历史尝试；历史行仅呈现该次原生事实，不借当前任务的验收状态给旧结果盖章。回传待验收时，在原 MessageList footer 成果节点提供主 Agent 验收与返工入口。验收按钮捕获 Session/任务/attempt，调用前复核仍是当前待验收目标，再通过原会话发送/排队请求；前端没有写入 accept 的入口。聊天 admission 不等于验收，重复点击保持单次提交；原 turn 终止、队列排空而仍待验收时提供显式重新请求。A/B/A、旧请求回执和新 attempt 相互隔离。

返工仅追加意见到既有 Composer 并聚焦，不清原草稿、附件、队列，不直接 reject 或启动重试。原 Permission/AskUser/PlanMode/更新 checkpoint 未处理时不提交任务动作。主 Agent 仍通过原 root tool receipt 记录实际验收和返工证据；结束后成果链接留在消息流。原 ChatScrollController、Virtuoso footer 与输入区高度测量保持所有权。
