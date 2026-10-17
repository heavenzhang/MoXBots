<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/login-callback-20261017 -->
<!-- git-project-sync-task:base=1553ab7cf23f4e1d5c00068592198b758f08f6b3 -->
<!-- git-project-sync-task:status=in-progress -->

# LOGIN-CALLBACK-20261017

## Objective
网页完成桌面登录后自动唤起 MoXBots，原 PKCE owner 确认并保存成功后自动关闭弹窗；浏览器拦截时有明确备用入口。修复登录按钮挤压。保留已有账号、设备、凭据与运行任务。

## Acceptance criteria
- [x] 核实 origin、主干、隔离 worktree、本机 0.5.9 与已注册 moxbot scheme。
- [x] 服务端闭集 /desktop 回跳，区分网页版与 headless，凭据不进入 deep link。
- [x] 原生 deep link 触发检查，成功仍由原 PKCE owner 决定；取消/卸载不迟到提交。
- [x] 定向服务端20/20、OwnedClient loopback1/1、DOM64/64、typecheck/lint及实际渲染与独立审查；桌面编译由CI核实。
- [ ] CI、同步最新主干、合入并核实远端 main。
- [ ] 统一发布 owner 更新云服务与桌面包，真实网页登录→OS唤起→凭据保存→弹窗关闭。

## Completed
已实现三段链路及按钮网格，服务端旧版本拒绝可选参数时保留原轮询登录。主 Agent 负责实现与整体验收，login_review 负责独立只读审查。未调用外部模型。

## Verification
project-sync start PASS。task-init 在产品编辑后执行，因 dirty worktree 拒绝，故手工建立相同格式任务记录；未回滚修改或伪报 task-init 通过。详细证据 dev-docs/login-callback-delivery.md 和 dev-docs/login-callback-review.md。本地服务端152通过/5原配置忽略，headless167通过，服务端clippy/format通过。首轮CI发现仅测试fixture的TS mock类型与tokio spawn门禁，已修正，重新核实最新typecheck和headless clippy后推送。PR103，主干与生产仍待验。

## Blockers and unknowns
生产与日常客户端尚未更新，真实 OIDC/OS 唤起/Keychain 未验收。既定桌面部署 owner 为 01a12bc2-907a-7702-b6dd-788225c5dfe4；本任务不并发签名、换包、重启任务或改生产。云服务部署需协调归属及有效 SSH 身份，先完成可审阅源码交付。

## Next step
完成定向测试、布局验证及独立审阅，再合入主干并登记双端发布请求。
