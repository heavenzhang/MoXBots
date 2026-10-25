# MOXBOTS-CHAT-INDEX-20261025

会话索引由右侧移到左侧，展开标题位于标记右边。索引与正文隐藏可见滚动条，仍由原生容器、Virtuoso 与 ChatScrollController 负责滚动和定位；不新增滚动 owner。滚动条隐藏局限于 `chat-scroll-surface`，其他面板、代码块和编辑器的策略保留。

键盘可聚焦会话索引，Tab 进入具体条目，Enter 定位，Escape 收起并返回索引。指针离开时保留键盘焦点，焦点离开后收起；少于 3 条查询及窄窗继续遵循原有隐藏策略。中英文导航名称同步新增。

## 验证

- Node 24.21.0；定向 Vitest 4 文件 / 38 项通过：QueryNavigator 9、聊天焦点滚动 2、MessageList 冻结恢复 22、中英文资源一致性 5。
- 全量 `tsc --noEmit`、修改涉及的 TS/TSX 定向 ESLint、测试分类检查和 `git diff --check` 通过。
- `npm run build:web` 通过（默认构建 profile 的本地 Web smoke），包括 license、主题 CSS 和 8 项主题测试；保留既有 Baseline 数据与 chunk 大小提示。未生成正式签名安装包。
- MoXBots profile 实际组件，在本地 loopback 服务运行：MessageList + QueryNavigator + 原 scroll model/controller + theme。Chromium 和 WebKit 均验证了 80 条真实组件索引、正文滚轮、索引独立滚轮、首尾虚拟化定位、键盘聚焦/退出与草稿可用；两引擎运行时异常为 0。合成消息，无登录、Provider、真实业务数据或后台写入。
- 两引擎各检查 1440×900 主布局、900×600 短窗、720×450 CSS 布局视口（1440×900 在 200% 原生页面缩放下的等效布局尺寸）及 390×844 窄窗。这里没有操作日常 App 的实际原生 zoom 设置，不将等效布局验证称为已安装原生验收。
- 原有 `verify-chat-scroll.mjs chromium --follow-only` 通过：滚动 owner/像素交接、平滑及快速跟随、主动取消、reduced motion、阅读位置、footer/viewport 增长、导航和终态。历史高度种子专项由该参数明确跳过，未将其计为通过。

浏览器复现：

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node dev-docs/chat-index-left-20261025/browser-check.mjs
```

本机浏览器 revision 与共享依赖期望不同，实际调用使用 `MOXBOTS_QA_CHROMIUM` / `MOXBOTS_QA_WEBKIT` 指向既有 Playwright Chromium 1243 / WebKit 2259 可执行文件。复现脚本支持这两个环境变量。仅在本任务 ignored 依赖目录复制并补齐主干要求的 react-virtuoso 和 @tauri-apps/api 补丁；没有改写其他任务的共享依赖。初次环境失败与后续原始日志保存于 WPS 工作区 `work/MOXBOTS-CHAT-INDEX-20261025/logs/`。

证据：`evidence/browser-results.json`、两引擎截图、`evidence/scroll-results.json` / `scroll-scroll-ownership.json` 和 `source-sha256.json`。截图均为合成数据。主 Agent 已查看展开、收起、短窗和等效放大截图，并执行交互断言；这是作者自验，没有独立 Agent 审阅。

## 交付与发布边界

- 仓库 `https://github.com/heavenzhang/MoXBots.git`，分支 `codex/chat-index-left-20261025`，base `c5fd489b56d2eb2f19923d9dddc5cb6097cd439f`。
- 仅 renderer 与局部设计约定；无数据/协议/配置迁移，无 Host、cloud 或手机端发布要求。回滚可沿原桌面制品，无数据回滚。
- 桌面单元 `desktop-macos-arm64-updater`、共享 CI、main 集成及正式制品由既有唯一会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4`（MoxBots桌面端统一打包负责人）协调。开发分支 push 不触发当前 main/dev/PR CI；本任务不越权创建触发共享 CI 的 PR。
- 当前为源码和本地组件验收结果。main、共享 CI、下一未冻结正式版本/制品摘要、安装/发布、真实客户端原路径验收仍待 owner 执行。现有已发布版本不重写、不自动加入冻结批次。
- 0 子 Agent、0 外部模型调用，当前 Agent 实现/验收；未切换模型，实际 token/费用未知。没有触发共享 CI、正式版本分配、安装、重启、生产变更或跨聊天消息。

下一步：owner 复核任务分支精确 SHA，与最新 main 正常集成，协调必要 CI，再纳入下一未冻结桌面批次；安全窗口验证实际长会话的索引展开、滚动和首尾定位。
