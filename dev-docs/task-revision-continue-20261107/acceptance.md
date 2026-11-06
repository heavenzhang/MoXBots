# MB-TASK-REVISION-CONTINUE-20261107

目标：评审命令不再制造自己的修订号冲突；原任务因模型评审暂停后，新的可信人工补充可以重新核对原阻断，并保留原范围、权限、未知结果与原始记录。

## 根因与修复

543.2 原生日志显示：用户补充在队列预派发阶段被原 execution 的 blocked assessment.summary 拒绝，尚未交给业务模型。此前四次步骤评审使用 `moxbot session tasks review --data ...`；CLI 实际按 data 路由，但原生解析器不识别 positional review，工具开始即被当作普通 Bash 写入 executionEvidence 并增加 revision，造成评审自身冲突。没有绕过 CAS，修复直接识别同一个精确命令及其 review payload；复合 shell、重定向、包装器、伪造回执仍不认可。

第二处：原生根回执已确认的 blocked/needs_user assessment 在真正终态后，禁止自动接续，但新的可信人工输入可以沿原 execution 获得一轮重新核对机会。要求 summary/原 assessment/已提交 review/queue 完全匹配；未知写入、unknown claim、未结算、交互审批、后台占用仍拒绝。运行时提醒保留原业务阻断，说明新输入不代表阻断解除或新增权限。只读临时检查本身仍不恢复原任务。

## To Do

- [x] 核对实际仓库、main、安装 0.5.43/543.2 与原会话日志；只读，未改用户数据。
- [x] 旧源码反事实：4 个新增检查失败，包含实际 native start revision 4→5 自冲突。
- [x] 初步修复：相同 4 项通过。
- [x] 完整受影响回归 7 文件 / 438 项通过，TypeScript、受影响 ESLint、分类和 diff 检查通过。
- [ ] 提交、推送精确源码并由原负责人审阅集成远端 main。
- [ ] 原桌面负责人构建下一不可变候选、安装并验证原会话。

## 证据与边界

私有原生日志、回归原始输出在交付工作区 `work/MB-TASK-REVISION-CONTINUE-20261107/`，不将业务聊天、运行数据或原文提交到 Git。源测试使用隔离临时 SessionStore，无真实业务写入。未重启日常客户端、未重放原业务、未伪造任务通过。

desktop/macOS-arm64/updater/sharedCI/main 仍唯一负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`；本分支不分配版本、不触发共享 CI 或正式构建、不安装。当前修复仅桌面会话执行控制；云/mobile/Host 不发布。

验证命令：内置 Node v24 + `vitest run --project unit` 的 sessionTaskReviewCommand、sessionTaskOrchestration、sessionExecution、CLI、dispatch-failure-message，以及 `--project integration` 的 session-execution/task-orchestration；438/438。`tsc --noEmit`、受影响文件 ESLint、check-test-classification、git diff --check 全通过。

旧临时检查测试末尾原来期待新人工请求永远被模型业务说明拒绝；现在保留“检查期间原 execution/证据/评审完全不变”断言，并验证新人工接续携带原阻断、仍缺身份时再次 paused，自动接续次数为0。这是本次修复的行为变化，不等同于自动解除业务限制。
