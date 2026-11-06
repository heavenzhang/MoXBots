# G03 源码阶段验收

## 已核验

- `vitest run --project unit src/shared/botGroup.test.ts src/shared/botGroupDelivery.unit.test.ts src/server/inbox/start-handler.unit.test.ts src/server/inbox/drain-handler.unit.test.ts src/server/inbox/session-event.unit.test.ts src/server/inbox/start-admin-handler.unit.test.ts --silent`：6文件61项通过。
- `vitest run --project integration src/server/session-engine/bot-group-delivery.integration.test.ts src/server/session-engine/bot-group.integration.test.ts --silent`：2文件24项通过。使用隔离临时 HOME/真实 SessionStore、真实 CAS/原 prepared birth/admission 与原 Inbox drain；传输和 Runtime injector 使用合成回执，不连接用户模型或业务数据。
- `node --import tsx scripts/verify-bot-group-native.mjs`：仓库固定 Rust1.92、Cargo.lock精确依赖、离线临时crate，实际签名模块与新 claim 模块11项通过；同一份 Rust/TS 拒绝矩阵、实际 Rust 签名→Node验签通过，包含新 send 路径。
- `npx tsc --noEmit`、涉及15个TS/脚本文件 scoped ESLint、`git diff --check` 通过；测试分类488个server tests；dependency-cruiser 0errors/20既有warnings。
- `npm run build:server` 通过；仅本隔离源码树 server bundle，不是正式制品。

覆盖：先记账后一次 I/O、并发相同请求、重启读回、不同正文request冲突、未知不重放/阻断新请求、过期接收者/停用Bot/工作区及项目变化、原CAS前重验、后到ACK不覆盖快终态、错原请求/原目标/回报来源/项目、缺少真实turn证据保持unknown、32KiB UTF8摘录和全文摘要冲突、预留转义字节额度、目标自身权限/固定项目、派发前停用撤回prepared、旧Inbox和未绑定lazy出生继续正常。

## 证据边界与剩余验收

Rust临时crate只编译实际签名与claim模块，不编译整个Tauri deliver/SidecarManager集成；完整原生编译由原owner统一协调，未通过前不能据此发布群功能。原生管理端到实际目标Sidecar、真实provider消费/终态/回报、本机UI、安装和公开下载均未验收。没有触发真实Bot执行。

G02组件尚未挂进原Chat。原目标会话只读查证入口、未知终态的有证据收敛仍待G03-D；未知不会自动重启或改投。G04任务/预算/负责人复验与最终主干统一发行未完成。

本机外部证据目录：WPS MoxBot/work/MB-BOT-NAV-20261102/group-delivery-20261107/。日志与签名夹具均为合成数据；无真实凭据、客户数据、用户私聊或正式包。
