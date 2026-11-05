<!-- git-project-sync-task:source-digest=42e7ec002710b503a0d6cb8458f3367dec474ea1fb13b3c25bb3267c989ede16 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=11dfc97b-8b19-49d3-9a1e-126115835704 -->
<!-- git-project-sync-task:branch=codex/mobile-continue-02-20261103 -->
<!-- git-project-sync-task:base=f719dad17191fc9ea260e8775be85c143af36f1d -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-MOBILE-CONTINUE-02 原会话工作进展与继续闭环

## Objective

沿最新 V10 的原会话继续路径，优化首页状态覆盖、会话工作概览、当前请求定位和成果返回。只投影既有 Session／回执／成果，不新增任务账本、执行 owner 或协议。

## Acceptance criteria

- 首页不能用部分已读状态的零计数冒充所有会话已处理；用户可分批读取未同步状态，保留 Bot／会话归属。
- 长会话内可持续看到本轮进展，直接定位当前请求、查看最近要求／回复、继续原草稿和打开本会话成果。
- 新消息不改变成果归属；成果继续修改回原会话且不覆盖已有草稿，不自动发送／重试。
- 320／390 宽度、长内容、等待请求、未知回执、离线、读取失败、切换账号／Bot 和返回行为验收；独立 UI 走查及主智能体复核。

## Completed

- 核对远端 main f719dad17191fc9ea260e8775be85c143af36f1d，隔离分支和工作树建立，旧工作保留。
- 固定工作进展/最近要求回复/原审批定位/成果入口与首页未知状态分批补齐已完成；范围和验收矩阵见 dev-docs/mobile-continue-02/PLAN.md。

## Verification

- Source digest: `42e7ec002710b503a0d6cb8458f3367dec474ea1fb13b3c25bb3267c989ede16`; Node24 mobile typecheck and full lint exit0; policy 124/124; independent UI/code review and primary 320/390 flow verification recorded in dev-docs/mobile-continue-02/acceptance.md; native iOS and real Host acceptance remain owner gates.

- 类型检查、全mobile lint exit0；124/124 policy通过；320/390产品组件主审和独立审阅通过本次有界检查，限制见 dev-docs/mobile-continue-02/acceptance.md 与 INDEPENDENT-REVIEW.md。

## Blockers and unknowns

- 原生真实账号／Host 业务验收与模拟 UI 分开。完整项目组织、业务发送提案、成果版本谱系不在本批范围。

## Deployment request

- Required: mobile 内部测试版本；不发布 desktop／Host／cloud／website。
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence and dependencies: 沿用现有 API／持久化／权限，无数据迁移或新跨单元协议；具体验收见同目录 acceptance.md。
- Status: not submitted; track code/main delivery, each unit rollout, and production acceptance separately.
- Owners: shared CI/main 01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile 构建/版本/签名/安装 01a12b99-7b38-78b1-831f-9c60257d386a。开发不触发共享 CI、不分配正式版本、不替换日常桌面。

## Next step

- 推送功能源，交原mobile owner合并版本材料，再由原sharedCI/main owner对固定候选组织一次CI/集成；原生验收门槛保留。
