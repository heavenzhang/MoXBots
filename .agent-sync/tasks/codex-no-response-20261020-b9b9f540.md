<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/no-response-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-NO-RESPONSE-20261020

## Objective

修复显式继续在推导的历史锚点被 native loader 拒绝后被旧准入检查取消、没有回答的问题；补齐 Unix 桌面父进程退出后的 Sidecar 生命周期兜底。保留原 Session、输入和已执行动作；不改薪资业务、配置、权限或版本号。

## Acceptance criteria

- [x] 通过当前日志及公开 CLI 对齐原会话、最新请求与 idle 状态。
- [x] 隔离复现 native 先消费输入后零轮次拒绝推导锚点：旧版重试被判 stale，无回答。
- [x] 修复后单一可见输入、一次模型回答；双击/失效状态与显式回溯保护保持。
- [x] 恢复准备期间 Stop 仍能阻止再次进入 SDK。
- [x] Unix 真实三层进程组夹具验证桌面父进程被 SIGKILL 后 Sidecar/native/tool 退出，含忽略 SIGTERM 的工具。
- [x] 相关完整回归、Rust 生产启动参数验证及类型/lint/build。
- [x] 提交、推送远端任务分支及 Git handoff gate；PR168 已创建。
- [ ] 唯一 CI/部署会话统一组织共享 CI，按既有流程合入 main 并核验远端包含。
- [ ] 唯一发布会话接收、主干精确 SHA 候选、正式客户端安装及原会话真实路径验收。

## Completed

准入提交时释放已消费的 beforeDispatch guard，避免已接纳输入在零模型轮次的 native 恢复中再次使用原 continuation guard。未接纳项仍执行完整 guard/cancel/commit 校验。
Rust 两条 Sidecar 启动路径经原 builder 注入桌面 PID；Unix Node 对实际 OS 父子关系作只读观察，父进程消失时向 Rust 原精确进程组发 SIGTERM，所有该桌面 Unix shutdown 经既有有界排空后均同组 SIGKILL 升级，清理忽略 TERM 的工具。Windows 保留原 kill-on-close Job；Host/CLI/dev 无桌面标记或启动 identity 时不启用。没有扫描/杀死现有用户进程或新建进程/状态 owner。

## Verification

复现先红后绿；新增恢复成功/Stop 两项及真实父进程死亡一项通过。43 项定向 unit 通过；完整相关集成143项、builtin/turn queue unit199项、Rust4项、类型/lint/server bundle均通过；结果见 dev-docs/no-response/acceptance.md。主 Agent 实施/验收；增加一个只读 reviewer（请求 gpt-6.1-sol/medium）复核跨进程边界，发现 TERM 升级、已有drain和轮询间隙的父进程失效缺口后均已修复、真实进程复验并通过最终复审。无外部模型，精确成本未暴露。真实用户薪资任务未重发、未停止、未代为发布。

## Blockers and unknowns

旧实例可能仍有构建/业务动作，不能用新代码自动清理已存在的旧版进程。必须先核对原任务结果并保持一个执行 owner，再由唯一 publisher 在安全空闲窗口安装。隔离夹具通过不代表原会话或生产业务完成。

## Deployment request

Required: desktop client. Canonical branch: main, task branches/worktrees retained under existing policy. Sole shared CI and deployment owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4. Version is assigned solely by that owner; preserve existing version/tag/artifact identities. No migrations, dependency changes or permission expansion. Candidate branch/SHA is selected under existing branch policy by that owner; CI results must match that exact SHA and acceptance/promotion must use the same digest-verified artifact. Developer does not manually dispatch shared CI.

## Next step

向既有 CI/部署会话提交 PR168、精确任务分支 SHA、389项本地验证（242 unit +143 integration +4 Rust）和独立复审证据，统一协调已有排队自动检查；按其协调结果完成正常主干合入和远端包含核验，不独立触发 CI/部署。
