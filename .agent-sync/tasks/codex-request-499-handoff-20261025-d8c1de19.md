<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/request-499-handoff-20261025 -->
<!-- git-project-sync-task:base=c5fd489b56d2eb2f19923d9dddc5cb6097cd439f -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-499-20261025 排队输入恢复交接与任务状态修复

## Objective

修复用户已排队的新输入在强制中断旧请求后被旧 modelRecovery.paused 拦为本地 499，以及停止后 To Do 仍显示执行中的问题。用户明确要求修复、打新包并替换本地；保留原会话、账本与未提交工作，不重放历史业务。

## Acceptance criteria

- [x] 可复现旧故障的回归测试先失败，修复后通过。
- [x] 已明确接纳的真人排队输入仅在原生终态及持久暂停结算后，通过原恢复 CAS 获取新轮次；Stop、取消、过期/不确定结果和旧回调仍拒绝。
- [x] To Do 的历史计划状态与当前执行活动区分，停止后无虚假“执行中”。
- [ ] 聚焦回归、类型、lint 通过；本任务修改提交并核实远端 main 包含成果。
- [ ] 既有桌面 CI/发布负责人完成新版本构建、备份/替换本地与实际路径复验，记录 SHA、版本、制品摘要及回滚目标。

## Completed

- [x] 只读诊断已完成；运行实例为 0.5.23/build523.1，日志见本地交付目录 output/MOXBOTS-499-20261025/235108。
- [x] 独立工作树从远端 main c5fd489b56d2eb2f19923d9dddc5cb6097cd439f 建立，未动 routing-single-scroll 的已有修改。
- [x] start/task-init gate 通过；已向既有发布负责人提交本次紧急批次请求。

## Verification

- 代码/模拟验证：263基础集成、149单元、35DOM通过；构建前追加内部重试继承标记回归，先红后绿，相关10项通过；tsc、lint、分类和diff通过。验收 `dev-docs/request-499-handoff/acceptance.md`。
- 真实 SDK/Provider/原生安装验收：待构建负责人组织；本地回归不替代真实路径。
- 当前 Agent 直接实现与集成；增加1名只读独立审查，因取消/准入竞态需非实现者复核，未发现阻断问题。小范围UI由主Agent负责1280/390真实组件页面验收；未调用外部模型。

## Blockers and unknowns

- desktop builtin client 唯一 CI/构建/发布/安装负责人：01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人）；不从本开发工作树触发共享 CI 或正式构建。
- 用户已明确授权更换本地，仍需发布负责人核实活动任务、安全窗口和有效备份，不清空业务账本或重复执行已完成操作。
- 上游响应头超时未定位到单一服务商/网络原因；本任务修复可证实的本地请求交接及状态投影缺陷。

## Next step

提交并推送本任务精确源码交接，发布负责人统一合main/共享CI/构建/安装；随后核实远端main、制品版本及实际路径。
