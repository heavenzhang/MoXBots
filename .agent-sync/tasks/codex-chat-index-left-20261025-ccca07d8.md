<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-index-left-20261025 -->
<!-- git-project-sync-task:base=c5fd489b56d2eb2f19923d9dddc5cb6097cd439f -->
<!-- git-project-sync-task:status=ready-for-integration -->

# Task: MOXBOTS-CHAT-INDEX-20261025 左侧会话索引及隐藏聊天滚动条

## Objective

任务 ID：MOXBOTS-CHAT-INDEX-20261025。将聊天 QueryNavigator 移到左侧，索引标记在标题左边；隐藏索引和正文滚动条，保留原滚动 owner、虚拟列表与定位路径。范围为 renderer 展示，不改变 Session、Provider、数据或正式版本号。

## Acceptance criteria

- [x] 核对仓库、main、分支、工作区与既有任务；从远端 main c5fd489b56d2eb2f19923d9dddc5cb6097cd439f 创建独立工作树。
- [x] 左侧索引；无常驻滚动条；长索引最后一项可达。
- [x] 点击、键盘进入/退出、虚拟化消息定位、正文手动滚动与自动跟随回归通过。
- [x] 实际组件 Chromium/WebKit 渲染、长列表与窄窗/200% 等效布局验证。
- [ ] 提交并推送任务分支，远端 handoff 门通过。
- [ ] 唯一 CI/发布会话完成共享 CI、main 集成与远端包含核验。
- [ ] 下一未冻结桌面制品及真实客户端路径复验。

## Completed

实现和本地组件模拟数据验收通过；真实联调、生产验收、main 交付待后续证据。无需后端或业务写入联调。

## Verification

`project-sync.mjs start` 与 `task-init` 已通过。38 项定向测试、tsc、定向 lint、测试分类、本地 Web build（含 8 项主题测试）、Chromium/WebKit 两引擎长索引交互及 6 个响应式案例、原 Chromium 聊天跟随/滚动 owner 专项通过。详情和明确边界见 `dev-docs/chat-index-left-20261025/acceptance.md`，运行结果与源码 hash 在同目录 `evidence/`。

## Blockers and unknowns

桌面单元 `desktop-macos-arm64-updater` 及共享 CI 沿用唯一会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。本开发会话提交源码与发布请求，不越权触发共享 CI、正式构建、换包或重启日常 App。没有跨聊天发消息授权，持久队列不代表 owner 已接收。

执行记录：当前主 Agent 负责实现和 UI 自验，0 子 Agent。选择依据：范围集中，可直接验证。未切换模型；不调用外部原因：局部展示修改无需额外模型上下文。费用/token 实测未知，不宣称节省。

## Next step

核实远端任务分支 SHA 与 handoff，通过持久发布队列交既有 owner 正常 main/共享 CI 集成，再安排下一未冻结桌面制品和真实客户端验收；本任务不操作已发布或冻结制品。
