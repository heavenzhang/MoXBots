# MB-EXECUTION-REMEDIATION-20261107

## 范围与现状

用户要求落实四项整改并恢复原群报告。当前分支codex/execution-remediation-20261107依赖修订冲突修复07dcf4d2701b03b165292f339ef9ac2cce7caa4f；canonical base为bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2。不是重写执行系统：复用SessionEngine、原生回执核对和原任务资源/依赖判断。

## 实现与验证矩阵

| 要求 | 实际实现 | 验证及边界 |
| --- | --- | --- |
| 已知失败自动纠正 | 既有execution-failure-reconciliation按精确native失败记录、当前owner及CAS纠正，保留失败事实；543.2已有此修复 | session-execution integration包含失败回执纠正及未知副作用隔离；不以失败代表业务成功 |
| 阻断说明原因、影响、下一步 | 543.2已有折叠栏原因；543.3允许新人工补充重新核对原暂停。本次新增9种稳定guard提示；现有恢复association增加只读blockedTasks名称投影，详情列出受影响步骤 | 17条消息单测、恢复46条、DOM恢复及状态栏验证；未知原始错误不直接展示，缺失绑定不猜测独立任务 |
| 自动核对既有回执，隔离相关依赖 | 原reconcileAvailableRecoveryProof在原锁下复用一次native读取，逐项重新核对owner/CAS；独立已声明任务包经原task-dispatch资源约束继续 | 自动核对无UI也可执行、存储失败停止、owner更换拒绝、独立任务可继续/同资源拒绝；未知操作不自动重放 |
| 恢复回归 | 原context-recovery/native-operation-journal、session-execution、recovery-reconciliation受影响套件 | 重启claimed不重放；compact前后成功回执保留；positional review不自增revision；后台claim和资源约束；取消后旧回调不越权；已确认派发前取消可由新人工输入重试 |

## 源码与组件验证

2026-11-07，Node24，8文件329项通过：unit的dispatch-failure-message/recovery-reconciliation/context-recovery/native-operation-journal，integration的session-execution，以及DOM的RecoveryActionReview/SessionExecutionStatus/ExecutionStatusBar。新增11项覆盖9类guard提示、后续依赖名称与未知关联不误判、详情展示且不派发业务。初次DOM构建发现缺少JSX闭括号，已修复后完整8文件通过，无遗留失败。

TypeScript、受影响ESLint、test classification和git diff --check通过。已有实际组件RecoveryActionReviewPreview增加合成依赖名称，内置浏览器验证打开详情后显示具体步骤、原因和下一步，截图观察1280×720无截断；未发送核查消息或操作真实业务。源码/合成验证不等于安装版或真实群报告完成。

## 发布与真实验收

- [x] 现有机制审查、补充源码、受影响回归与实际组件检查。
- [x] R1/R2精确SHA已推送并通过handoff；原发布负责人审阅。
- [x] R1/R2远端main包含，543.4实际安装与原报告保留核对通过。
- [ ] R3交付下一未冻结候选；新增诊断/受影响步骤原生展示仍待验收。
- [x] 543.3安装后由单一恢复负责人接续原群报告，实际图文产物及5项完成验证。

唯一desktop/macOS-arm64/updater/sharedCI/main owner仍01a12bc2-907a-7702-b6dd-788225c5dfe4。543.3已冻结，本次追加修改进入下一未冻结批，不重建/覆盖原制品。当前会话只负责源码及原群报告恢复验收，不触发共享CI或正式构建。云/Host/mobile不涉及。

私有测试原始输出与安装、报告事实放交付工作区work/MB-EXECUTION-REMEDIATION-20261107；不提交业务记录、用户原文或运行账本。

## R2：原生模型失败原因持久展示

原报告在543.3已成功接续同一execution后，于2026-11-07 02:09发生native terminal api_error/HTTP502；本轮已结算且无pending写入，但状态栏只显示“执行过程中遇到问题”。这是本次真实验收发现的额外缺口，不归因于已修复的TASK_REVISION_CONFLICT。

原builtin terminal observer补充有界400～599整数状态（不改变原code、status、回执、重试与调度）；原execution owner映射为7类闭集只读failure诊断，随原任务保存。renderer仅对当前incomplete/turn_error投影原因和下一步；未知操作、未结算、停止等原阻断仍优先，恢复运行后不显示旧诊断。原始响应正文、URL和凭据不进入新增字段；未支持的分类不推断。403项/10文件受影响回归通过，新增native终态到observer、ledger持久化、HTTP/压缩分类及UI防覆盖验证；TypeScript、lint、分类、diff通过。新旧原始失败日志均保留；初次测试中的owner fixture类型和Theme rerender折叠状态已修正。原实际组件IAB已看到HTTP502的固定原因、保留进度和接续说明。

## 543.3原会话真实完成

543.3精确安装binarySHA256 9833b95b0fa8e16584f177152e179fbff62e4c847ed43768e2ac72be9e8864e5，源6789cf4444a68bd0afa4c97e2838c605edf3a195，远端main4ceeb2d21acc164487ef199b4a5788d7d27c65f1已独立包含核验。原会话02:02接续，真实502终态后02:10从原进度继续，02:17原5步骤全部accept、phasecompleted；UI已确认。总计2次合法人工接续，第二次在已结算且无pending写入后，没有重复未知业务操作。HTML/Markdown/三张SVG通过210项报告检查；主Agent独立哈希读回与实际IAB图表检查通过。原报告和原数据保留。真实报告完成不等于R2新增字段已安装，R2仍须下一统一候选。

## R3：诊断文案准确性与543.4真实边界

R1/R2已通过PR259进入远端main a650939d2c38b8dc04750e282b159ddaac8ea346，主Agent独立fetch/祖先检查通过。543.4已安装，binarySHA256 1d90e729c483058f4683ba76b4b7b6dfb17b6cd77f17beea127dcb49e9ead982；原群报告5/5、原5份图文产物哈希和旧正文报告均未变化。普通问答和一次文件写入读回已由原生验收验证，但首条发送等待和冷恢复409后状态刷新另有缺口，由原模块负责人补修；新增failure诊断显示仍待原生受控失败验证，正式更新通道未晋级。

本次仅修正中英文context/replay两条固定提示：context_recovery_required也可能来自协议或恢复检查拒绝，不能断言容量已满；automatic_replay_blocked也可能是已投递模型请求、Query或预算约束，不能断言先前业务操作结果未知。改用“恢复检查未通过”和“本次模型请求不能自动重复”，保留原code、闭集诊断与全部执行约束。

R3验证：两份JSON解析通过，递归比较仅各2个预期failure文案值变化；现有SessionExecutionStatus DOM回归通过，git diff --check通过。文案纠正没有新增执行逻辑，不重复整套构建/403项回归；原生候选由唯一发布负责人统一核验。
