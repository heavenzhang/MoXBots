# MB-NATIVE-LOGIN-20261105 — 客户端内账号密码登录

基线：`main` / `065f2b6c8fb2aff58e774000909990b531ff8eb8`。任务分支：`codex/native-login-20261105`，权威仓库 https://github.com/heavenzhang/MoXBots.git 。

## 行为与边界

- 个人账号入口默认打开原生 React 表单，账号或邮箱、密码、默认未勾选的基本身份/姓名/邮箱确认；显示固定登录服务。提交立即清空密码和确认，不重复提交。
- 新 Tauri 命令 `cmd_agent_network_owned_start_password` 使用现有 `/auth/login/password`。原 `OwnedClient` 验证 TLS、descriptor、PKCE 与服务响应；原 `OwnedLoginManager`、registry driver、身份 store 和 session commit 仍为唯一 owner。无嵌入网页登录、Cookie 抓取、TLS 关闭或新账号库。
- 已保存账号必须同时携带精确 `connectionId` 与 `expectedRegistryRevision`，复核 trust/device/principal/actor/revision。临时设备 grant 发现旧登记时精确注销临时 grant，终态要求选择原账号再明确输入密码；不自动转浏览器、不把临时 grant 移作旧设备使用。
- 密码只作为当前输入和单次 IPC/HTTPS 请求参数；Rust 命令入口使用 `Zeroizing`，单次 start 结束即释放。不进入 React state、config、Pending credential record、attempt、receipt、日志或重试任务。JS/IPC/HTTP 库内部短期副本不承诺全内存清零。
- 原生 pending PKCE proof 仅进程内保存。成功后沿原会话安全存储和 registry commit；保存失败仅恢复原 attempt，不重发密码。未知的一次性 grant 消费结果要求重新登录，不自动重放。
- 原生模式禁止打开 authorization URL；状态文字不要求用户操作浏览器。原网页登录仅在主动点击“使用浏览器登录（备用）”后使用，保持旧服务和外部身份策略的兼容。
- 服务端错误只映射固定文案，不回显 provider 原文。保留原取消、supersession、lifecycle、账号边界和迟到结果围栏。账号菜单显示服务名与完整已验证 principal ID；未取得经服务验证的姓名/邮箱时不把输入值当成身份资料。
- 原有 session 恢复与退出复用。未登出、重启、替换或读取当前业务客户端的用户凭据；本任务不包含历史恢复故障注入、业务重放或延后的剩余恢复验收。

## 本地验证

| 层次 | 结果 | 范围 |
| --- | --- | --- |
| Rust 完整 crate `cargo check --lib --tests --locked` | PASS | 独立 target；仅将 Tauri bundle resources 设为空以免要求未准备的大型打包资源。原 build.rs CLIProxy 签名/pin/hash 检查保留。不是正式包验证。 |
| Rust `agent_network::owned_` | 63 PASS / 0 FAIL | 含真实 loopback 密码 start、S256、原 poll/session 校验、staged session、精确取消，以及原 OAuth/Owned 回归。全部使用合成身份。 |
| Rust registry 原生门禁专项 | 1 PASS / 0 FAIL | revision/feature/pinned 参数门禁，无用户状态读取。 |
| DOM 四文件 | 62 PASS / 0 FAIL | 原生授权/清空/单次请求/固定错误/取消/保存重试；账号变化 late-start、取消后 late-poll、unmount；原浏览器兼容。 |
| 账号选择/issuer/品牌单元 | 16 PASS / 0 FAIL | 三文件，保护实例隔离和原账号选择。 |
| Rust Clippy all-targets redlines / rustfmt | PASS | 保留普通基线 warnings，不声明零警告。 |
| TypeScript / 定向 ESLint | PASS | 当前前端修改。 |
| 本地 renderer Vite build | PASS | 输出在本任务临时目录；原有大 chunk 和 baseline-browser-mapping 提示保留，不升级无关依赖。 |
| 独立源码审核 | 无确认 P1/P2 | `login_review` 只读审查跨层字段、凭据、原 owner、取消/迟到、手动备用及重试，并独立复跑最终 62 DOM；其建议的三项原生边界用例已补齐并复审。 |
| 真实渲染、键盘、明暗和窄视口 | 待验 | 内置 IAB 不可用；遵守用户 AGENTS，个人 Chrome 未获本任务授权前不操作。 |
| 真实认证、系统安全存储、冷启动恢复、真实退出 | 未验 | 不提取现有密码、不退出日常实例；需用户在原 owner 准备的隔离客户端中输入本任务授权测试账号。 |

主 Agent 已独立执行关键 native loopback 请求/PKCE/poll/staging/cancel 回归并通过，该重复复验不加入142项测试总数。非秘密原始日志与摘要保存在项目资料目录 `work/MB-NATIVE-LOGIN-20261105/evidence/`、`validation-summary.json`。

本地命令：

```sh
node_modules/.bin/vitest run --project dom src/renderer/features/account/OwnedPasswordLoginDialog.test.tsx src/renderer/features/account/OwnedAccountEntry.test.tsx src/renderer/features/agent-network/useOwnedLoginFlow.test.tsx src/renderer/features/agent-network/JoinNetworkDialog.test.tsx
node_modules/.bin/vitest run --project unit src/renderer/features/account/ownedAccountSelection.test.ts src/renderer/utils/ownedCloud.test.ts src/renderer/i18n/applicationBrand.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vite build --outDir /tmp/mb-native-login-renderer --emptyOutDir
TAURI_CONFIG='{"bundle":{"resources":[]}}' CARGO_TARGET_DIR=/tmp/mox-native-login-target CARGO_BUILD_JOBS=2 cargo check --manifest-path src-tauri/Cargo.toml --lib --tests --locked
TAURI_CONFIG='{"bundle":{"resources":[]}}' CARGO_TARGET_DIR=/tmp/mox-native-login-target CARGO_BUILD_JOBS=2 DYLD_FALLBACK_LIBRARY_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx cargo test --manifest-path src-tauri/Cargo.toml --locked --lib agent_network::owned_ -- --test-threads=1
```

Rust 测试启动时有原 Xcode Swift 重复类提示，测试进程正常结束；这不构成安装版验收。首次 check 因缺少 ignored 打包资源失败后使用上述受限 check 配置，未绕过源码类型或 CLIProxy 校验。首轮前端新增错误文案误插入其他 namespace、兼容测试 helper 误选恢复入口两处已修复，最终当前用例通过。

可复现 UI：在仓库运行 `node_modules/.bin/vite . --host 127.0.0.1 --port 5575 --strictPort`，访问 `/dev-docs/native-login-20261105/preview.html`；`case=unavailable|save|pending`、`theme=dark`、`lang=en-US`。夹具导入实际生产表单，账号只接受 `synthetic@example.test` / `synthetic-password`，绝不连接真实服务或 Tauri。夹具成功仅是模拟结果。

## 生产核实与发布交接

正常 TLS 的公开 descriptor 当前指向 `MoXBots Test Cloud101` / `https://101.42.11.29`，无凭据无效密码请求返回 400。该检查不证明真实密码认证或生产登录成功。原 cloud owner 随后于2026-11-05 13:44只读确认：运行服务 `native_password_login=true`，Dex 为 local passwordConnector，单一 static client，`skipApprovalScreen=false`，所查字段未配置MFA；服务与容器运行中。回执位于项目资料 `output/native-login-20261105/cloud-auth-readonly-20261105.json`。这些是配置/运行证据，不能替代具体账号MFA和真实认证验收。

- Desktop/macOS-arm64/updater、共享 CI/main、版本/正式构建/签名/安装/发布/回滚唯一 owner：`01a12bc2-907a-7702-b6dd-788225c5dfe4`。
- 2026-11-05 owner 回执：已将本任务登记下一未冻结批；远端 main 仍为065f2b6c，542.1/PR246 保持冻结，三次 ARM 检查因容量取消，最近八次 CI 均终态。该冻结候选不纳入本改动。后续候选状态以 owner 新回执为准。
- Cloud auth/101 唯一 owner：`01a12b99-7b38-78b1-831f-9c60257d386a`。本任务无服务源码/数据库/配置变更，不需要新 migration；原 owner 已回执当前接口启用且可供桌面复用，无需本次服务部署；真实账号仍待验。
- 开发会话提交并推送精确源，向原 desktop owner 交 PR/CI/main 请求；不独立开 PR 触发共享 CI，不分配正式版本，不正式构建/安装/发布。源码合入、制品、生产与真实用户路径分别记录。
- 发布前由 owner 核对服务支持、相称 UI/真实登录证据、候选精确 SHA、制品摘要、备份/回滚和现有活动任务。不得为验收退出日常业务实例。

## 隔离真实验收步骤

1. 原 owner 在独立数据目录/设备身份及独立安全存储 scope 准备包含本提交的客户端；确认日常实例、会话和凭据 scope 未变。
2. 用户亲自在隔离表单输入获授权账号密码，确认基本身份/邮箱，检查从头到尾无外部网页，错误密码固定提示且密码清空，快速重复操作只产生一笔 start。
3. 正确登录后核对同一服务与预期 principal、真实账号权限和网络/Bots状态；不创建模型或业务任务来代替登录验收。
4. 关闭并重新打开隔离客户端，验证同一登录恢复；仅退出该隔离连接，再确认其已注销而日常实例仍登录。不得通过回滚旧 auth 数据恢复令牌或凭据。
5. 持久化真实结果、版本/完整 SHA/制品摘要与证据；任何未完成项继续标为未验。

## 执行记录

当前会话负责产品表单、整体验收和交付；`native_auth` 独占四个 Rust 文件；`login_review` 只读独立审核，无子 Agent 操作生产。两个子任务请求模型为内置 `gpt-6.1-sol/high`，选择依据为身份/存储/跨层生命周期风险；运行时未提供单项费用/token计数，不报告推测节省。未调用外部模型。
