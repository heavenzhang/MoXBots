# BG-TASK-LOG-001 UI review

状态：独立源码审阅及隔离 IAB 交互、响应式验收完成。未发现阻断 UI 使用的缺陷。

## 范围与依据

- 审阅 `src/renderer/components/agent-status/AgentStatusPanel.tsx`、`SubagentSection.tsx`、`BackgroundTaskDialog.tsx` 当前工作区候选。
- 设计依据：`specs/DESIGN.md` §4.1（加载/错误恢复）、§4.2（键盘、焦点与语义）、§4.3（迟到异步结果）、§8.2（工具终态）。
- 验收对象：当前工作区候选 UI，通过隔离 fixture 渲染；源码改动尚未提交。
- 不操作日常 MoXBots、用户 Chrome、真实账号或后台任务；浏览器验收仅限指定 fixture。

## 源码初审

- [x] 任务行使用原生 button，Enter/Space 默认可用，焦点样式可见；点击有 `onOpenTask` 时进入详情，不再定位消息。
- [x] 详情使用 portal dialog，声明 `role=dialog` / `aria-modal`，打开聚焦关闭按钮；关闭时尝试恢复打开前焦点；Escape 关闭并有 Tab 首尾循环逻辑。
- [x] 状态卡片淡出/卸载期间，已选中的对话框由独立条件继续渲染。
- [x] 只读界面未提供停止、重试执行或命令启动控件；刷新按钮只重新读取详情。
- [x] 在合成 fixture 的原消息缺失场景点击 local_bash 行可打开详情并显示日志；原消息缺失时提示清楚。
- [x] 延迟完成和失败都保持 dialog 打开；状态变为已完成/失败，最后日志仍显示，运行中提示消失。
- [x] 延迟断网时 dialog 保持打开，状态改为未确认，显示错误和刷新重试入口，旧日志保留且不持续转圈；组件测试另覆盖刷新后恢复。
- [x] 延迟切换 Session 后关闭旧详情，旧任务与日志不出现在新会话。
- [x] 空日志与 missing 日志提示不同；missing 状态仍明确显示任务运行中。
- [x] 默认视口浅色和深色正常；长日志 120,000 字节显示截断说明，日志区可独立纵向/横向滚动，弹窗 footer 保持可见，长行不撑破弹窗。
- [x] 390×844 窄视口浅/深色：弹窗完整落在 viewport 内，状态和任务 ID 可换行，命令与日志横向溢出局限在各自容器，footer、关闭按钮与刷新入口都可见；之后已恢复浏览器默认视口。
- [x] 1440×900 桌面视口：dialog 居中且保持最大 768px 阅读宽度，状态、命令、日志和 footer 清楚。
- [x] 键盘打开后首焦点到关闭按钮；Tab 可遍历命令、刷新和日志并循环回关闭按钮；Escape 关闭并将焦点恢复到触发行。
- [x] 深色模式状态、命令、长日志对比度清楚；关闭按钮 focus ring 可见。

## 源码审阅结论

异步读取随 Session、任务和手动刷新隔离，effect cleanup 会 abort 已过期请求；终态事件优先保留真实终态并触发最后一次日志读取。Session 改变时先隐藏旧详情、下一帧清除选中项，避免旧输出显示到新 Session。失败保留上一份日志并呈现未确认状态和可用刷新入口。未发现额外需要主 Agent 修复的 UI 问题。

## 浏览器验收记录

隔离 fixture：`http://127.0.0.1:5273/`，通过 CUA IAB 操作；运行期数据均为合成数据。页面开始时生产 Tailwind class 未纳入 fixture CSS 扫描，导致 dialog 在 AX 树可见但截图不可见；主 Agent 为 fixture 加入 renderer `@source` 后重新加载，视觉显示正常。该问题属于 fixture 配置，不是产品源码。

复核结果：点击 `展开 Agent 状态面板` 后，local_bash 行无工具消息仍可打开；状态、执行命令、日志、刷新和只读说明分区清楚。`empty` 与 `missing` 分别展示“任务尚未输出日志”及“日志文件暂不存在”，任务状态仍显示运行中。长日志模式显示 120,000 字节截断提示；日志区内有独立滚动条，水平溢出限制在日志区，弹窗主体滚动和固定 footer 正常。深色主题可读，关闭按钮聚焦态明显。

键盘复核：打开时关闭按钮获得焦点；Tab 可聚焦命令、刷新、日志区域，再 Tab 从日志返回关闭按钮；Escape 关闭并把焦点还给触发任务行。刷新过程持续轮询，日志下方可见最后更新时间和只读说明。

终态和错误使用 fixture 的延迟控件复核：3 秒后完成、失败、断网和切换 Session 均在 dialog 打开后触发。完成/失败保留窗口和最后日志；断网时错误明确、终态未确认且可刷新；Session 切换关闭旧详情。viewport override 在验收后重置。截图证据：`output/bg-task-log-001-20261018/ui-review/02-narrow-dark-long.jpg`（390×844 深色长日志）、`03-wide-running.jpg`（1440×900）和 `04-narrow-light-running.jpg`（390×844）。完整证据目录：`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/bg-task-log-001-20261018/ui-review/`。
