# GOAL-STALL-001 验收

现场：Goal 第3轮仍持有 queue authority；00:20 watchdog 在600秒无事件后 abort，自动插入一次 Session 续接；00:22:48 后再次无事件，00:33 第二次 watchdog 不再续接。新客户端随后两次用户输入均被 turn_conflict 拒绝。原 watchdog 只广播 transient error 后调用 abortPersistentSession，后者清理 source/observer；finally 又因 abortRequested 不结算 running turn，因此 durable Goal 留在 active/currentTurn。不能据截图推断目标已完成或断言上游具体故障。

另有已退出桌面遗留的 Sidecar 与新客户端共享会话现场；已存在的 PR168 处理父进程退出后的精确进程树收尾。本任务不操作存量进程。具体是什么导致 SDK 不再产出事件仍未知。

修复沿原 owner：Goal watchdog 在 abort 前通过 failTurn 记录唯一 error terminal、原 observer 和持久化屏障；以既有 automatic_replay_blocked 进入原 Rust Goal 恢复暂停，保留进度，不插入无 Goal owner 的 reminder。未知动作结果不盲重放。普通会话保留既有一次性自动续接策略。可见输入被 turn_conflict 拒绝时显示未执行原因；Goal 暂停显示原 terminalReason。

## 验证

- 原始 main 版本复现两项失败：watchdog terminal observer 调用0次；turn_conflict 没有可见 agent-error。
- 修复后 unit/DOM/integration 198/198，包含 watchdog、turn-lifecycle、Goal orchestrator、完整 builtin transcript。新增行为覆盖唯一结算、迟到 result、防止重放、保留已有输出、被拒绝输入不送SDK。
- TypeScript 与改动文件 ESLint 通过；diff whitespace 通过。
- 实际 Chromium 渲染原 GoalStatusBar：1280和390宽度均显示恢复原因、继续与取消回调各1、无横向溢出或pageerror。主 Agent 自验；没有独立审阅、原生客户端或真实 Provider 验收。
- UI证据：evidence/ui-results.json、paused-1280.png、paused-390.png。
- 复验：使用 dev-docs/goal-todo-ui/vite.config.ts 启动 Vite，端口5194，运行本目录 check.mjs；可用 GOAL_STALL_CHROMIUM 指定隔离 Playwright Chromium。

## 交付及限制

唯一项目CI/桌面发布会话01a12bc2-907a-7702-b6dd-788225c5dfe4；本开发会话只做本地自查，不触发共享CI/正式构建/安装。版本、签名、发布和实际任务恢复由统一候选与原生验收另追踪。分支推送不等于 main、生产或当前会话已恢复。
