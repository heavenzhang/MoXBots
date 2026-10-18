<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/goal-icon-20261018 -->
<!-- git-project-sync-task:base=3c95c51ed74b5da44093d74a9b3cf4a965a4e3ef -->
<!-- git-project-sync-task:status=in-progress -->

# Task: GOAL-ICON-20261018

## Objective

按用户补充，将目标模式小旗替换为共享 TargetIcon 靶心，统一草稿、执行状态、任务中心分类与调度目标入口。整批 GOAL-TODO-UI-20261018 + 本补充交既定统一发布会话下一未冻结版本，并完成正式原生验收，不打断运行任务。

## Acceptance criteria

- [x] 从当前 origin/main 隔离工作区，不触碰日常客户端或冻结0.5.10。
- [x] 目标标记统一共享靶心；保留状态文字、语义色与原操作owner。
- [x] 98项相关DOM回归、8组浏览器行为/适配检查和限定ESLint通过。
- [x] 完整TypeScript类型检查通过。
- [ ] CI与远端main交付（以PR和外部交付回执为准）。
- [ ] 用户已授权发送统一发布会话；最终PR/main与CI结果可用后交付。
- [ ] 下一未冻结正式客户端和真实Goal/Todo原生验收（唯一发布owner）。

## Completed

GoalStatusBar两态、TaskCategoryBadge和ScheduleTypeTabs使用既有TargetIcon；规范同步目标字形。原PR#117已在main b6c6d3529177453e61edf6fc03ce6deac6c89b31，CI6/6；原任务记录已补正。

## Verification

Node24下vitest定向4文件98/98，完整tsc --noEmit通过，ESLint三文件零警告。复用dev-docs/goal-todo-ui/check.mjs：实际组件8组、页面异常0，覆盖明暗、320/390/768宽度、长文滚动、操作回调、Escape与草稿保留。主Agent核读desktop-expanded截图，靶心无叠加装饰。原始日志/截图：用户工作目录output/goal-icon-20261018。浏览器fixture不能证明WKWebView或真实运行路径。

## Deployment request

唯一发布owner 01a12bc2-907a-7702-b6dd-788225c5dfe4。用户2026-10-18明确授权发送，整合PR#117与此补充至下一未冻结版本，禁止混入已冻结0.5.10/400b746a。遵守活动任务保护，不能为验收重启或终止日常客户端；遇原生单实例冲突，安排安全空闲窗口并保留未验收状态。无配置/数据迁移，回滚上一正式客户端并保留业务数据。正式包需要记录source SHA、签名/制品hash与原生真实Goal/Todo操作证据。

## Blockers and unknowns

正式原生验收依赖下一未冻结签名候选与安全运行窗口；本分支不操作stable feed、安装或启停客户端。发送回执、版本归属与验收结果写用户工作目录work/release-queue/GOAL-TODO-UI-20261018.json及output/goal-icon-20261018/DELIVERY.json，避免在已交付记录中预报成功。

## Next step

提交并执行正常PR CI，通过后合入最新main、核实远端包含成果，向唯一发布owner发送整批交付；继续追踪正式原生验收，保留未完成边界。
