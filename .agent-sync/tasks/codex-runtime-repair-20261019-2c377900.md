<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/runtime-repair-20261019 -->
<!-- git-project-sync-task:base=556b1633d15a01894a0deb5d6a07bb6cd2649654 -->
<!-- git-project-sync-task:status=complete -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-RUNTIME-REPAIR-20261019 Goal busy 日志与上游 408 恢复

## Objective

修复两个已确认的客户端运行期缺陷，只改 MoXBots 客户端代码，不接管薪资业务逻辑、不操作运行中的会话：

1. Goal 在会话 busy 时每 5s 探测一次 `409 goal_work_pending`，正常背压被 raw/parsed INFO、perf error 和 Sidecar ensure 事件持续记为执行错误。
2. 会话 bridge 在自动恢复被 fence 时仍固定武装 30s headers timeout，把慢但健康的上游变成不可恢复的终态 408。

## Acceptance criteria

- [x] 先读观察证据，未复现的假设（全局 dispatch-lock HOL、waitingForUser 对称性）不进入实现。
- [x] busy 探测不触发模型调用；不增加失败计数；不丢失后续执行；5s 唤醒语义不变。
- [x] busy 日志降为状态变化：首条 deferral、60s 汇总、恢复行；perf 状态为 `deferred`。
- [x] 真实 4xx/5xx 与已分派失败不被吞：分类要求精确 code + 未分派 + 终止已确认。
- [x] 408 路径用本地 loopback 复现慢 header、恢复可用时的备份接管、恢复被 fence 时的通用边界、主备均超时的有界 408。
- [x] 短超时只在 `fastRecoveryAuthorized()` 时武装；未改重试/重放安全边界，未无限重试。
- [x] 超时带 `upstream_headers_timeout` code，日志含 provider/model/边界/armed 状态。
- [x] Node 定向 93 项、`tsc --noEmit`、改动文件 ESLint 通过；Rust `session_goal` 32 项、`cron_execute` 7 项通过。
- [x] 合入实际 main、推送、远端包含核验（直接 fast-forward，无 PR/CI）。
- [ ] 真实客户端构建/安装后的运行验证；本任务未安装、未重启（门禁：等待原薪资任务安全结束）。

## Completed

- `src-tauri/src/sidecar/cron_execute.rs`：deferred 分类、跳过 raw/parsed INFO、perf `deferred`。
- `src-tauri/src/session_goal/execution.rs`：dispatch 前 `/api/session-state` 预检，busy 直接返回合成 deferred 响应。
- `src-tauri/src/session_goal/busy_log.rs`：首条 + 60s 汇总 + 恢复的聚合日志。
- `src-tauri/src/session_goal/scheduler.rs`：复用统一分类器。
- `src/server/routes/session-read.ts`：`/api/session-state` 增加 `hasBackgroundWork`。
- `src/server/openai-bridge/{types/bridge,bridge-registry,handler,model-failover}.ts`、`src/server/agent-session.ts`：按请求求值的 headers timeout、`fastRecoveryAuthorized()`、超时错误分类与诊断字段。
- 测试：session-read、model-failover unit/integration、handler-timeouts、background-lifecycle；Rust 两个测试模块。
- 验收记录：`dev-docs/runtime-repair-20261019/acceptance.md`。

## Verification

Node（Node 24）：93 passed（12 + 25 + 25 + 4 + 27）；`tsc --noEmit` 0；ESLint 改动文件 0。Rust：`session_goal` 32 passed，`sidecar::cron_execute` 7 passed。

编译边界：本机缺 CLIProxy 签名清单，测试前临时注释 `src-tauri/build.rs` 的 `verify_bundle`，测试后恢复无差异；Rust 测试需 Swift 5.5 dylib 路径。故本次只验证 lib 编译与单测，不是完整打包。

## Blockers and unknowns

- 运行中客户端仍是旧代码；未安装、未重启、未替换，安装须等待原业务任务安全结束。
- 408 为 loopback 模拟，未确认当时真实上游状态；30s 仍是恢复可用时的既有快速失败策略。
- busy 日志量下降未在安装客户端实测。
- 未创建 PR、未运行远端 CI；main 为直接 fast-forward 推送。
- 未修改账号、权限、Provider、模型或持久配置；未向其他会话发送消息。

## Next step

在下一次未冻结桌面候选构建中打包；在安全空闲窗口安装后，观察 Goal busy 期日志量与真实 408 恢复行为。若需要独立复核或 CI，可对 `eb75e1430` 补跑。

## Deployment request

仅客户端 sidecar/Rust 源码，随下一次未冻结桌面版本生效。本任务不请求安装、重启或发布，不操作日常客户端。
