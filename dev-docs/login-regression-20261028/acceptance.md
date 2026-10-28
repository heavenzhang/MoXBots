# MOXBOTS-LOGIN-REGRESSION-20261028

本轮修复三个已复现的登录展示/恢复问题；真实设备登录及退出重开尚未验收。开发基线为 main `caab6ab648b434bee17930f90c4df4de87564bba`，分支 `codex/login-regression-20261028`。本机安装包为 0.5.24 / 524.1，不能由当前源码验证推定已安装修复。

## 问题与改动

1. 登录初始化的实例发现请求失败，`useOwnedLoginFlow` 误用网络目录的 `connectionTimeout` 提示，声称自动重试并谈及设备状态。此时没有 attempt，不会启动轮询。改为登录服务专属超时/不可达提示，保留原重试入口；已有 attempt 的结果观察仍由原生命周期控制。
2. native poll 已返回提交成功的 registry，账号入口却再调用 `selectNetworkConnection` 写配置。第二次写失败会被当成登录失败，还可能覆盖登录期间用户的新选择。直接接纳 native 的提交回执；选择权继续由 Rust `owned_login_selection` 与原原子提交拥有。
3. App store 第一次读取 registry 失败后没有后续读取，导致账号状态不能自行恢复。现在仅对本机只读查询以 1/2/4/8/15 秒上限退避恢复，窗口 focus 使用同一串行读取入口；停止后移除监听、清理 timer、拒绝迟到结果。不会重新授权、重放登录或修改凭据。

登录说明改为“会话有效期内重开应用无需再次登录”。原生记录会拒绝过期会话，服务器 TTL 可配置，不能把凭据保存等同于无限期会话。

## 可核实的现场与限制

2026-10-28 23:25 本机原生日志对公开实例发现 GET 记录 connection/timeout、耗时约 5002 ms。随后默认配置与禁用代理的只读 HTTPS 探测均在 TLS 建立前超时。这是本机连通性证据，不能证明云端宕机，也不能自动归因到尚未确认的截图设备。未读取原始 token、修改账号或清理任何保存槽。

历史 Air 的网页登录返回及 Cmd-Q 重开验收未闭合；本次仍需受影响设备、实际版本、登录返回和退出重开证据。截图不能证明凭据未保存，本轮没有通过扩大 TTL、禁用校验或清空旧身份来掩盖问题。

## 验证

- RED：新增三条关键回归在修改前均失败，55 条既有相关测试通过。
- 修复后：7 文件、148 项通过，包括 API/账号选择/store、登录 hook/dialog/账号入口与网络页面。
- 全量 `tsc --noEmit`、修改 TS/TSX 的 ESLint、测试分类及 `git diff --check` 通过。
- Codex IAB 中运行实际 `JoinNetworkDialog`：1280×720 与 390×700，超时提示/重试入口、重试后自动关闭、取消均通过；390 宽度 dialog 位于 x=16..374，未横向溢出，浏览器无 error。
- 源码/截图独立复核 `/root/login_review` 无阻断，检查读取串行化、迟到响应、native commit 选择权及窄屏。请求模型 gpt-6-luna / medium；实际计费与 token 用量未提供。不调用外部原因：本轮采用 ai-yaoren-local 纯内置模式，仅一次有限复核。

上述 mock native、假 timer 和合成回调不证明真实 OAuth、Keychain、原生窗口 focus 或退出重开。未启动真实授权 URL，没有重启、替换或退出日常 App，没有操作运行任务。

## 复现与证据

Node 24 下运行：

```sh
./node_modules/.bin/vitest run --project unit src/renderer/api/agentNetwork.test.ts src/renderer/features/agent-network/store.test.ts src/renderer/features/account/ownedAccountSelection.test.ts --project dom src/renderer/features/agent-network/useOwnedLoginFlow.test.tsx src/renderer/features/agent-network/JoinNetworkDialog.test.tsx src/renderer/features/account/OwnedAccountEntry.test.tsx src/renderer/pages/AgentNetwork.test.tsx
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vite --config dev-docs/login-regression-20261028/qa/vite.config.ts
```

UI 本地入口 `http://127.0.0.1:5398/?scenario=timeout`，第一次开始模拟超时，第二次开始模拟成功。QA server 仅监听 loopback。日志、截图、独立复核原文保留在交付工作区 `work/MOXBOTS-LOGIN-REGRESSION-20261028/`，未随 Git 保存原始用户日志或账号信息。

## 主干与发布

- [x] 源码修复及本地回归、有限实际组件交互、源码/截图独立复核。
- [ ] 统一 owner 协调共享 CI/main，核验远端 main 实际包含成果。
- [ ] 签名包、正式通道、受影响设备安装和登录/退出重开验收。

desktop/macOS/updater 与 combined CI/main 的唯一负责人继续为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。进入下一未冻结批次；不改变已冻结 0.5.25 / 525.1，不自行运行共享 CI、创建触发 CI 的 PR、分配版本或安装。无云端/Host/mobile 部署依赖，无数据库或凭据迁移，原发布回滚纪律继续适用。
