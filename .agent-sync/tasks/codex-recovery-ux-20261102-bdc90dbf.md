<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/recovery-ux-20261102 -->
<!-- git-project-sync-task:base=589351245610910476fb4f1328b7c8d4f83da203 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-UX-20261102 中断恢复交互与自动检查

## Objective

MB-RECOVERY-UX-20261102：将用户无法理解的“核对操作结果”列表改为系统自动检查、紧凑状态卡、按需详情与明确下一步。复用原 Session mutation owner、签名恢复入口及操作账本，不创建新的恢复执行器。

## Acceptance criteria

- [x] 正常会话不展示核对入口；中断与待确认事项展示 checking / pending / ready / unavailable。
- [x] 仅自动记录原 owner 已证明的拒绝未执行或只读任务查询依据；未知操作继续保护。
- [x] 使用最新摘要串行提交；丢失响应先回读，不重发同一操作；会话切换/忙碌/卸载淘汰迟到结果。
- [x] 操作类型、可核实的文件名与下一步可见；原始命令、消息正文及完整路径不进入检查摘要。
- [x] 单一滚动详情侧栏、键盘关闭与焦点返回；补充结果准备草稿并保留已有输入。
- [x] 原有继续入口保持挂载、准入与防重复状态；检查不执行业务工具或发送模型消息。
- [ ] 唯一原桌面 owner 独立审阅、共享 CI、主干合入、签名版本及原会话实装验收。

## Completed

实现 RecoveryActionReview / RecoveryActionDetails、SessionRecoveryPanels、Chat 草稿入口、双语文案及基于原生记录的可选展示投影。既有工具与结果 owner 未变；无新迁移/持久化表或版本分配。详见 dev-docs/recovery-ux-20261102/acceptance.md。

## Verification

定向 unit/dom 159 项通过；恢复 integration 28 项通过。TypeScript、定向 ESLint、测试分类、git diff --check 及本地 Vite renderer build 通过。IAB 实际组件+合成输运：桌面/390px、浅/深色、自动处理、未知保留、草稿、关闭/焦点通过；不是原生 SDK 或真实业务验收。

## Blockers and unknowns

desktop builtin client / macOS-arm64 / updater / shared CI / main 唯一负责会话仍为 01a12bc2-907a-7702-b6dd-788225c5dfe4。主干与实际发布需由其组织。现有原生信息缺失时无法恢复具体对象，明确展示缺口；不会猜测业务结果。用户补充说明进入普通原会话草稿，不直接结清未知操作。关闭仅延后处理，不跳过底层依赖。正式版本、制品摘要和发布批次尚未分配，已有冻结制品不可变。

## Next step

原桌面 owner 审阅精确源码提交及 187 项验证，统一安排下一未冻结候选 CI/main；安装需沿其现有安全维护窗口与原会话核查。源码、main、制品、安装、真实业务结果分阶段回执。


## 完整恢复流程续接

用户明确要求“把它做完”。基线更新到main82dffd887并保留导航，详见dev-docs/recovery-ux-20261102/PLAN.md与acceptance.md新增完整流程章节。完成：真实原生成功证明、Write目标字节核查、一次性原owner核查、持久补充/延后、精确任务/依赖归组、独立任务资源保护、底部共享摘要、原execution精确同步和安全续接。未知、Stop、资源、最终验证不绕过。

本轮218unit/dom+106integration+285原保护/adapter+15dispatch通过，共624项；另真实SDK原生Write/历史/冷恢复loopback通过（合成模型，零付费）。本地类型/lint/分类/依赖/构建通过需以最后日志复核；新增真实浏览器被Work设置禁用，不能冒充验收。原owner已恢复活动，最终精确源交其独审/统一CI/main/下一未冻结版本/安全安装与原会话验收，不另建发布owner。旧985e7a1a仅第一阶段，已通知不作为完整候选。
