<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/goal-stall-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=ready-for-review -->

# GOAL-STALL-001 — Goal 超时结算与停止原因反馈

## Objective

- 目标：避免 Goal 在 watchdog 中止后丢失终态结算，显示未执行/恢复原因。
- 范围：原 builtin watchdog、原 terminal observer、GoalStatusBar；不新建调度或状态 owner。
- 仓库：https://github.com/heavenzhang/MoXBots.git；分支 codex/goal-stall-20261020。
- 初始基线：18e13ce8dbad20e61af3f84173ad87d84bf090a6；集成前同步最新 main。
- 唯一 CI/桌面发布负责人：01a12bc2-907a-7702-b6dd-788225c5dfe4；版本由其统一分配，本任务不递增。

## Acceptance criteria

超时后原Goal可以解释恢复原因，旧轮次唯一结算，已确认输出保留，未获完成证据的动作不盲重放；源码/本地/真实原生/main/发布分别验收。

## Completed

To Do List

- [x] 核实截图对应真实会话、日志、durable Goal 和日常安装版本 0.5.14。
- [x] 修复 Goal 超时先结算后 abort；不插入脱离 Goal owner 的自动续接输入。
- [x] 超时走原 automatic_replay_blocked 恢复路径，保留 Goal/历史和不确定动作，显示恢复原因。
- [x] 被 turn_conflict 拒绝的可见输入给出明确错误，仍保持未 dispatch。
- [x] 原版两项行为回归均失败；修复版相关 198 项通过，类型与定向 lint 通过。
- [x] 主 Agent 实际 Chromium 渲染：1280/390，原因可见、继续/取消各一次、无横向溢出；合成传输，不冒充原生。
- [x] 任务分支提交、远端同步，并合入最新 main 8e4c25928cb48b4a7417ea74c27512e566694655；合并后198项、类型、定向lint复验通过。
- [ ] 统一 CI 后合入 main，并核实远端 main 包含成果。
- [ ] 统一 CI 与发布接收、签名候选、实际原生 Goal/Provider 恢复验收。

## Verification

- PR168 的 parent containment 修复处理另一条旧桌面退出后 Sidecar 遗留问题；本任务不终止现有进程。
- 验收：dev-docs/goal-stall/acceptance.md；合成组件复验：同目录 preview.html、preview.tsx、check.mjs。
- 私有日志：交付工作区 work/goal-stall-001-20261020/，不提交用户 transcript 或完整会话数据库。
- 下一步：推送精确任务 SHA，交唯一负责人组织项目 CI/合入及下一未冻结版本；真实任务恢复需先核查遗留进程及原 Goal authority。
- 授权边界：本任务未改 live Goal、未发送原任务消息、未安装/重启/终止日常进程；没有把当前卡住任务记为已恢复。
- 执行记录：当前 Agent 实现与自验，0 子 Agent，0 外部模型；小范围单链路修复不值得重复上下文，未切换主模型，实际费用未知。

## Blockers and unknowns

统一CI、main合入、原生真实恢复和发布仍待唯一负责人；SDK无事件的上游具体原因未知。用户已明确授权向该负责人发送本次交接。

## Deployment request

Required：macOS arm64下一未冻结桌面版本；原生验收要核对超时Goal暂停原因、继续/取消、防重复执行以及PR168遗留进程治理。无配置迁移，无额外权限；沿既有不可变制品回滚。source已推送，CI/main/发布/当前卡住任务恢复均不得提前标记完成。Owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。

## Next step

唯一负责人从远端任务分支核实精确SHA和依赖，统一组织CI/合入及原生发布验收。
