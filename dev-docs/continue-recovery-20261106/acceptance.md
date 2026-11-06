# MB-CONTINUE-RECOVERY-20261106

原会话已收到 Bash `Exit code 128`，旧代码仅承认 `<128` 的非中断失败，导致 pending mutation 残留。继续消息在调用模型前被拒绝；界面优先显示旧评审摘要，只表现为暂停。

## Changes

- 把明确原生非中断 exit 128 作为已结束的失败；124、129+、缺失终态或 MCP 模糊错误仍保持未知。
- 旧记录必须有原 journal attempt，原命令/action hash、原输出 digest、原 SDK tool result、source assistant/parent、当前 SDK 选择链或原生压缩祖先全部吻合。无命令执行、无新恢复 API、无成功冒认。
- 保留匿名 legacy uncertainty，不以某个已知失败证明另一历史操作。修复只改变精确 attempt 和相应 execution pending fact，让用户明确发出的继续请求可继续纠正失败。
- 所有已知暂停原因在折叠任务条下可见；每次可见输入被 dispatch guard 拒绝都会显示原因，不再静默丢弃。

## Verification

7 个目标测试文件 224 项通过，包括真实生产 admission / queue generator 的合成 SDK 联调、DOM 折叠显示、压缩祖先与 off-chain/foreign/duplicate/超时反例。补充 legacy 保留、容量检查及真实 Store 冷重载回归 3 文件 66 项通过（部分重叠）；合计 8 个不同文件 237 项通过。类型、改动 lint、测试分类通过；依赖检查 0 error、20 项基线 orphan warning。

真实会话历史仅在内存中复核：选定历史已压缩，沿原生 logical parent 找到原错误回执，精确匹配 exit 128；不写生产文件、不产生工具调用。原会话名称、路径、工具参数、原始日志和回执留在本机私有证据，不上传 Git。

## Delivery and real acceptance

- [ ] 远端 main 集成与唯一桌面负责人的精确候选 CI。
- [ ] 新桌面制品构建、签名、安装，记录版本/SHA/制品摘要/回滚。
- [ ] 原会话保留身份与任务进度，继续消息进入原 execution，不能清空账本来解除暂停。
- [ ] 原业务修复已在实际默认工具生效，有真实结果回读及持久验收记录。
- [ ] 原生界面暂停原因和新拒绝提示可见，重开后状态一致。

## Follow-up direction

把运行状态固定区分为执行中、明确失败可修正、结果未知待核对、需要用户决定、已完成。由实际执行 owner 产生唯一原因/时间/受影响操作与下一步，前端与日志展示同一事实。优先自动核对已有终态；未知状态只阻止可能重复的操作及其依赖。后续分别补齐超时、后台任务、评审循环及重启恢复的真实回归，避免以统一“暂停”掩盖不同原因。不能通过移除结果未知保护来解决误拦截。

- 补充通过真实 production recovery owner + SessionStore 隔离联调：冷启动同一 provider、压缩历史失败128核对、持久执行事实修复；保留 legacy unknown，无模型输入或上游请求。完整 stream-continuation 文件16项通过，类型与lint通过。
