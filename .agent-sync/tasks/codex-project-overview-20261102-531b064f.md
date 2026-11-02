<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/project-overview-20261102 -->
<!-- git-project-sync-task:base=589351245610910476fb4f1328b7c8d4f83da203 -->
<!-- git-project-sync-task:status=in-progress -->
# MB-PROJECT-OVERVIEW-20261102

## Objective
项目工作台以整体进展为入口，紧凑展示真实任务与会话；不以 TODO 数量推定项目交付百分比。

## Acceptance criteria / To Do
- [x] 概览独立于筛选和搜索；正式任务、完成、运行、待处理、待验收、会话分别统计。
- [x] 状态筛选、关注优先/最近活动排序、紧凑列表、摘要两行、更多操作。
- [x] 关键投影和 DOM 回归、类型检查、定向 lint。
- [x] 浏览器合成数据 1440/1024/768/540 交互与布局。
- [ ] 远端主干集成；指定 owner 协调 CI 和发布。
- [ ] 真实安装版项目页、会话进入和归档路径验收。

## Scope and authority
沿用 TaskStore/Session 数据及现有恢复保护。概览仅统计未归档工作台；不声称项目里程碑、依赖顺序或交付完成率。执行顺序继续由已有任务执行机制决定，本次未新增自动调度器。

## Completed

上述实现已提交至本任务分支并同步远端；未修改 Task/Session 状态权威。

## Blockers and unknowns

等待既有桌面 owner 主干集成、统一 CI、版本、构建与发布；真实安装验收尚未完成，无本任务正式版本或制品摘要。

## Verification
43 unit/DOM/i18n tests passed. TypeScript noEmit passed. Targeted ESLint passed after replacing native select with CustomSelect. Browser synthetic journeys passed: 1440/1024/768/540, overview stable under search, more-actions disclosure. Screenshots reviewed at 1440; evidence `/tmp/moxbots-project-overview-evidence/overview-results.json`.

## Deployment unit and owner
桌面 builtin client；唯一 CI/版本/构建/发布 owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4`。本开发会话不分配正式版本、不触发共享 CI、构建、安装或发布；由 owner 集成并协调自动 CI。

## Next step
发布 owner 审阅精确分支 SHA，同步最新 main 后集成至下一未冻结批；CI/生产及真实用户验收未完成前不得标记整体交付。
