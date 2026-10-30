# MB-REPLAY-RECOVERY-20261030 验收与交付

源码基线 `f072eff9a94724fc8802e939e51255dbf625ea3d`；分支 `codex/replay-recovery-20261030`。

## 已确认

- 原两条Bash在执行前被意图hook拒绝，因拒绝先于recovery准入而漏记可信收据；不是已经执行后结果丢失。精确证据与边界见[诊断](diagnosis.md)。
- 拒绝收据走原controller/SessionStore；历史核对只接受SDK选定链与结构化拒绝的精确配对。保留原uncertain与审计，仅结清已证明的旧尝试。
- 原会话产品入口自动只读核对并提供一次“恢复此会话”；未知副作用仍阻断，不自动重发旧命令。
- typed错误贯通原生结果、持久化与界面；历史4条错误通过原writer补回元字段。

## 主Agent独立验证

- 组合unit/DOM：9文件193项通过，日志私有 `/tmp/mb-replay-20261030-combined.log`；各工作包额外定向与集成见[backend](backend.md)、[UI](ui.md)，计数重叠不相加。
- 原会话SDK只读内存验收：selected90/raw154，两个旧unknown均为native_hook_denied；串行核对后remaining0，重建controller unknown0，原checkpoint恢复成功且retryAllowed=true，旧product元字段修复4。原ledger与product哈希/mtime不变，执行工具0次。
- 内置浏览器实际生产组件：1280宽完整恢复2项；390×844无水平溢出，4项含真实未确认的场景仅结清2项、保留另2项。
- 实际BlockGroup→ProcessRow→ProcessStatus：失败行红叉/执行失败、无成功勾选；成功行正常勾选；展开失败详情仍失败。
- UI接口为合成数据；浏览器交互与真实原会话只读验证分别成立，不宣称签名客户端或业务生产通过。
- 测试分类检查通过；源码diff whitespace检查通过。

## 审阅与修复

primary负责整合、原会话只读probe和实际UI；recovery负责server/shared；ui负责renderer；diagnosis负责原证据与非实现者源审。recovery/diagnosis请求模型gpt-6.1-sol/high，ui请求gpt-6-luna/medium；调用实际token/费用未知。未用外部模型。

审阅修正了旧inputJson输入匹配、关闭核对面板后继续提交、auto inspect丢刷新、缺翻译、fixture路径/主题/场景状态及同hash新尝试保护。稳定fixture后验收通过；后续同类任务先冻结验收版本，避免HMR影响结果。

## 待统一交付

- [ ] existing owner共享CI及main合入、远端main验证。
- [ ] 唯一desktop/macOS/updater owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 分配下一未冻结版本、签名制品、安装与发布。
- [ ] 发布后通过原会话产品恢复入口结清两条有证据的旧记录，并复验4条错误显示与同会话新输入；不盲目重放原命令。

恢复前私有快照位于原工作区 `work/MB-REPLAY-RECOVERY-20261030/pre-recovery-snapshots/manifest.json`，不随Git提交。开发未修改live账本、原native/product历史或日常客户端；生产版本与制品摘要由原owner最终发布记录提供。
