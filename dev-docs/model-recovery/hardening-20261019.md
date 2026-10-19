# MOXBOTS-MODEL-RECOVERY-001：日志驱动稳定性增强

本轮开发基于远端 main `90e1d4327fd341e096a6380bad64eb36230739f2`。源码、模拟/SDK验证、主干交付、签名候选、真实 Provider 和生产验收分别记录，不能相互替代。当前唯一桌面发布 owner 仍为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。

## 日志与根因边界

只读检查本机 2026-10-19 统一日志，09:00–13:10 范围内定位到多次 408 及其后的后台 499。日志来自旧日常客户端，不证明当前 main 仍存在相同缺陷。main 已有 `32f6fd5e4` / `eb75e1430` 的 Goal busy/header timeout 修复，以及 `556b1633d` / `b727e12c2` / `90e1d4327` 的 repeated-read 修复，本轮不重复实现这些成果。

独立源码审计发现，Chat SSE 在没有 finish_reason 时会由 EOF 合成 end_turn/message_stop；错误帧和损坏 JSON 也可能被跳过，误清理恢复 checkpoint。Responses 同样可能丢弃损坏帧后接受 completed。非流式成功响应还会在读 body 之前移除取消监听，导致上游 headers 后悬挂时 Stop 无法释放连接。

## 最终行为

- Chat 必须有已识别的 finish_reason 才输出成功 terminal；空/截断/错误流不会误完成。正常 trailing usage、工具终态、无 DONE 的有效终态、注释/ping 均保留。
- Chat 与 Responses 解析遇到损坏数据即失败，不把缺失内容或工具参数静默拼成成功。
- 原恢复 owner 只转发完整 SSE frame；半帧断流也能传递安全错误，而不会先让 SDK 解析半个 JSON 失败。
- partial EOF/transport/error 通过 HTTP SSE 传达 automatic_replay_blocked，实际 SDK parser 和现有 terminal classifier 可直接识别 Goal 的安全暂停原因。原 history、checkpoint 和已完成工具证据保留；不自动重放部分执行。
- Stop/consumer cancel 在持久暂停的 await 期间仍优先；非流式 Chat/Responses body 读取保留取消链路。没有新增任务调度器、推理 owner、权限、配置或无限重试。
- 非流式错误/未完成的 Chat HTTP 200 及无 body 的流式响应在交付前返回 502，交由原有有限重试/持久恢复裁决。

完成证据遵循 [OpenAI Chat streaming contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)；实现与边界详见 [model_recovery](../../specs/tech_docs/model_recovery.md)。

## 验证

- 修复前新增 15 个 Chat 回归中 11 个失败，确认缺陷；最终新增集扩展至 17 个场景。
- 最终全 bridge unit/integration，加 SessionModelRecovery、真实 SessionStore 持久恢复和 terminal classifier：21 个文件、378 项全部通过，0 skip。包括三协议及原生半帧断流、实际恢复 waiting→paused、实际 SDK SSE 消费→安全分类、两协议 held-body Stop、取消时序、账本与停止 fence 回归。
- TypeScript `tsc --noEmit` 与改动源/测试 ESLint 通过；全仓 CI 随精确 PR head 单独记录。
- SDK 0.3.296 / native child / 实际 MCP counter 的隔离 loopback：counter=1、两次重复工具被拒绝、同 native Session 重建、restoredAdmits=1。原生请求真实运行，供应商为合成 loopback，时钟压缩已记录的 15s 等待；paidCalls=0。不是签名原生 UI、真实 Provider 或长时间运行验收。
- 复用原 `bridge_recovery` 协作者只读审计两轮。第一轮发现取消 await 与半帧边界，修复及回归后独立复核无本范围 P1/P2 阻断；最终测试由主 Agent 执行。

私有原始测试和 SDK 回执在项目指针 `work/model-recovery-001-20261019/hardening/`；仓库不收录用户业务内容、密钥或完整日志。

## 发布与持续诊断

冻结 0.5.13 候选 source `2ff314ed05fb21df446215829efbe5647c7eb21b` 不包含本轮及之后修复。其签名字节和 Apple 原 job 保持不可变；本轮交付正常 PR/CI/main 后提交唯一 publisher 选取新 pin，重新进行签名、原生/真实模型及发布门禁。运行中的旧客户端不因代码已合并而自动更新。

当前聊天按用户新增授权持续检查本机统一/crash 日志；私有 `watch-stability.py` 仅增量、有界、只读，输出诊断 code/时间/文件 offset，不输出消息体或凭据。已在新源码修复的旧客户端日志不触发重复修复。新异常须先在最新源码复现，再经回归、正常 main 和唯一 publisher 交付；无变化保持安静，不中断活动业务。

执行记录：主 Agent 负责日志/实现/测试/集成，复用 1 位既有只读协作者，无新 worker、无外部模型调用。精确模型变体、token 与费用未暴露，不声称节省百分比。实际收益是独立审阅补获两个跨层时序缺口；后续保留“日志归因→终态证据→跨 HTTP/SDK 分类”的验证顺序。

## 回滚

无数据迁移或配置变更。回退本轮源改动恢复旧协议判断与取消行为，不回滚业务库、native history 或动作账本。候选安装/发布及回退只由唯一 publisher 在活动任务、durable Stop、备份和调度窗口门禁满足后执行。
