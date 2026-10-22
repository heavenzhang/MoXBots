<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-readonly-recovery-20261023 -->
<!-- git-project-sync-task:base=5eb2ebc87489b92e250338026e2b971346ed9e15 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-SESSION-RECOVERY-20261023: restore read-only conversation after an uncertain stopped action

## Objective

修复停止工具后原 Session 被未确认账本锁死、且本地拒绝被误报为模型传输失败的问题。保留 Product/native Session、历史、已完成操作和未知结果，只允许用户新的普通对话进入只读核对。任务 ID：MB-SESSION-RECOVERY-20261023。实际诊断为安装 0.5.18/518.2；不将旧客户端日志当作新候选的验收。

## Acceptance criteria

- [x] 在最新远端 main 重现 strict ledger + uncertain action 的 409，以及本地持久化错误被误报 transport failure。
- [x] 原 Query 下一轮及重建 Query 能携原历史到模型；Read/Grep/Glob 可用，Bash/MCP/业务动作、自动恢复及重复 inference 仍被保护。
- [x] 完成/未知账本和原证据保持；真实 SessionStore 重建验证；Stop/owner/background 在持久化 await 期间变化不得 dispatch。
- [ ] 经唯一桌面 owner 组织精确 CI、集成并核验远端 main。
- [ ] 由同一 owner 分配后续候选、签名/原生/真实 Provider 验证，并在安全维护窗口发布。
- [ ] 原报告 Session 恢复对话且不重放原业务动作。当前未执行，不能宣布会话已恢复。

## Completed

- 扩展原 ContextRecoveryController 的 ordinary prearm；只读限制由原 turn state 派生，不新增队列、调度器或持久化 owner。
- 已恢复的 strict protection 不降级为 ordinary repeat；完成证据 merge 时保留原 archive/digest。
- 本地准备错误使用私有类型，仅向 bridge 传递固定原因；取消优先。

## Verification

- 首轮新增 3 项 RED：两种恢复模式返回 409；持久化故障被报为 transport failure。
- unit/bridge integration 初轮 91/91；真实 SessionStore 夹具补齐 V2 首条消息后 3/3。最终组合回归结果见 dev-docs/session-readonly-recovery-20261023.md。
- 本地定向、模拟 HTTP、实际 SessionStore 与真实 Provider/安装验收分别记录；没有向日常 App 发送恢复、重试或业务指令。

## Blockers and unknowns

- 部署单元：macOS 桌面/Sidecar，不涉及云服务、Host、CRM 业务或移动端；唯一 CI/部署 owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。
- 519.1/ef33b512 已冻结；本修改不属于该包。不得覆盖版本/tag 或自行运行共享 CI、安装/重启日常 App。
- 本聊天只推送无自动 CI 的 codex/ 任务分支；建立 PR 会自动启动共享 CI，应由既定 owner 组织。尚未获本次跨聊天消息授权；本地队列登记不代表已通知或接收。
- 此修复恢复只读核对能力，不自动清除未知工具结果或恢复业务写入；未知结果须由原操作 owner 核实。无现成持久化核销入口，本轮不新增此类权限。

## Next step

- 唯一桌面 owner 审阅该远端分支及验收证据，安排下一未冻结候选的正常 CI/main 集成。发布前验证原生停止后保留账本、重新打开原 Session 可 Read、业务工具被拦、Stop 不复活。候选与真实会话验收前保持未完成。
