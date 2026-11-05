<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/native-login-20261105 -->
<!-- git-project-sync-task:base=065f2b6c8fb2aff58e774000909990b531ff8eb8 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-NATIVE-LOGIN-20261105: 桌面客户端内账号密码登录

## Objective

任务 ID `MB-NATIVE-LOGIN-20261105`。桌面客户端内输入账号密码并显式确认基本身份/邮箱授权，通过现有 OwnedClient 与原 Rust 登录 owner 完成身份验证、会话保存/恢复及退出。保留本机现有登录与业务；不读取、复制或记录其密码。不涉及历史恢复故障注入/重放。

## Acceptance criteria

- [x] 核实权威 Git、main、隔离 worktree、登录任务与部署归属。
- [x] 原生桌面表单、默认未勾选授权、固定错误提示、防重复提交与凭据短期处理。
- [x] 复用现有 PKCE/poll/trust/session/registry 保存与恢复，取消和账号边界不接受迟到结果。
- [x] 定向 Rust/DOM/类型/lint/build 与独立源码审核。
- [ ] 真实渲染、键盘、明暗主题与窄视口（IAB不可用，个人Chrome授权待回复）。
- [ ] 提交、远端分支核实，向原负责人交接正常 PR/CI/main 及下一未冻结候选。
- [ ] 隔离真实账号登录、持久化/重启、退出实际验收（无可用测试身份时保持未验）。
- [ ] 正式发行/安装后真实用户路径复验，由原唯一负责人组织。

## Completed

- 创建独立 `codex/native-login-20261105`，基线 main065f2b6c；历史 worktree 干净，未动其源码/业务实例。
- 已读项目地图、相关共享计划、AGENTS/CLAUDE 与既有登录任务。已有服务 `/auth/login/password`、移动端原生确认和原 PKCE HTTP client，桌面尚未接线。
- 原生表单与Rust接线已实现；完整说明、可复现实际组件夹具与隔离真实步骤位于`dev-docs/native-login-20261105/`。
- 当前会话负责前端与整体交付；受限原生子 Agent `native_auth` 仅写 Rust 登录/registry/commands/lib。选择内置 sol/high 的依据是账号安全、跨层生命周期和存储边界；不调用外部原因：本轮采用 ai-yaoren-local 纯内置模式。实际 token/费用不可测。

## Verification

- `project-sync observe/start/task-init --remote https://github.com/heavenzhang/MoXBots.git` PASS。
- main/remote 来源核实，分支推送无自动共享 CI；PR/main push 会触发，交由原 owner 统一协调。
- 62DOM +16unit +63RustOwned +1Rustregistry 共142项定向通过；完整Rust crate check/all-targetClippy redlines、tsc/定向lint/rendererbuild通过。主Agent关键loopback复验通过；独立review无确认P1/P2并复跑62DOM。
- 原始日志/限制：项目资料`work/MB-NATIVE-LOGIN-20261105/`；详细验收`dev-docs/native-login-20261105/acceptance.md`。源码、模拟、真实认证、持久化、正式制品分开。

## Blockers and unknowns

- 真实账号密码不在本任务上下文中，禁止从其他账号或现有实例提取；优先隔离测试。
- 原cloud owner只读核实当前服务native_password_login=true、Dex local connector、原确认页保留，接口可复用，无需本轮服务部署；具体账号MFA及真实认证尚未验。
- desktop/macOS-arm64/updater/共享CI/main/版本/签名/安装/发布唯一 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`。现有候选以最新回执为准，不能重用旧版本推断。
- cloud auth/101 唯一 owner `01a12b99-7b38-78b1-831f-9c60257d386a`。本轮预计无需服务代码变更；如需发布仅提精确依赖，不自行操作生产。

## Next step

- 提交/推送已审源码与任务记录，向原desktop owner交精确SHA请求正常PR/CI/main；取得浏览器授权后做实际组件视觉/交互，真实登录由用户在隔离客户端输入并分层验收。
