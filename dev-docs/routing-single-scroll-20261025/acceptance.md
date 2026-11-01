# 自动选模型单滚动修复验收

- 任务：MOXBOTS-ROUTING-SINGLE-SCROLL-20261025
- 分支：`codex/routing-single-scroll-20261025`
- 基线：`c5fd489b56d2eb2f19923d9dddc5cb6097cd439f`

本文件记录原会话已有实现、最终复核和交付边界。最终提交及远端分支 SHA 以 Git/handoff 回执为准，不在本文件中写自指 SHA。

## 目标与范围

修复自动选模型设置中候选列表和“添加模型”目录各自限高滚动、与设置页外层滚动叠加的问题。目标界面只保留设置页外层滚动，不裁切候选或目录内容。

仅修改 `AutoRoutingSettings` 的滚动容器及其回归测试，补充真实组件合成浏览器验收和任务记录。不改变供应商目录、候选来源、档位、排序、暂停/恢复、移出、配置 writer、Provider、权限或发布设置。

## 根因与实现

外层设置页已经在 `src/renderer/pages/settings/SettingsPage.tsx` 使用 `h-full flex-1 overflow-y-auto overscroll-contain`。以下内部容器再次限高并启用纵向滚动，形成双滚动条：

- 添加模型目录：移除 `max-h-48 overflow-y-auto`，保留 `mt-2`。
- 主候选列表：移除 `max-h-[min(55vh,36rem)] overflow-y-auto`，保留原边框和布局类。

业务数据、控件和保存逻辑未改。新增 DOM 用例 `keeps candidate and directory lists in the settings page scroll flow`，断言两个容器均无独立滚动或限高，并确认候选仍完整渲染。

## 分项状态

- [x] 定位双滚动条的直接容器和外层滚动 owner。
- [x] 主候选列表与添加目录回到设置页单一滚动路径。
- [x] 保留候选、来源、档位、排序、暂停/恢复、移出和添加模型逻辑。
- [x] DOM 防回归、定向 TypeScript/ESLint 和 diff 检查。
- [x] 真实组件＋合成数据的 Chromium 长列表、交互与窄屏验收。
- [x] 验收证据和分支接续记录。
- [ ] 共享 CI、main 集成：本轮明确不触发，由既有唯一 owner 协调。
- [ ] 正式客户端安装、原生用户路径验收和发布：本轮未执行。

## 最终本地复核

2026-11-01 使用 `/opt/homebrew/Cellar/node@24/24.21.0/bin/node`，显式清除 `NODE_OPTIONS`：

- `vitest run --project dom src/renderer/pages/settings/AutoRoutingSettings.test.tsx`：1 文件、14/14 测试通过。
- `tsc --noEmit`：退出码 0。
- 两个修改文件的 ESLint，`--max-warnings=0`：退出码 0；仅输出既存 `baseline-browser-mapping` 数据过期提示。
- `git diff --check`：通过。

此前完整 `npm run typecheck` 在 `scripts/patch-react-virtuoso.mjs` 预检处报 `Chat scroll repair is missing. Run npm run postinstall.`；未修改共享符号链接依赖，也未把直接 `tsc` 通过表述为完整 npm 脚本通过。

## Chromium 合成验收

`browser-check.mjs` 通过 Vite 加载真实 `AutoRoutingSettings`，`fixture.tsx` 提供 23 个合成模型，其中 17 个在候选池；保存仅写内存，不接触真实配置或 Provider。

已通过项目：

1. 17 个候选全部呈现，列表自然撑开，只有外层设置容器滚动。
2. 搜索筛选及恢复、末行滚动可达。
3. 末行档位菜单、暂停/取消、移出/确认可用。
4. 添加模型目录不独立滚动，无内容裁切。
5. 390×760 窄屏无横向溢出或嵌套滚动，页面错误为空。

桌面测量：外层 `clientHeight=760`、`scrollHeight=1954`；列表 `clientHeight=scrollHeight=1339`，`overflow-y=visible`、`max-height=none`、`nestedScrollers=[]`。添加面板与窄屏详细测量见 `evidence/browser-result.json`。

证据：

- `evidence/browser-result.json`
- `evidence/candidates-top.png`
- `evidence/candidates-bottom.png`
- `evidence/candidates-mobile-bottom.png`
- `evidence/final-checks.txt`

这些是本地合成浏览器结果，不是共享 CI、原生安装、真实 Provider 或生产验收。本轮未重跑会覆盖旧截图的浏览器脚本，复用原通过证据并复核脚本和结果。

## 提交前远端只读核对

- 当前远端 main：`0d0ad99f5714d3da5be68b656807b24370e8907e`。
- GitHub compare 显示 main 相对基线为 `ahead`，基线 ancestry 成立。
- main 上两个目标文件的 blob 分别为 `d49adf67189c57c18250d0b0816dcfd38fb85dd6`、`9592431513c38490a3bf0e4bad1c0c33b3e92dab`，与本任务修改前基线一致；main 尚未包含本修复。
- 远端任务分支查询返回 404，没有既有远端任务分支可覆盖。

`project-sync observe` 通过并提示 canonical remote object 尚未 fetch；未为本次局部交付重写或清理工作树。远端 ancestry 使用上述 GitHub compare 独立核实。

## 执行与恢复记录

主 Agent 沿用原会话、原 execution 和原任务清单，未派发子 Agent，未改变模型或权限设置。旧 `routing-scroll-fix` 验收意图未结算时未盲目重放；本轮重新取得实际代码、远端和测试证据后再进行主 Agent 评审。

补任务记录时 `project-sync task-init` 返回 `BLOCKED`，实际原因为 `canonical_remote_unverified` 和 `worktree_dirty`；没有清理或重置原修改。随后按协议相同 branch/base 元数据手工补齐缺失记录。

首次 handoff 已确认远端任务 HEAD 与本地一致，但返回 `task_state_missing`，要求记录路径为 `.agent-sync/tasks/codex-routing-single-scroll-20261025-d9eee7db.md`。随后仅改名到门禁要求路径并追加提交，不改写已推送历史；最终状态以再次执行的门禁输出为准。

本轮未发送外部消息，未触发共享 CI、PR/main 集成、正式构建、安装或发布。

## 下一步与未完成边界

既有桌面唯一 owner 可从任务分支取得固定提交，组织独立审阅、共享 CI 和 main 集成。只有包含该提交的新正式客户端安装后，才能进行原生单滚动与实际列表交互验收；当前不得宣称已经合入 main、发布或原生验收通过。
