<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/replay-recovery-20261030 -->
<!-- git-project-sync-task:base=f072eff9a94724fc8802e939e51255dbf625ea3d -->
<!-- git-project-sync-task:status=in-progress -->


# Task: 修复误拦截、原会话恢复与错误状态显示

## Objective

MB-REPLAY-RECOVERY-20261030：查明截图原会话的首次结果未知原因，修复误拦截、原会话恢复闭环及工具错误显示成功。保留真实未知副作用的核对门禁。

## Acceptance criteria

- [x] 原会话精确根因及证据核对完成。
- [x] 回归覆盖误拦截，错误/拦截不显示成功勾选。
- [x] 产品实现与原数据只读内存验证：同一会话可通过产品恢复流程继续，无需新建会话或手工编辑账本。
- [x] 定向测试、类型检查、独立审阅及实际组件交互通过。
- [ ] 精确源码提交并交现有owner统一CI/main、发布和原会话真实验收。

## Completed

- 从已核实远端main f072eff9建立隔离分支；原会话账本仅只读检查。
- 分工：primary原证据/集成与验收；recovery服务端修复；ui界面修复；diagnosis独立原始证据定位。

## Verification

组合193项unit/DOM通过；原会话内存核对2项结清、旧错误4项修复、原文件不变；实际组件IAB宽窄与折叠工具行通过。其他测试及非实现者审阅见 dev-docs/replay-recovery-20261030/acceptance.md。生产待原owner。

## Blockers and unknowns

desktop/macOS/updater及sharedCI/main唯一owner 01a12bc2-907a-7702-b6dd-788225c5dfe4；开发线程不独立触发共享CI或安装。发布及原会话恢复需完成代码验收再由该owner协调。

## Next step

提交精确SHA至原owner，统一CI/main/发布后在原会话产品入口恢复与真实验收。证据位于dev-docs/replay-recovery-20261030/；原始私有取证保留本地work/MB-REPLAY-RECOVERY-20261030。
