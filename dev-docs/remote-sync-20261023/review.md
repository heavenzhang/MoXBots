# MB-REMOTE-SYNC-20261023 独立 UI / 权限回归审阅

审阅身份：非实现者；未修改产品源码、App、GlobalSidebar、API 或任务记录。仅新增 `RemoteSessionSidebar.test.tsx` 与本审阅记录。审阅目标是侧栏对既有 Remote Tabs 的只读投影与账号隔离行为。

## 已完成

- [x] 阅读 `RemoteSessionSidebar.tsx`、`observation.ts`、`tabContract.ts`、`accountFence.ts` 和 `GlobalSidebar.tsx` 接线。
- [x] 新增 7 个 DOM 组件用例：点击选择既有 Tab；已验证来源/选中态/未读标记；关闭只触发本地回调且不提供 Stop；身份 pending 使用通用信息；principal/network mismatch 隐藏条目；旧认证代次观测与标题不显示；旧代次排前时当前代次仍优先并可点击；相同远端身份去重但保留不同 session；折叠与展开。
- [x] 使用 `/opt/homebrew/opt/node@24/bin/node` 和工作区已链接 `node_modules` 跑定向 DOM 测试：7/7 通过。
- [x] 用同一 Node 24 运行定向 ESLint：通过，0 warnings。工具提示 `baseline-browser-mapping` 数据较旧，与此次改动无关。

## 静态审阅观察

- `RemoteSessionSidebar` 从传入的 `tabs` 直接生成行，不维护第二份会话列表或会话所有权。
- 点击行只调用 `onSelect(tab.id)`；关闭只调用 `onClose(tab.id)`。组件没有 Stop 操作。
- 当前观测通过 `currentRemoteObservation` 同时要求账号身份匹配和观测认证代次等于当前认证代次。显示已存标题还要求当前网络认证代次等于 locator 代次；否则标题退回通用文案，来源显示身份恢复中。
- `remoteAccountState` 在 principal 或 network 已知不匹配、或 signed out 时判为 mismatch；任一身份字段仍未知时判为 pending。
- 主 Agent 已调整去重投影：相同 identity 优先当前 authGeneration，其次 active Tab，同时保留 identity 首次出现位置。新增回归用例以旧代次在前、当前代次在后构造列表，确认当前行标题显示、旧标题/观测不泄漏且点击回调指向当前 Tab。定向测试通过。

## 验收边界与待办

- [x] 组件级 DOM 与静态源码审阅完成。
- [x] 使用独立 Playwright headless Chromium（Node v24.21.0，未使用用户 Chrome 或当前 IAB）运行实际组件 harness：1440×900 和 900×760 的指定交互路径均通过；证据及截图见 `work/MB-REMOTE-SYNC-20261023/product-ui-independent/`。
- [x] 初次检查捕获到关闭按钮错位：900×760 条目 rect `{x:81,y:161,w:302,h:62.4}`、关闭按钮 rect `{x:75,y:229.4,w:24,h:24}`；`Tip` 包装 span 计算 position 为 `relative`，其行内流入撑高列表项。已将实测坐标和截图保存在本目录，作为修复前证据。
- [x] 主 Agent 将绝对定位移至独立 `div` 后复验：1440×900 close rect `{x:218,y:300,w:24,h:24}`，父行 `{x:8,y:294,w:240,h:62.4}`；900×760 close rect `{x:353,y:167,w:24,h:24}`，父行 `{x:81,y:161,w:302,h:62.4}`。两个尺寸中按钮均位于行内右上角，wrapper 的计算 position 为 `absolute`；父行高度与内容行一致。关闭后剩余行仍为 62.4px；浮层关闭后重开检查亦为 62.4px。点击后本地条目移除，未发出 start/send/respond/stop mutation。修复后截图为 `close-fixed-1440x900.png` 与 `close-fixed-900x760.png`。
- [ ] 未使用已登录用户账号、未连接另一设备、未验证真实远端会话持久化或服务端权限；测试证明的是 mocked network snapshot 下的客户端渲染边界，不构成真实联调或生产验收。

主 Agent 提供的 harness 在两种 viewport 下通过指定路径，无 renderer errors。后台活动不抢焦点；切回原 Tab 成功；断线保留草稿并禁用发送；恢复后更新内容且草稿仍在；浮层有远程条目且无横向溢出；关闭后本地条目消失。关闭动作附近 transport kinds 多一条 `get`（移除当前会话后新活动会话的读取），没有 `start`、`send`、`respond` 或 `stop` mutation。见 `product-ui-independent/checks.json`。

与原型比较：实际页面沿用真实 `GlobalSidebar` 和会话组件，显示状态栏及普通消息时间线；原型使用自定义工具进度块和额外解释文案。这些呈现差异符合沿用现有会话组件的范围，当前未见核心流程阻断。浮层本身更高，包含现有工作区空态；这是现有组件结构差异。关闭按钮错位已由主 Agent 修复并在 1440 与 900 两种宽度确认对齐，未发现仍会阻断紧凑窗口关闭操作的问题。

任务状态：独立 DOM/静态审阅及两种 viewport 的组件浏览器检查完成；修复前、修复后的 close 定位证据均已保留。浏览器证据只代表真实 renderer 组件配合模拟账号/传输，不是双设备或生产验收。请求模型为 gpt-6-luna / medium；本执行环境未提供实际模型调度或用量证据，因此实际模型与用量均未知。
