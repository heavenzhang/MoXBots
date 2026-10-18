# GOAL-TODO-UI-20261018 验收

## 范围与来源

基于远端 main `9269dd8c52c423a180bfba366c8f0434a90db005` 的隔离分支。目标为正常执行的中性状态呈现、目标正文与元信息分层、待办紧凑摘要/进行中优先/完成折叠，以及键盘与长内容约束。规范见 `../../specs/tech_docs/goal_todo_interaction.md`。

不修改 SessionGoal、运行时待办派生或持久化 owner。取消/继续/编辑/关闭沿用原回调与确认流程。原生客户端、账号和模型任务不受组件 fixture 影响。

## 验证结果

- 定向 DOM 回归 39/39：GoalStatusBar、AgentStatusPanel.lifecycle、useAgentStatusState。包含已有完成历史不复活/终态驻留淡出/新活动取消淡出，以及新增明确操作、完成折叠、当前工作优先、Escape 焦点恢复。
- 首轮实际 Chromium 组件验收 7 组通过、页面异常 0：Enter展开、完成折叠与 Escape、编辑/取消/恢复/关闭回调、终态目标全文展开、浅/深主题、768/390/320宽度、长标识符断行、列表滚动、输入草稿保留。最终追加的长目标/列表同时展开键盘滚动与输入区可达性以 results.json 为准。
- TypeScript、限定 ESLint、最后追加浏览器用例、CI 与 main 交付：任务记录追踪最终结果；未完成前不视为通过。
- 主 Agent 读图：desktop-expanded、narrow-390；独立 reviewer `ui_review` 通过 IAB 运行页点击及桌面浅/深和320/390截图复核，没有视觉阻断问题。独立发现的嵌套滚动、终态全文入口、箭头方向、可访问摘要和极长目标高度问题已修复，最终键盘补验另记录。

内置浏览器首次导航/绑定多次超时，独立 reviewer 后续成功取得页面并点击展开；主 Agent 使用项目已有 Playwright 在独立 headless Chromium/profile 验收实际组件。未使用用户 Chrome 会话。截图为合成任务，不证明正式包或真实目标运行。

## 可复现

使用项目约定 Node 24 与 npm 依赖：

```sh
node node_modules/.bin/vite --config dev-docs/goal-todo-ui/vite.config.ts
# 另一个终端
node dev-docs/goal-todo-ui/check.mjs
node node_modules/.bin/vitest run --project dom src/renderer/components/goal/GoalStatusBar.test.tsx src/renderer/components/agent-status/AgentStatusPanel.lifecycle.test.tsx src/renderer/components/agent-status/useAgentStatusState.test.tsx
node node_modules/.bin/tsc --noEmit
```

页面 `http://127.0.0.1:5188/dev-docs/goal-todo-ui/preview.html` 仅绑定本机。fixture 只替换 TabContext 数据；共享 Goal/Todo 生产组件、CSS、ThemeRuntimeProvider 和状态投影。`check.mjs` 默认写 `/tmp/goal-todo-ui-evidence/`；可用 `GOAL_TODO_EVIDENCE` 指定证据目录，用 `GOAL_TODO_CHROMIUM` 指定已有隔离测试浏览器。截图、原始日志及 results.json 不进入 Git。

## 发布与真实验收

唯一桌面发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 在下一未冻结版本纳入；本改动不属于已冻结 v0.5.10 / `400b746a`。无服务端/数据库迁移。正式签名包和原生真实目标/待办路径尚未验收；待源CI/main交付后排队，既有运行任务不停止、客户端不重启。
