# MB-CONTINUE-RECOVERY-20261106

原会话已收到 Bash `Exit code 128`，旧代码仅承认 `<128` 的非中断失败，导致 pending mutation 残留。继续消息在调用模型前被拒绝；界面优先显示旧评审摘要，只表现为暂停。

## Changes

- 把明确原生非中断 exit 128 作为已结束的失败；124、129+、缺失终态或 MCP 模糊错误仍保持未知。
- 旧记录必须有原 journal attempt，原命令/action hash、原输出 digest、原 SDK tool result、source assistant/parent、当前 SDK 选择链或原生压缩祖先全部吻合。无命令执行、无新恢复 API、无成功冒认。
- 保留匿名 legacy uncertainty，不以某个已知失败证明另一历史操作。修复只改变精确 attempt 和相应 execution pending fact，让用户明确发出的继续请求可继续纠正失败。
- 所有已知暂停原因在折叠任务条下可见；每次可见输入被 dispatch guard 拦截都会显示原因；用户主动取消沿用原取消回执，不误报系统故障，不再静默丢弃。

## Verification

7 个目标测试文件 224 项通过，包括真实生产 admission / queue generator 的合成 SDK 联调、DOM 折叠显示、压缩祖先与 off-chain/foreign/duplicate/超时反例。补充 legacy 保留、容量检查及真实 Store 冷重载回归 3 文件 66 项通过（部分重叠）；合计 8 个不同文件 241 项通过。类型、改动 lint、测试分类通过；依赖检查 0 error、20 项基线 orphan warning。

真实会话历史仅在内存中复核：选定历史已压缩，沿原生 logical parent 找到原错误回执，精确匹配 exit 128；不写生产文件、不产生工具调用。原会话名称、路径、工具参数、原始日志和回执留在本机私有证据，不上传 Git。

## Delivery and real acceptance

- [ ] 远端 main 集成与唯一桌面负责人的精确候选 CI。
- [x] 核心修复已在 0.5.43 / 543.1 构建、签名、公证并安全安装，旧应用和退出后一致数据备份保留。描述型原因补充修正待 543.2。
- [x] 原会话保留身份与任务进度，唯一继续消息进入原 execution；生产逻辑自动核对原 exit 128，未手改账本，7 个其他 legacy uncertainty 保留。
- [x] 原业务修复已在实际默认工具生效，有真实结果回读及持久验收记录；原任务 completed，6/6 正式评审 accept，6 项 plan completed。
- [ ] 原生界面暂停原因和新拒绝提示可见，重开后状态一致。

## Follow-up direction

把运行状态固定区分为执行中、明确失败可修正、结果未知待核对、需要用户决定、已完成。由实际执行 owner 产生唯一原因/时间/受影响操作与下一步，前端与日志展示同一事实。优先自动核对已有终态；未知状态只阻止可能重复的操作及其依赖。后续分别补齐超时、后台任务、评审循环及重启恢复的真实回归，避免以统一“暂停”掩盖不同原因。不能通过移除结果未知保护来解决误拦截。

## Installed real-path acceptance (2026-11-06)

唯一桌面负责人交付 543.1，源码 `35c1dc5f0d53abd481ba1262acf776689bb9b0a3`，包含核心修复 `c4f169c493db111e73624d6954794abb51a091b5`。签名归档 SHA-256 `883b6bb7e0a9e7eb7910935924e24ad9d22fa761d66cb496e9d8bcd9dfe7ae8a`；旧应用和退出后一致备份由同一负责人保管。公共更新通道没有因本地安装而变更。

安装后原生折叠任务条显示具体暂停原因；原会话的一次普通发送自动核对历史失败，原 execution 从 paused 转为 running，沿用已完成项和身份，没有重放旧命令或清空未知操作。原任务结束后原生界面显示已完成、已验收 6 项，持久 execution、6 条正式评审及 plan 均一致。

业务工具默认入口已实际使用修复二进制；独立复核同一有界 116 条样本：85 条转发和 4 条引用恢复，27 条普通文本及所有元数据不变，116 条解码完整，无 warning。原版完整备份保留；后续包管理器升级可能覆盖本地补丁，此边界已记录在原交付。原生回执、私有样本和安装证据仅保存在本机，不上传 Git。

剩余交付：PR #257 主干集成、包含 `93b5523bb0a9d6dd4c33c1ac8a8e6d2085823618` 描述型原因修正的 543.2，以及再次启动后的持久状态检查。543.1 不能代表该补充修正已经安装。

- 补充通过真实 production recovery owner + SessionStore 隔离联调：冷启动同一 provider、压缩历史失败128核对、持久执行事实修复；保留 legacy unknown，无模型输入或上游请求。完整 stream-continuation 文件17项通过，类型与lint通过。

- 最终审查保留主动取消语义：dispatch_canceled 仍发送 queue:cancelled，不新增 chat:agent-error；真实系统拦截继续显示原因。17项生产队列联调与类型/lint复核通过。

- 安装前补审发现并修复描述型暂停原因回归：blocked/needs_user 把自然语言 summary 直接存作 reason，不能用未知枚举兜底遮盖。2个反例先在旧显示代码失败；修正后两文件DOM通过，并新增不使用旧accept摘要的反例。已知reason code保持最高优先级；仅reason与当前summary完全一致时展示该说明。后端与原生恢复逻辑没有变化。
