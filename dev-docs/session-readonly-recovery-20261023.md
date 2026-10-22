# MB-SESSION-RECOVERY-20261023

源码修复与本地验证已完成；原会话另经用户明确批准的受控上下文重建，已在当前安装 0.5.18/518.2 实际恢复。基线为远端 main `5eb2ebc87489b92e250338026e2b971346ed9e15`，分支 `codex/session-readonly-recovery-20261023`。本源码修复的 CI/main/正式包及安装验收仍待唯一桌面 owner 组织，不能用会话重建成功代替。

## 事实与根因

原截图对应本机保留的 Session。2026-10-23 00:32:33 日志有 `/chat/stop`：native Bash 的 write-ahead reservation 已提交，但没有 post-tool result commit。随后严格账本留下 4 条完成证据和 1 条未知结果；`blocked=false` 不代表没有未知动作。00:32:42、00:33:06、00:33:25 的新输入均在输出前返回 409。诊断读取了原日志、SessionStore 账本、V2 transcript 及只读 `/api/session-state`；未修改这些运行数据。

最新 main 的 Streaming prearm 仅允许 unarmed/ordinary 模式容忍历史未知结果，strict ledger 下的新正常输入直接失败；外层 catch 又把这个本地拒绝写成 model transport failure。不能把 SDK 的工具拒绝文字当作该工具绝未执行的证明；本轮不据此清空未知账本，也不重新运行原命令。

## 最终行为

用户新的 ordinary、未投影输入可以沿原历史进入只读核对。原 ContextRecoveryController 保持所有完成/未知证据，严格模式不降级；只允许原生 Read、Grep、Glob，其余工具、业务写入及重放仍被拦截。对成功/失败模型响应只沿已有 bridge 处理，不获取自动 retry/failover/stream continuation 权限。上下文投影、ledger corruption、取消、scope/background authority 丢失仍拒绝。

固定本地准备错误保留 archive/ledger/owner 原因，不回传任意异常消息、路径或用户内容。没有新增持久化状态、接口、权限或执行 owner；只读限制属于已有 turn state。

## 验证与完成标准

- [x] RED：两种 strict ledger 恢复 + 本地持久化误报共 3 项失败。
- [x] GREEN：原 Query 下一轮、重建 Query、完整 bridge 两轮读取、业务动作拦截、503 无重试、账本完整性。
- [x] Stop/scope/background 在持久化等待时变化不调用上游；已恢复投影不取得新权限。
- [x] 真实 SessionStore 私有隔离目录持久化/重建；测试首次缺少 V2 消息导致 Session 未发布，补齐正常 birth 后通过。这是夹具修正，不是绕过生产保护。
- [x] 最终组合 32 文件 / 559 项全部通过；TypeScript、4 个改动代码/测试文件的 ESLint、测试分类、agent 文档及 diff whitespace 检查通过。
- [ ] 唯一 desktop owner 的 CI/main 集成；分支 push 不等于主干交付。
- [ ] 签名客户端、真实 Provider、原报告 Session 验收与发布。
- [x] 独立运行恢复：用户批准保留 Product Session ID、完整备份旧记录后重建上下文；当前安装包中两次 Read 成功、真实模型回复与 native/V2 持久化一致，本轮 terminal 为 complete。此项不验证未安装的源码修复。

私有测试日志和诊断回执位于交付工作区 `work/MB-SESSION-RECOVERY-20261023/`。仓库只保留合成场景与非秘密摘要，不保存原业务请求、工资附件或原始账本内容。

## 原会话受控重建验收

2026-10-23 01:44 至 01:46（Asia/Shanghai），在原会话 idle 且没有后台任务时，通过既有 `/chat/rewind` 回到首条输入之前。Product Session ID 保持不变，SDK Session identity 由产品正常生成；旧聊天、native transcript、附件和恢复账本先私有备份，14 个文件的 SHA256 全部复核通过，旧 uncertain ledger 原文件 hash 仍与备份一致。没有手工删改账本或伪造未知动作的执行结果。

接口返回 conversation rewind success；可选 SDK file rewind 返回 failed，未宣称文件回滚成功。原 native 的 7 个 file-history snapshot 均无 tracked file backups，原工具记录亦无文件编辑，本次只重建对话上下文。

随后仅发送一次带原目标和已提交进度的恢复输入，实际执行两次 Read 读取业务交付记录，工具结果均成功，并返回完整答复。原 sidecar terminal `complete`，V2 turn/message 均持久化 complete，V2 答复与 native transcript 一致；未执行 Bash、业务写入、导入、构建或发布。原业务修复已交付 sales-performance-worklog/master，生产未发布。私有证据为同目录 `controlled-rebuild-verification.json`、发送回执及重建前后 transcript。未重启 App，也未进行 GUI 目视验收。

## 交接、限制与回滚

部署单元为现有桌面/Sidecar，唯一 CI/部署会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。其 519.1/ef33b512 已冻结，本修改应进入下一未冻结批次。原生验证包括：原 Session/native history 不变，Read 可用、Bash 和业务动作不可用，未知账本保留，Stop 立刻生效且重启后不自动重放。没有绕过现有维护、备份、签名、版本或发布归属。回滚只恢复本次程序变更，不回滚用户数据、账本或原会话。

本任务当前由单 Agent 实施、自审、验证，0 子 Agent、0 外部模型调用。选择依据：修复集中于同一 owner 的顺序状态边界；升级原因：无；回退原因：无；不调用外部原因：明确采用 ai-yaoren-local 纯内置模式，当前上下文足以完成有界修复。主模型为 GPT-6 系列，精确变体/推理档位、token 和费用未知。独立审查未执行；发布 owner 仍须审阅。复盘：先对齐停止请求和账本证据，避免把后续 409 当成供应商故障；以后优先保留本地准备失败的具体原因。
