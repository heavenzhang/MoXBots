<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/routing-single-scroll-20261025 -->
<!-- git-project-sync-task:base=c5fd489b56d2eb2f19923d9dddc5cb6097cd439f -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-ROUTING-SINGLE-SCROLL-20261025

## Objective

消除自动选模型候选列表和添加模型目录与设置页外层滚动叠加的双滚动条。保留全部模型内容、来源、档位、排序、暂停/恢复、移出和保存行为，不引入新功能或权限变化。

## Acceptance criteria

- [x] 主候选列表和添加目录不再独立限高滚动，设置页保留唯一主滚动路径。
- [x] 长列表不裁切，末行可达；原有搜索和列表操作正常。
- [x] DOM 防回归、定向 TypeScript/ESLint 和真实组件合成 Chromium 验收通过。
- [x] 验收证据、未完成边界和分支接续记录已保存。
- [ ] 既有唯一 owner 组织共享 CI 和 main 集成。
- [ ] 包含修复的正式客户端完成原生安装与用户路径验收，之后另行发布。

## Completed

原会话已完成两处最小 class 修改及 DOM 用例。本轮只读确认 main 尚未包含修复、远端任务分支不存在，复核原 diff 和浏览器证据，重跑最终定向检查，并补齐验收与任务记录。未重复实现或覆盖历史证据。

详细结果见 `dev-docs/routing-single-scroll-20261025/acceptance.md`，机器可读浏览器结果及截图在同目录 `evidence/`。

## Verification

Node 24.21.0 下 `AutoRoutingSettings.test.tsx` 14/14 通过；直接 `tsc --noEmit`、两文件 ESLint、`git diff --check` 通过。完整 `npm run typecheck` 的共享依赖补丁预检未通过，不能记为完整 npm 脚本通过。

既有 Chromium 验收为 `passed: true`、`errors: []`：17 个候选完整呈现、单滚动、末行和原交互可达、添加目录无嵌套滚动，390px 无横向溢出。该结果使用合成模型和内存保存，不替代原生或生产验收。

## Deployment request

单元：desktop renderer；共享 CI/main、版本和正式发布继续由既有唯一 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 协调。本开发会话不触发共享 CI、PR/main 集成、正式构建、安装或发布，也不向 owner 发送外部消息；本记录仅为持久交接，不表示 owner 已收到通知。

无配置迁移、Provider/权限变更或新增公网入口。回滚只需从候选移除这两处容器 class 改动及对应测试/记录，不回滚用户配置或业务数据。

## Blockers and unknowns

本地源码与合成验收已完成；独立 reviewer、共享 CI、main、原生安装和正式发布均未完成。提交前远端 main 为 `0d0ad99f5714d3da5be68b656807b24370e8907e`，目标文件仍是基线 blob；远端任务分支 404。最终远端交付身份以 handoff 回执为准，后续 main 状态须由 owner 重新核实。

## Next step

唯一 owner 获取 `codex/routing-single-scroll-20261025` 的固定远端 HEAD，独立审阅后安排共享 CI 和 main 集成；新正式包安装后验收真实设置页单滚动及原有列表交互。不要把本地测试、合成 Chromium 或任务分支推送跳级表述为原生验收或发布。
