<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/goal-todo-ui-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: GOAL-TODO-UI-20261018

## Objective

优化聊天目标模式和 To Do List 的交互规范及实际组件；主 Agent 实现，ui_review 独立审阅。沿用权威 origin/main，不改执行、持久化和发布 owner。

## Acceptance criteria

- [x] 核实仓库/remote/main/worktree，隔离任务分支。
- [x] 中性目标状态条、状态/目标分层、明确操作、长目标可展开。
- [x] 待办紧凑摘要、当前任务优先、完成折叠、共享滚动、键盘语义。
- [x] 维护权威交互规范与合成组件验收入口。
- [x] 39项定向DOM回归、8组实际组件视觉/交互、独立审阅。
- [ ] TypeScript、限定lint及CI：最终状态查询PR#117和本地交付证据。
- [ ] 正常 CI、同步最新主干、合并并核验远端 main。
- [ ] 下一未冻结正式包和原生真实目标/待办验收（统一发布 owner）。

## Completed

目标/待办实际组件、交互规范、中英文本、合成验收入口已提交。39项DOM与8组实际组件浏览器检查通过，独立审阅无阻断问题；限定ESLint通过。源实现提交b4125e060；后续仅补验收记录。正式包和main/CI状态仍分开跟踪。

## Verification

证据与可复现命令：`dev-docs/goal-todo-ui/acceptance.md`；实际组件合成 fixture 只替换 Tab 数据，不连接真实账号或启动模型任务。

## Deployment request

桌面 renderer 更新需唯一发布会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 纳入下一未冻结版本；不进入已冻结 0.5.10 / 400b746a。本聊天不操作 stable feed、日常客户端或已冻结源码。无配置/数据迁移；回滚为上一正式客户端，用户业务数据和目标状态保留。此持久记录不等于已通知另一聊天。

## Blockers and unknowns

内置浏览器两次导航/绑定超时；使用现有项目隔离浏览器工具继续组件验收。正式签名包/原生和实际用户路径尚待发布流程。

## Next step

PR#117（https://github.com/heavenzhang/MoXBots/pull/117）正在正常CI；通过后同步main并合入，核验remote ancestry。正式包由唯一发布owner后续处理。
