# 独立 UI / 代码审阅

任务：MOXBOT-STATUSBAR-20261019。审阅基线 `main@18e13ce8d`，目标工作树 `codex/unified-statusbar-20261019`。只读检查源码并在隔离 Playwright Chromium 中打开真实组件合成页 `http://127.0.0.1:5197/dev-docs/unified-statusbar/preview.html`；未改产品文件、未部署、未运行构建或测试。

## 结果

目前没有需要阻断集成的独立 UI 问题。初次静态审阅发现的三项偏差已由主 Agent 修复，并通过本轮复验：

- 完成 Todo 冷打开不再单独复活状态栏；当前 Goal 或 Agent 区域仍在时，完成计数保留供查看。
- Escape 由整个状态栏处理。摘要按钮保持焦点时按 Escape 可收起详情并恢复该摘要焦点；以 `isComposing: true` 派发 Escape 不会收起详情。
- 子 Agent 列表在合并详情内不再创建独立纵向滚动容器。

## 实际检查

- 1280、390、320 CSS px：状态栏边界均在视口内，`documentElement.scrollWidth` 与视口宽度相等。320px 时摘要采用横向滚动，暂停和菜单仍固定可见；键盘聚焦到右侧子 Agent 摘要会自动滚动摘要条使其可见。
- 亮色主题下检查收起态、待办展开态；暗色主题下检查协作详情。状态、边框、待办进行中标记和协作行在组件面板内可辨认。
- 检查待办展开、Escape 收起、焦点返回及合成态 Escape；检查协作详情中的“本轮 / 整个会话”入口。
- 点击暂停后回执显示 `暂停一次 · 回调 1 次`，确认本次交互只触发一次回调。浏览器没有 page error。
- 主 Agent 在后续补充了 768px、42px 单行、恢复/菜单和终态长目标等验收；这些不计作本审阅者亲自操作的项目。

## 证据

- [320px 亮色收起态](evidence/reviewer-light-320.png)
- [320px 亮色待办详情](evidence/reviewer-todos-320.png)
- [320px 暗色协作详情](evidence/reviewer-dark-320.png)
- [1280px 亮色状态栏](evidence/reviewer-light-1280.png)
- [390px 亮色状态栏](evidence/reviewer-light-390.png)
- [320px 协作详情](evidence/reviewer-agents-320.png)

## 边界

以上是合成记录和浏览器组件验收，不证明 Tauri 桌面包、真实 Sidecar / Runtime 任务、真实后台日志或发布版本的业务验收。主 Agent 的构建与类型检查结果单独记录，不由本审阅重复验证。
