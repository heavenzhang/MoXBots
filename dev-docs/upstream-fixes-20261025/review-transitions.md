# 第 2/3 组独立审阅 — 会话切换与原生 Renderer 恢复

结论：在本次代码与聚焦测试审阅范围内，未发现应阻断集成的具体 P1/P2 问题。此结论不替代 root 的统一 Rust 编译/测试或真实原生验收。

## 范围与身份

- 非实现者：第 4 组 native lifecycle worker；本次仅审阅，不修改产品源码。
- worker 提交：`ae56a3a4e57aaaf0d040fb95d1074b5e615d97ca`。
- root 集成树：`/Users/zhangshaohua/Documents/Codex/2026-10-25/moxbots-upstream-fixes`，审阅时 HEAD `fdf592ce72f130f9707d17c2bdf164e96e200285`。
- 配对 root helper：`82bfef743a30b111f0b475ee643a89c9e897f584`；核对了 facade 导出、history-free live snapshot 及原 mutation scope 的可重入实现。
- 读过 worker README/verification、相关源码与新旧 diff、既有故障注入测试。未审整个仓库或所有 IM handover 分支；本次聚焦桌面 New、Renderer replacement 和 SSE snapshot。
- root 的共享配置/规范存在并行未提交修改；未改动这些文件。仅新建本记录，不提交、不运行 Cargo、不操作 App/真实账号。

## 核对结果

| 关键风险 | 代码依据与判断 |
| --- | --- |
| 旧 Tab transport 与 owner 混淆 | `src-tauri/src/main_renderer.rs:31` 先串行 attachment，再从 manager 获取准确 `(sessionId, tabId)`；`sidecar/manager.rs:2294` 同时枚举 active/recovering owners，排除 Companion 等其他 owner。`sse_proxy.rs:142` 仅停止 Tab subscriptions，不删 Session owner。重复同 renderer id 返回已有 receipt。 |
| 恢复 offer 抢先复用旧 token | `src/renderer/App.tsx:3018` 先恢复 live layout，再对未保留的精确 old binding 顺序 await `detachChatTabResources`，然后合并 remaining/pending，最后开启 persistence 和 offer。handler 自身也检查 ready，防止提前捕获的 callback 越过门禁。已挂载且 attachment 失败的 reading Tab 仍保留原身份/错误/重试；不被当作 overflow 重新执行。 |
| 忙碌/恢复/共享 source 被 reset | `sidecar/session_lifecycle.rs:98` 先检查确切 Tab owner；共享/持久保护/不活跃 source 不复用。`cmd_new_desktop_session` 的 lifecycle try-acquire 失败走 preserve；`im/handover.rs:445` discovery/peer/projection/router 争用也走 preserve。原 owner/binding 保留，复用既有 BackgroundCompletion owner 允许独立 birth。 |
| source 身份检查和真正 mutation 脱节 | builtin `builtin-adapter.ts:1146` 在原 `runSerializedSessionMutation` 内重新检查 source/busy，然后 freeze/reset/metadata publication；external `external-adapter.ts:1117` 在 startup settlement 后取得原 mutation lease 并复核 source。helper 导出同一 lifecycle 实例，AsyncLocalStorage scope 支持内部 reset 的重入，未另建 mutation owner。 |
| uncertain writer 被当作安全拒绝或重复执行 | `session_lifecycle.rs:236` 只有明确 `409 + sourceUnchanged` 才视为进入 reset 前拒绝；丢响应、超时、错误目标或 publication 失败进入 uncertain。`retire_failed_desktop_transition:424` 在 dispatch lease 仍钉住 generation 时关闭准入、终止确切 writer 并确认退出，再进入现有 source recovery。没有以读取 target id 作为成功证据，也没有重发 New mutation。 |
| Rust/Router 在 Node durable ack 前换身份 | Node 在 durable metadata 成功后才返回 target；Rust source manager identity 在 ack 前不动。Channel staging/persist/rekey 后失败先退休 writer；未证实 retirement 的错误通过 `?` 传播，不声称可以安全 rollback 或 replay。最后 owner 变化会在 commit 复核并退休 writer。 |
| 独立 birth 失败破坏原会话 | `App.tsx:3083` 使用每次唯一 pending id，先 ensure/reconcile target，再复核 source Tab，之后才停旧 transport、发布新 Tab identity；旧 token 异步释放不拖慢新会话。准备失败仅释放新 target。floating-binding follow 错误被局部捕获，不错误回收已发布的 target。 |
| 新会话误带历史，或重连清空当前历史 | `TabProvider.tsx:1620` 将 transcript/seen-id/RAF/interactive/revision projection 的 fresh 清理归一。`1703` 同 session prop 立即返回；新 pending 身份清理，pending→real/reset birth 沿原 SSE-native 分支，普通持久会话仍走 REST restore。`chat:init` 比较 revision 后由原 restore token/connection generation fence 对账，旧异步 snapshot 不可覆盖新 birth。 |
| update freeze 旁路 | `src/server/session-engine/selector.ts:156` 新 `transitionDesktopSession` 继续经 `withUpdateAdmission`；原 metadata materialization、Stop/recovery helper 和 execution ledger 未由新 route 替代。旧 `/chat/reset` 入口明确拒绝，不留下绕过 Rust lifecycle 的第二个桌面 reset 路径。 |
| MoXBots 导航/模型/恢复约定丢失 | App 保留当前冷启 launcher、显式 update draft、不自动发送草稿、failed reading Tab retry。CLI/model validation 通过共享 options 补齐输入检查，未用旧 upstream UI 覆盖当前导航、模型页或 durable recovery owner。该项仅限本次 diff 范围。 |

## 独立复验

运行时：`/opt/homebrew/opt/node@24/bin/node`。在上述 root 集成树执行：

```sh
/opt/homebrew/opt/node@24/bin/node node_modules/vitest/vitest.mjs run \
  --project unit \
  src/renderer/context/desktopSessionTransition.test.ts \
  src/renderer/api/SseConnection.test.ts \
  src/server/session-engine/session-engine.unit.test.ts \
  --project dom \
  src/renderer/App.helperLaunch.test.tsx \
  src/renderer/context/TabProvider.activity.test.tsx
```

结果：5 文件、395 项全部通过，退出码 0，7.02 秒。分项：transition 7、SSE 20、SessionEngine 141、App 97、TabProvider 130。覆盖 source busy/refusal、durable publication 顺序、update freeze、独立 target 准备失败、source release 未完成时新会话可用、pending offer 门禁、cold/update 恢复和 new projection 隔离。测试中的注入失败日志属明确断言场景，测试结果无失败/跳过。

同时检查 Rust 故障注入测试源码：actual HTTP writer timeout retirement、lost-response 不采信 target identity、rekey refusal、last Tab close 与 source recovery/共享 owner 场景。按 root 分工没有运行它们，不能把源码存在视为执行通过。

## 未验证边界

- 本审阅未运行 Cargo、shared CI、完整产品 build/install/restart。
- 未通过真实 WebContent crash/reload 验证本套 App 的恢复；未触碰真实会话、账号、模型 Provider、IM 通道或用户配置。
- Unix/Windows 精确进程树终止、Rust lock/owner 交错、平台权限与真实 writer settlement 的运行证据由 root 的统一 Rust gates 和后续原生验收补齐。
- 原生 attachment/owner 调用发生真实 IPC 失败时，沿既有错误显示/保留 owner 的边界仍须现场验证；合成成功/故障测试不等同实际业务恢复成功。
- 本结论是所审源码可接受进入统一验收，不能表述为已发布、生产已通过或所有用户路径已恢复。
