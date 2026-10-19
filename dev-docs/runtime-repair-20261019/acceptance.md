# MOXBOTS-RUNTIME-REPAIR-20261019 验收记录

## 结论

两项已确认的客户端缺陷已在隔离 worktree 中修复，本地定向验证通过，并以 fast-forward 方式直接合入实际 `main`：

- 分支：`codex/runtime-repair-20261019`
- 基线与当前远端主线先前进点：`556b1633d15a01894a0deb5d6a07bb6cd2649654`
- 提交：`32f6fd5e4`（Goal busy deferral）、`eb75e1430`（bridge headers timeout）
- 远端 `main`：`eb75e143045...`（`git ls-remote` 已核实包含上述两个提交）
- 本任务**只交付源码与本地验证**。未安装、未重启、未替换日常客户端，未做原生/真实 Provider 验收；运行中的客户端仍是旧代码。

## 问题 1：MOXBOTS-GOAL-BUSY-20261019

### 证据

观察记录显示，薪资会话 `40ef1dde-...` 的 Goal `goal_8712ffe2...` 以约 5.008s 的间隔连续被探测 319 次，每次都返回 `409 goal_work_pending`，最后一次在 10:26:07.800。同一时期 Rust 日志把每次探测记录为 INFO response/parsed 对，并输出 `status=error` 的 perf 事件；Sidecar ensure 路径还在每次探测时输出 healthy-reuse 事件。

Node 侧 busy guard 位于模型启动之前，没有证据表明这些 409 触发了重复模型调用或计费。因此这是**正常背压被三层日志当成执行错误呈现**的可观测性/日志量缺陷，不是调度语义缺陷。

### 实现

- `src-tauri/src/sidecar/cron_execute.rs`
  - 新增 `is_goal_work_pending_response`：仅当 `!success && !turn_dispatched && !termination_unconfirmed && code == "goal_work_pending"` 时判定为 deferred。
  - 调整为先解析响应再记日志；deferred 响应跳过 raw/parsed 两条 INFO，perf 状态记为 `deferred` 并附 `deferred=true`。
- `src-tauri/src/session_goal/execution.rs`
  - 在获取 wake lock 和 ensure Sidecar 之前，先用 2s 超时 GET 已运行 Sidecar 的 `/api/session-state`；`isBusy` 或 `hasBackgroundWork` 为 true 时直接合成与 Node 相同的 deferred 响应返回，不再支付 ensure/reuse 日志。
  - 预检失败、超时或字段异常一律落回原有 ensure-and-dispatch 路径；Node 仍是准入权威。
  - 分派后竞态出现的 `goal_work_pending` 响应同样按 deferred 处理。
- `src-tauri/src/session_goal/busy_log.rs`（新增）
  - 每段 busy 周期只记录首条 deferral、每 60s 一条汇总、恢复时一条 resumed；按 goal 隔离，恢复后重置。
- `src-tauri/src/session_goal/scheduler.rs`
  - 私有的 `continuation_work_pending` 改为复用 `is_goal_work_pending_response`，避免分类漂移。
- `src/server/routes/session-read.ts`
  - `/api/session-state` 增加 additive 字段 `hasBackgroundWork`，与 orchestrator 的 `workPending` 谓词一致。

### 验收对应

- **busy 不调用模型**：预检在 wake lock/ensure 之前返回；Node orchestrator 的既有 busy guard 未修改。
- **不增加失败计数**：`goal_work_pending` 仍走 `continuation_work_pending` 分支，绕过 `record_dispatch_failure`；真实失败路径未改。
- **后续执行不丢失**：调度器仍返回 5s 后重试，Goal 唤醒/状态语义未改。
- **真实 4xx/5xx 不被吞**：分类要求精确 code、未分派、终止已确认三者同时成立；其他响应保留原日志与失败记账。
- **日志量下降（按代码路径推算，未在安装客户端实测）**：319 次探测约 27 分钟，由约 4 行/次降为 1 条首行 + 约 27 条分钟汇总 + 1 条恢复行。

## 问题 2：MOXBOTS-UPSTREAM-408-20261019

### 证据

薪资会话在 10:26:11.721 与 10:47:09.671 两次明确出现 `Upstream headers timeout after 30000ms`，最终 `api_error` 408。另一个诊断会话在 10:41:38 也返回 408，但没有捕获到同一 bridge 原因，不能与薪资会话等同。薪资会话的继续依赖排队消息，不是自主恢复。

### 根因

`agent-session.ts` 只要存在 ModelFailover 控制器就固定注入 30s headers timeout。但当 `ContextRecovery` 存在不确定的工具结果时，`canRetryInference()` 为 false，`ModelFailoverController` 正确地拒绝重试/切换；短超时却仍然生效，于是一个“慢但健康”的主路由在 30s 后变成了**不可能恢复的终态 408**，且无法与真实上游超时区分。长时间工具执行属于响应体/流阶段，不是 header 等待，本修复不触碰该边界。

### 实现

- `src/server/openai-bridge/types/bridge.ts`、`bridge-registry.ts`
  - `headersTimeoutMs` 支持 `number | (() => number | undefined)`，按请求求值。
- `src/server/openai-bridge/handler.ts`
  - 在转发层解析超时；getter 返回 `undefined` 或非法值时回退服务器默认 300s，并记录 fast recovery off。
  - 新增错误 code `upstream_headers_timeout`；超时日志包含 provider/model/实际边界/是否 armed。
  - 仅在短超时真实 armed 时限制错误体读取。
- `src/server/openai-bridge/model-failover.ts`
  - 新增 `fastRecoveryAuthorized()`：scope 存在且未 retired、`isActive !== false`、`canRetry !== false`。
- `src/server/agent-session.ts`
  - `headersTimeoutMs: () => fastRecoveryAuthorized() ? 30_000 : undefined`；恢复被 fence 时使用通用 300s 边界。

### 验收对应

- 慢 header + 恢复可用：主路由超时后由既有备份接管，重试/切换边界不变。
- 恢复被 fence：不重放已交付请求、不切换备份，主路由在通用边界内正常完成。
- 主备都超时：返回有界、可分类的 408（`code=upstream_headers_timeout`），不会无限重试。
- 30s 仍是“恢复可用时”的显式产品快速失败策略；上游不可用/极慢超过 300s 时仍按 408 失败，没有改成无限等待。
- 未修改本地 Provider、模型、账号、权限或持久配置。

## 测试

Node（Node 24，定向）：

- `src/server/routes/session-read.unit.test.ts`：12 passed
- `src/server/openai-bridge/model-failover.unit.test.ts`：25 passed
- `src/server/openai-bridge/model-failover.integration.test.ts`：25 passed（含慢 header→备份接管、fence 下保持通用边界、主备均超时的分类 408）
- `src/server/openai-bridge/handler-timeouts.integration.test.ts`：4 passed（含 getter 回退、长流式响应体不误杀）
- `src/server/openai-bridge/background-lifecycle.integration.test.ts`：27 passed
- 合计 93 passed；`tsc --noEmit` 退出 0；改动文件 ESLint `--max-warnings=0` 退出 0。

Rust：

- `cargo test --lib session_goal`：32 passed
- `cargo test --lib sidecar::cron_execute`：7 passed

环境说明：

- 本机缺少 CLIProxy 签名清单，编译前临时注释 `src-tauri/build.rs` 的 `verify_bundle`，测试后已恢复（无差异）。因此本次编译**跳过了 CLIProxy bundle 校验**，不等于完整打包验证。
- Rust 测试运行需要 `DYLD_LIBRARY_PATH=/Library/Developer/CommandLineTools/usr/lib/swift-5.5/macosx`。
- Prettier 全仓存在改动前就有的格式告警（未改动文件同样告警），未做全仓重排。

## 合入与远端

- 代码已直接 fast-forward 推送到 `origin/main`：`556b1633d..eb75e1430`。
- `git ls-remote origin refs/heads/main` = `eb75e143045...`，包含两个修复提交。
- 本任务**未创建 PR，未运行远端 CI**；合入依据是本地定向测试，不是 CI 结果。

## 未完成 / 未验证

- **未安装、未重启、未替换日常客户端**：本机运行中的客户端仍加载旧代码；源码合入不等于缺陷已在运行实例消失。安装/重启须等待原薪资任务安全结束并在安全空闲窗口执行。
- **未做真实 Provider 复现**：408 路径用 loopback 模拟验证；无法确认 10:26/10:47 上游当时的具体状态。
- **日志量下降未在安装客户端实测**：仅按代码路径推算。
- **未产出候选安装包**：未做 Tauri app bundle、签名、公证或原生验收。
- 未操作账号、权限、Provider、模型、持久状态；未向其他会话发送消息；未使用真实薪资/证件内容。

## 回滚

- 回退 `eb75e1430` 与 `32f6fd5e4` 两个提交即可；无数据迁移、无配置变更、无持久状态变更。
