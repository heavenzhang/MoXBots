# MOXBOTS-MODEL-SETTINGS-20261022 — 模型策略独立设置

目标：将自动选模型、备用模型从供应商页拆成两个侧栏入口，解释两者关系。已有配置、配置 writer 和运行时故障恢复逻辑不变。

仓库 https://github.com/heavenzhang/MoXBots.git；基线 85981a95b5c9a8e8736d680572e2813b1f7809fd；分支 codex/model-settings-20261022。

## To Do List

- [x] 核实产品仓库、远端 main、干净分支和部署归属；使用隔离工作树。
- [x] 侧栏新增自动选模型、备用模型；供应商页不再挂载两张卡片。
- [x] 两个入口使用既有组件和 config writer，支持 deep link。
- [x] 中英文明确手动备用优先、自动同档备用及安全边界；更正原“在下方配置”空状态提示。
- [x] 47 项设置 DOM 回归、31 项运行时路由/主备回归、TypeScript、改动文件 ESLint 通过。
- [x] 实际浏览器视觉、交互和 1440/768/390 布局检查；0 page errors。
- [ ] 提交并推送功能分支、验证远端一致及 handoff gate。
- [ ] 既有 desktop 负责人统一 CI/main 集成。
- [ ] 下一未冻结桌面制品发布及原生用户路径验收。

## 事实和判断

`src/server/builtin-session/model-failover.ts` 的 `pickRef` 优先选择启用的用户备用，否则使用 `autoBackup`。自动路由将本轮档位的备用记录在 `src/server/auto-route/session-state.ts`，由既有 agent-session 读取。自动选模型是轮次准入决策，故障接管仍使用同一主备控制器；删除整个备用功能会影响手动固定模型和指定备用的用途。

保留备用为可选高级配置：通常可依靠自动模式同档备用；同档没有备用候选、兼容性不满足或无法安全续接时，不保证切换。不改变 SDK/API 适用范围和防重复执行约束。

## 验证证据

- Node 24：`vitest run --project dom` 限定 AutoRoutingSettings、ModelFailoverSettings、SettingsSidebar.i18n、useSettingsNavigation、SettingsPage.visionTool.dom、SettingsPage.linux.dom：6 files / 47 passed。
- `vitest run --project integration src/server/builtin-session/model-failover.integration.test.ts --project unit src/server/auto-route/admission.unit.test.ts`：2 files / 31 passed。
- `tsc --noEmit`：通过；改动 TS/TSX `eslint`：通过，仅依赖 baseline-browser-mapping 版本提示。
- 初轮失败为两处旧 switch 名称和一处旧提示文案断言，已随文案改动更新并复验通过。新增 DOM 检查误用了 Playwright 的 exact 参数，最终 tsc 检出后已移除并复验。
- `fixture.tsx` 渲染真实 SettingsPage/Sidebar/卡片；只有配置状态与持久化、模型目录/API 是合成 transport。`serve.mjs` 仅监听 127.0.0.1:8924，关闭 Vite proxy，不使用真实账号/目录/供应商。
- 运行：Node 24 `node dev-docs/model-settings-20261022/serve.mjs`，另一个终端运行 `node dev-docs/model-settings-20261022/browser-check.mjs`。

## 实际浏览器检查

`evidence/browser-results.json` 保存原始检查结果，截图保存于同目录。视觉、交互、窄窗口布局均通过主 Agent 自验：供应商页无两张策略卡片、两独立入口、自动开关、备用选择及启用、彼此不覆盖、刷新后浏览器合成配置保留、目录失败可见并可进入备用页、保存失败不改变已保存的值、中英文导航。

截图复核 `auto-routing-1440.png`、`model-failover-390.png`：沿用主题颜色/字体/间距、标题和卡片层级；窄窗口导航横滚，正文不溢出。未做独立 reviewer 验收，不能称独立通过。

浏览器脚本初轮把既有 CustomSelect 项当作 option，实际为有 accessible name 的 button；修正脚本后完整检查通过。QA server 初轮误拦截 `/api/*.ts` 模块和 fixture 缺 ImagePreviewProvider，只影响独立验收环境，已修正并重新执行完整检查；产品源码无相关改动。

## 交付归属与限制

部署单元 desktop client；唯一 CI/main/构建/发布会话沿用 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。不运行共享 CI，不创建会自动触发 CI 的 PR，不操作原生日常客户端。功能分支推送不触发 Test（仅 PR/main/dev 分支），无云服务/Host 部署、无 schema 迁移。版本与制品摘要由该 owner 冻结后登记；当前未知，不冒称发布或接收。

本任务单 Agent 实现并主审，小范围导航与文案变动不另设独立 reviewer。选择依据：既有组件移动，无新 owner 或通信协议；升级/回退：无；外部调用：0，确定性工具足够。实际 token/费用未知，未测算节省。UI 验证为本地合成环境，不能替代原生配置落盘、真实 Provider 或生产验收。
