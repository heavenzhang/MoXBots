<!-- git-project-sync-task:source-digest=c6d72646016eb0116f673886ccfc7818743c5dce045c3085dc59050e4b4db6ed -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=5518e613-a6e8-4312-a59c-edeff646c4cb -->
<!-- git-project-sync-task:branch=codex/login-regression-20261028 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-LOGIN-REGRESSION-20261028

## Objective
修复登录超时提示误用、已提交登录被二次选择写入报错、启动账号投影读取失败后无法恢复。保留原 OAuth/PKCE、凭据及设备身份 owner；不重启日常 App、不修改账号或生产会话。

## Acceptance criteria
- [x] 从实际仓库、主干、已安装版本及日志核查，不把历史修复与当前运行版本混同。
- [x] 先以 3 条失败回归重现启动超时错误文案、登录成功后多余写入失败、首次账号读取失败无恢复。
- [x] 148项相称单元/DOM、类型、lint/分类、IAB实际组件宽窄渲染与交互通过；有限独立源码/截图审阅无阻断。
- [ ] 任务及精确分支 SHA 保存到远端，交统一 owner 组织 CI/main/下一未冻结发布批次。
- [ ] 当前Mac登录返回、退出重开状态、有效期及网络失败分流复验。
- [ ] 桌面Owned账号会话自动续期缺口的原生修复及安全持久化/冷启动/并发验收；前三项Renderer修复不覆盖此项。

## Completed
创建独立 worktree；安装版为 0.5.24/524.1。原生当前日志记录实例发现 GET 超时；本机默认与直连只读探测均在 TLS 建立前超时。此结果不证明云端宕机，也不证明凭据丢失。代码已修复 3 处回归，并增加 focus 只读同步及会话有效期文案；本地验证和有限独立复核已通过。

## Verification

- Source digest: `c6d72646016eb0116f673886ccfc7818743c5dce045c3085dc59050e4b4db6ed`; Documentation-only continuation; prior product tree unchanged, 148 focused tests and type/lint/IAB checks remain applicable; current installed CLI network status read-only confirmed signInRequired/OWNED_SESSION_INVALID; direct TLS timeout and SSH remote close prevent server expiry verification; native renewal implementation and real reopen acceptance still open

- Source digest: `6db859a84cad63f418de9ef0512cc7615065a1ec01e737d8d7f234eff4a72ac6`; 148 focused unit/DOM tests passed; pretypecheck and tsc passed; scoped ESLint and classification passed; IAB actual component 1280/390 synthetic paths passed; independent source/screenshot review no blocking findings; native sign-in/reopen and shared CI/main pending owner

RED：58项中3项失败/55项通过；GREEN：148项通过；tsc/lint/分类及IAB1280/390通过。原文保留本地 work/MOXBOTS-LOGIN-REGRESSION-20261028。验收和边界见 dev-docs/login-regression-20261028/acceptance.md。

## Blockers and unknowns
用户已确认当前Mac；真实只读状态为当前Owned会话OWNED_SESSION_INVALID/signInRequired，原生没有可用expiry metadata，具体失效原因仍未证明。截图本身不能证明登录凭据未保存。原Air的网页登录及Cmd-Q验收在历史记录中没有闭合；本次需 fresh 设备/版本/实际路径证据。服务实际session TTL未核实，不承诺无限期免登录。当前 0.5.25/525.1 已冻结，不将本任务强加到其冻结源。

## Deployment request
- Required: required; desktop/macOS/updater，目标为现有正式桌面通道，版本由统一owner分配。
- Handoff: 本远端分支与任务记录；精确HEAD在本文件之外的release-queue记录。
- Evidence and dependencies: 仅Renderer投影及文案，无云端/Host/mobile协议、凭据或DB迁移；原OAuth和native commit不变。
- Status: source and local checks accepted; CI/main、签名制品、安装与实际设备验收分别待证据。
- Owners: desktop/macOS/updater及combined CI/main继续由01a12bc2-907a-7702-b6dd-788225c5dfe4负责。本会话不触发共享CI、不分配版本、不替换日常App。

## Next step
前三项源码已推送1836458542c9503fac6b8d33f32aed3fc7e548e0并向既有owner发出请求；跟踪CI/main/下一未冻结发布。继续按验收文档中的原生续期安全范围补齐实现；当前Mac仍需真实登录/退出重开证据，云端SQL因SSH连接关闭未执行。
