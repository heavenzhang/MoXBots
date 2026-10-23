# 排队与执行时序修复验收

任务 MOXBOTS-QUEUE-EXEC-20261023；基线 main d4a89cca58c2c7295560e8ced1d6f769f686bcbd。

## 故障证据

2026-10-23（Asia/Shanghai）本机日志同一 queueId 的顺序：23:17:59.947 进入恢复队列；23:18:00.478 SDK yield；23:18:04.118 POST /chat/queue/force；04.119 stop-requested；04.123 result=aborted_streaming；04.126 chat:message-stopped。日志行约76860、76899、77000–77019。此前22:56和23:07 watchdog及模型识别错误是另一组已有事实，不能将其修复或真实 Provider 恢复当成本次已验证结果。

## 根因与行为

恢复项沿用了 wasQueued 标记，即使它已经是新 Query 第一条输入，仍只等待中途队列消费回执；force 分支将这个当前 root 当作“上一轮之后的待执行输入”，从而中断自身。首条恢复输入现在复用既有 deferredUserSurface → admission persistence → SDK yield；精确队列项转到聊天记录，计时和 usage 从新轮开始。force 依据现有 output-owner FIFO，当前 root 的旧点击返回幂等成功；真正 successor 仍经既有 interrupt/terminal owner。Inbox 原生 consumption 绑定保持原规则。

原始失败回归已复现；新增全链回归也曾发现执行 complete 后仍 busy 的队列残留，修正为普通准入后通过。没有弱化 tool ledger、权限、去重或配置门禁。

## 当前检查

- root force facade、recovered realtime generator/persistence 回归通过。
- queue/turn-lifecycle/route/runtime boundary/inflight policy + queue DOM：100/100。
- 完整受影响集成：196/196；TabProvider定向DOM：8/8。合计304项。TypeScript、定向ESLint及server bundle：通过。
- 源码未涉及 JSX、样式或响应式布局；现有 queue:started 的 Tab 展示/运行状态为 DOM 回归范围。没有把主 Agent 自测写成独立审阅。
- 真实当前用户会话不重发；未重启/安装日常客户端；未使用真实 Provider 或业务写入。

命令：`vitest run --project integration src/server/session-transcript/builtin.integration.test.ts src/server/__tests__/builtin-interrupt.integration.test.ts`；其余精确文件与原始合成输出见 `evidence/verification.json` 和本地 `work/queue-exec-20261023/`。

## 交付边界

本地合成 SDK 和 loopback/facade/持久化测试仅证明相应代码行为。原生发布、真实 Provider、用户原会话复验由原桌面 owner 按新不可变制品核验。当前安装0.5.19/519.2不含本修复；正式版本号与摘要由原 owner 分配。本分支没有触发共享 CI 或正式构建。
