<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/stream-resume-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-STREAM-RESUME-20261020-01

## Objective

用户明确授权按已讨论方案实现普通builtin API会话及Goal断流后自动续跑，已完成动作不重复，停止后不恢复，质量参考记录断流与接续证据。本仓库 https://github.com/heavenzhang/MoXBots.git ，不影响外部/订阅/托管Runtime或其它业务仓库。

## To Do List and acceptance

- [x] 核实仓库、remote、clean base18e13ce8d，建立独立worktree与任务分支。
- [x] 执行设计：沿既有Query/SessionModelRecovery/ContextRecovery ledger和原Goal turn authority接续；不得重发原始任务、伪造成功终止或重置恢复预算。
- [x] 确定性验证：输出前、文本中途、完整工具返回后断流；工具成功新ID重复不执行；未知工具结果不自动写；Stop/暂停/等待落盘竞态与原有冷恢复门禁。
- [x] 真实SDK合成Provider联调：普通会话及固定合成Goal owner，真实MCP counter=1；实际Rust Goal/生产与真实Provider另验。
- [x] 质量参考：持久化恢复证据、磁盘codec刷新后保留、缺失不冒称0/成功；实际展开/窄屏/键盘检查，主Agent非实现者复核UI。
- [x] 本地类型/lint和相关回归，主Agent整体审查。
- [ ] 提交精确SHA并交既定唯一CI与部署owner统一执行共享CI；通过后按既有流程正常合main、核实远端包含。
- [ ] 统一发布与真实用户验收：交既定owner下一未冻结批次，不自行CI/构建/发布/重启活动客户端。

## Owners and execution

主Agent负责核心恢复、接口、持久化、整体验收、主干交付及交接；resume_architecture先审架构后拥有bridge适配/测试，最后独立复核主Agent的turn集成；quality_report拥有shared evidence/renderer与独立helper/native loopback测试。互斥文件阶段交接，无并发源码writer。选择依据：恢复高风险，质量报告可独立；非实现者UI验收由主Agent。内置协作，不调用外部模型；主会话模型未切换。用量未知，不模拟低成本主模型。

## Completed

已关联报告00:22:04 / native0.5.14含前次HTTP拒绝修复，原始SDK同轮5次mid-response后通用409。历史证据缺失，不能据此归因特定上游或放开重放。本轮新增功能沿现有owner；外部副作用的语义幂等/未知回执仍需只读核对，不能宣称分布式exactly-once。

## Dependencies and next step

实现与本地验收已完成，下一步同步最新main组合验证、提交推送，再由唯一owner协调精确head共享CI与正常main集成。质量证据契约Message.streamRecovery由shared/streamRecovery.ts定义，server为唯一事实来源。既定唯一CI/部署owner01a12bc2-907a-7702-b6dd-788225c5dfe4，用户本次明确授权交接安排发布；已发预登记消息，尚未创建PR/触发共享CI，不自行分配版本号。

## Verification and evidence

已正常合并当前main70eb592fce70149575afc1f81fe101e9ec81c0cb，只解决plan追加冲突、保留双方记录；组合本地Vitest 29文件664项通过，含旧fingerprint跨namespace防重和故障前主动重复工具，以及新合入main的历史加载回归。组合TypeScript/ESLint通过；分类与agent docs通过，依赖检查0error/18既有warning。生产SessionStore磁盘读写与codec/Goal原turn集成8项通过。真实SDK0.3.296+私有合成provider三模式普通/固定Goal/Stop通过，counter=1，完成操作新ID重复拒绝，Stop零续跑。实际Playwright两尺寸/中英文/键盘/状态更新/旧消息通过，无页面error/横向溢出；主Agent已看图复核。细节、命令及边界见dev-docs/stream-continuation/acceptance.md，UI原始证据在项目指针work/MOXBOTS-STREAM-RESUME-20261020-01/ui。本机隔离fixture不替代真实Provider/实际Rust Goal/签名客户端/生产验收。原409证据位于项目指针work/MOXBOTS-409-20261019-01，不提交用户日志。

## Deployment request

Required，源码/本地验收完成后提交给上述唯一owner。无授权推断扩大到Host/backend/其它项目；保留原活动会话、用户文件/凭据、冻结候选与回滚制品。UI只展示已记录恢复事实，不为内容质量或业务验收打分。
