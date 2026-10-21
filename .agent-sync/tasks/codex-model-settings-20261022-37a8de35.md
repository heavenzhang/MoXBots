<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-settings-20261022 -->
<!-- git-project-sync-task:base=85981a95b5c9a8e8736d680572e2813b1f7809fd -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-MODEL-SETTINGS-20261022 — 独立模型策略设置

## Objective

将自动选模型、备用模型从供应商页拆为两个独立侧栏入口。保留备用为可选高级配置，明确自动同档备用与指定备用优先关系。仓库 https://github.com/heavenzhang/MoXBots.git 由本次用户确认沿用。

## Acceptance criteria / To Do List

- [x] 两独立入口、deep link、供应商页不挂载两卡片。
- [x] 复用原配置 writer；无配置迁移、恢复机制变更或用户配置改动。
- [x] 中英文说明及空状态指向正确配置位置。
- [x] 47 项 DOM 和 31 项原运行时回归；TypeScript 与改动文件 lint。
- [x] 真实 SettingsPage 浏览器交互、合成保存/失败/刷新及三宽度无横溢出；主 Agent 视觉复核。
- [x] 源码提交及远端功能分支同步：63fbaf74d0441616ac8d22bac93c6ae8d1f65f5c；最终文档提交的 handoff gate 以外部精确 SHA 回执为准。
- [ ] 唯一桌面 CI/main owner 统一集成，远端 main 验证。
- [ ] owner 下一未冻结制品及原生配置/真实 Provider/生产验收。

## Completed

两个独立入口及中英文说明已提交；既有配置和运行时逻辑保留。

## Verification

源码位于 renderer settings/nav/i18n；证据和运行方式 `dev-docs/model-settings-20261022/acceptance.md`；原始浏览器结果 `evidence/browser-results.json`。配置保存/API 为合成 transport，不作原生业务验收。主 Agent 单人实现、自验，无独立 reviewer，无外部模型调用；token/费用未知。

## Blockers and unknowns

共享计划现有 desktop owner 唯一负责 CI/main/构建/发布，开发会话不自行触发。未创建自动触发共享 CI 的 PR。当前分支提交不是已主干交付或已发布；owner 接收、CI/main 和发布状态以工作区同任务 result.json/发布队列回执为准，本记录不冒称接收。

## Deployment request

- Required: desktop client，UI 导航/说明修订；无 cloud auth、Host 或手机原生改动。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用 canonical plan。
- Handoff: 本功能分支及本记录；完整提交 SHA 从远端 branch 获取，避免文件自引用 SHA。
- Status: 源码/本地合成验证已完成；共享 CI/main/下一未冻结发行及原生验收待 owner。
- Dependencies: 既有 main 自动路由组件；无 schema/协议迁移，回滚为恢复之前制品，config shape 不变。
- Version/tag/artifact digest: 未分配，沿用 owner 统一版本和不可变制品规则。

## Next step

桌面 owner 获取功能分支的精确远端 SHA，复核本任务 diff 和证据，同步当前 main，在其统一 CI 批次通过后合入 main 并验证远端包含本次提交，随后选择下一未冻结制品完成原生配置保存/导航验收。
