# LOGIN-CALLBACK-20261017 独立审阅

审阅者：login_review。2026-10-17。基线 `1553ab7cf23f4e1d5c00068592198b758f08f6b3`，分支 `codex/login-callback-20261017` 的进行中 diff。仅只读产品源码，不提交、不访问生产。

## 问题与复审

- [x] **P1 已修复：旧服务 400/422 回退原先不可达。** `src-tauri/src/agent_network/owned_login.rs` 的 `start_with_return` 先对 `raw_request(...).await?` 解包，然后才比较 400/422。相同文件的 `raw_request_with_limits` 对非成功状态直接返回 `Err(NetworkError::cloud(...))`，无法到达回退分支。旧服务拒绝 `/desktop` 时登录立即失败；Axum extractor 的纯文本 422 还可能在 no-store/JSON 验证更早退出。建议为 start 增加受控、有界的原始响应 seam，仅识别 400/422 后用原 device/challenge 重试一次；其他调用继续保留原 fail-closed 语义。补 loopback 请求体与请求次数断言，包含原服务 JSON 400 和 Axum 文本 422。复审确认：新增 `allow_start_rejection` 且必须满足无 bearer、POST、固定 `/auth/login/start` 的闭集条件；仅 400/422 返回空值供一次原参数回退，其他调用和成功响应继续严格验证。已独立重跑 loopback TCP 测试，200 单请求、纯文本无 cache 400/422 双请求、503 单请求均通过，故关闭该问题。

## 当前通过的代码边界

- 服务端 `/desktop` 在 `start` 显式 allowlist 中，必须 `browserReturn=true`，路径保存于 pending transaction；回调以 state 查原 pending 路径，浏览器不能直接指定跳转目标。
- `callback_using` 仍校验 state、phase、expiry、provider PKCE、nonce、OIDC token；仅 Ready 之后返回成功页。客户端凭据仍需原 PKCE poll 和 Rust owner 发布。
- `moxbot://login/complete` 精确匹配，无参数或凭据；它仅发唤醒事件，没有注册身份或写入凭据权限。既有 native single-instance 与 open-url 回调仍负责显示主窗口。
- Renderer 事件复用当前 attempt 检查函数、flight/epoch/cancel guard，使用既有 `listenWithCleanup` 和 AbortController 清理。旧回调不替代 Rust owner 的取消/提交权威。
- 按钮由 flex 改为 grid，并允许文字换行；独立审阅实际 Vite 组件 fixture 截图，所提供尺寸下按钮无重叠、标签完整。

## 独立验证

- [x] 阅读 AGENTS.md、架构 authority/进程边界、AgentNet 登录生命周期、React cleanup 和 DESIGN 按钮规范，以及 Git 协作配置和任务记录。
- [x] `./node_modules/.bin/vitest run --project dom src/renderer/features/agent-network/useOwnedLoginFlow.test.tsx`：16/16 通过，10.38 秒。
- [x] 旧服务兼容修复复审及定向 fixture 验证：独立执行 `cargo test --manifest-path src-tauri/headless-network/Cargo.toml desktop_start_uses_opt_in`，1/1 通过（运行 0.11 秒，编译 0.81 秒）。
- [x] 独立通过 `view_image` 检查主 Agent 内置浏览器所保存的四张实际 Vite 组件截图：`pending-1280.png` 的完整弹窗与两列按钮无重叠；`pending-660x400.png` 顶部和 `pending-660x400-actions.png` 底部证明弹窗使用纵向滚动、操作区和取消入口可见；`pending-200percent-actions.png` 的按钮标签与边界仍完整、无重叠。主 Agent 报告检查按钮实际点击成功，本审阅者仅独立验证截图，不重复操作该浏览器。

  截图目录：`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/login-callback-20261017/`。这些是合成登录状态配合产品组件/CSS 的 UI 证据；200% 为 640×360 iframe 的 CSS zoom 2，不代表 OS/WebView 原生缩放，不能据此宣告真实 OIDC 或原生登录通过。
- [ ] 真实原生 OIDC→OS URL scheme 唤起→PKCE/Keychain→弹窗关闭。本审阅未操作生产或日常客户端，DOM 模拟通过不能替代该项。

## 复审结论

当前受审 diff 没有剩余可证实的阻断问题。初审 P1 已修复并经独立 loopback 回归确认；renderer DOM 16/16 通过，合成 UI 截图在已覆盖尺寸下通过。真实服务发布、日常客户端安装、原生 URL scheme 与 Keychain 联调仍由主 Agent/指定发布 owner 单独验收。
