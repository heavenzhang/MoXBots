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
- [x] Unix 真实子进程夹具验证桌面父进程被 SIGKILL 后子进程通过正常回调退出。
- [x] 相关完整回归、Rust 生产启动参数验证及类型/lint/build。
- [ ] 提交、PR 预检查、合入 main、远端主干包含核验与精确 main 集成 CI。
- [ ] 唯一发布会话接收、主干精确 SHA 候选、正式客户端安装及原会话真实路径验收。

## Completed

准入提交时释放已消费的 beforeDispatch guard，避免已接纳输入在零模型轮次的 native 恢复中再次使用原 continuation guard。未接纳项仍执行完整 guard/cancel/commit 校验。
Rust 两条 Sidecar 启动路径经原 builder 注入桌面 PID；Unix Node 对实际 OS 父子关系作只读观察，父进程消失时走既有 shutdown/SDK exit 清理。Windows 保留原 kill-on-close Job；Host/CLI/dev 无桌面标记或启动 identity 时不启用。没有扫描/杀死现有用户进程或新建进程/状态 owner。

## Verification

复现先红后绿；新增恢复成功/Stop 两项及真实父进程死亡一项通过。43 项定向 unit 通过；完整相关集成140项、builtin/turn queue unit199项、Rust4项、类型/lint/server bundle均通过；结果见 dev-docs/no-response/acceptance.md。仅当前主 Agent 实施/自验，未使用子 Agent 或外部模型，精确成本未暴露。真实用户薪资任务未重发、未停止、未代为发布。

## Blockers and unknowns

旧实例可能仍有构建/业务动作，不能用新代码自动清理已存在的旧版进程。必须先核对原任务结果并保持一个执行 owner，再由唯一 publisher 在安全空闲窗口安装。隔离夹具通过不代表原会话或生产业务完成。

## Deployment request

Required: desktop client. Integration/release branch: main, exact verified SHA only. Deployment owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4. Version is assigned solely by that owner; preserve existing version/tag/artifact identities. No migrations, dependency changes or permission expansion. Candidate uses exact main CI and the same digest-verified artifact through acceptance/promotion; no feature-branch deployment.

## Next step

完成完整相关回归和 Rust 检查，审阅提交，推送任务分支做预检查，再正常合入 main 并交唯一 publisher。
