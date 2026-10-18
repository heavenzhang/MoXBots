# GOAL-PAUSE-001 验收

代码基线 main 7c2aac52b；产品提交44a9c6a98。用户确认仓库 https://github.com/heavenzhang/MoXBots.git。

- DOM：GoalStatusBar、useSessionGoal、hydration、SimpleChatInput.send，4文件86/86通过。覆盖active执行/等待、paused/terminal动作、Composer回调路由、同id暂停恢复及进度保留（API mock）。
- ESLint：修改的7个TS/TSX文件通过。
- 浏览器：实际GoalStatusBar/AgentStatusPanel组件与CSS，合成数据，loopback5191，隔离Playwright Chromium1243。10组检查通过、pageErrors=[]；暂停按钮Enter操作、继续恢复暂停入口、取消保留、未发送草稿保留，1280/768/390/320宽度、明暗主题及32px热区。主Agent读图通过，无独立审阅（局部按钮改动，由主Agent负责验收）。
- 证据：用户MoxBot目录 output/goal-pause-001-20261018/results.json 及desktop-collapsed、goal-paused、narrow-320-paused等PNG。该目录为合成组件证据，不证明真实账号/任务停止。
- 后端：沿既有cmd_pause_session_goal → pause_goal_and_stop；该owner先持久暂停、撤销continuation，再精确停止/结算。既有manager回归涵盖未结算时禁止resume；本次未改Rust，未宣称重跑Rust测试。
- 正式签名包、真实模型任务的暂停/继续及跨重启持久化：未验收，由既定统一桌面发布流程在下一未冻结候选完成。不重启日常App、不停止用户任务。无服务端或数据迁移。

复现：Node24运行vitest定向上述4文件；Vite配置dev-docs/goal-todo-ui/vite.config.ts启动--port5191；GOAL_TODO_BASE_URL=http://127.0.0.1:5191运行同目录check.mjs（可用GOAL_TODO_CHROMIUM指定既有隔离浏览器，GOAL_TODO_EVIDENCE指定证据目录）。
