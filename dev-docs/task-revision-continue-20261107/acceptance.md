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
- [x] 源码07dcf4d2701b03b165292f339ef9ac2cce7caa4f已推送，原负责人PR258集成main4ceeb2d21acc164487ef199b4a5788d7d27c65f1；后续maina650939d2c38b8dc04750e282b159ddaac8ea346仍包含本修复。
- [x] 原负责人安装0.5.43/543.3同份签名归档；原业务负责人在原execution恢复执行并完成5/5，Root独立核实持久化。
- [ ] 正式更新通道晋级由原负责人后续统一批次完成；未把本地修复当公开发布。

## 证据与边界

私有原生日志、回归原始输出在交付工作区 `work/MB-TASK-REVISION-CONTINUE-20261107/`，不将业务聊天、运行数据或原文提交到 Git。源测试使用隔离临时 SessionStore，无真实业务写入。未重启日常客户端、未重放原业务、未伪造任务通过。

desktop/macOS-arm64/updater/sharedCI/main 仍唯一负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`；本分支不分配版本、不触发共享 CI 或正式构建、不安装。当前修复仅桌面会话执行控制；云/mobile/Host 不发布。

验证命令：内置 Node v24 + `vitest run --project unit` 的 sessionTaskReviewCommand、sessionTaskOrchestration、sessionExecution、CLI、dispatch-failure-message，以及 `--project integration` 的 session-execution/task-orchestration；438/438。`tsc --noEmit`、受影响文件 ESLint、check-test-classification、git diff --check 全通过。

旧临时检查测试末尾原来期待新人工请求永远被模型业务说明拒绝；现在保留“检查期间原 execution/证据/评审完全不变”断言，并验证新人工接续携带原阻断、仍缺身份时再次 paused，自动接续次数为0。这是本次修复的行为变化，不等同于自动解除业务限制。

## 真实验收回执（2026-11-07）

原execution `7c78b227-4644-41cf-996d-e9dba38aeda3` 已完成，五步均有accept评审，rootToolUseId `call_8a2469efc13643ef9eef2985`，持久化revision1613、pendingMutatingCount0。已交付HTML/Markdown图文趋势版，原负责人记录210项业务核验。业务材料未外发；具体行情内容与结论不由这次产品修复的438项源码测试证明。

543.3源码6789cf4444a68bd0afa4c97e2838c605edf3a195，归档SHA256 `055d4275e60a6019c4bd1689069f0ba7746e633a4fabffe170c3675adc57ec6c`。原生回执在交付工作区 `work/task-revision-continue-root-20261107/owner/original-report-root-completion-review.json`，业务回执 `work/MB-EXECUTION-REMEDIATION-20261107/original-report-completed.json`。原生日志中间出现真实502，原负责人在确认已结算/无未知写入后恢复完成；不宣称所有供应商故障均已解决。

后续543.4已在本机安装，并有独立的冷恢复409提示验收失败，正在543.5补修；这些后续场景与本次原会话完成分别追踪。公开通道尚未晋级本修复，原桌面负责人仍独占正式发布。
