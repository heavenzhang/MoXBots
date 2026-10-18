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
- [x] PR103 全部7项CI通过，已合入远端main b11e10bc776858f5c2a0d4204f00cc515f3218a6，合入tree与受验head e2cd650010b3dd8dc4544b012549d6ace23f833b 一致。
- [x] 云端与0.5.11公开分发已交付，冻结来源均包含PR103；真实正式候选网页登录后自动关闭弹窗、账号/原设备恢复和冷启动恢复通过。
- [ ] OS scheme唤醒与轮询fallback独立归因；日常0.5.9→0.5.11自动更新安装（A-to-B）。这两项未验收。

## Completed
已实现三段链路及按钮网格，服务端旧版本拒绝可选参数时保留原轮询登录。主 Agent 负责实现与整体验收，login_review 负责独立只读审查。未调用外部模型。

## Verification
project-sync start PASS。task-init 在产品编辑后执行，因 dirty worktree 拒绝，故手工建立相同格式任务记录；未回滚修改或伪报 task-init 通过。详细证据 dev-docs/login-callback-delivery.md 和 dev-docs/login-callback-review.md。本地服务端152通过/5原配置忽略，headless167通过，服务端clippy/format通过。首轮CI发现仅测试fixture的TS mock类型与tokio spawn门禁，已修正，重新核实最新typecheck和headless clippy后推送。PR103源头CI与main已验；2026-10-18双端发布对应和剩余边界见下文及交付文档。

## 双端发布对应（2026-10-18 回执核对）

- 用户明确要求“涉及到云平台相关的也一并部署，跟那个0.5.11一起”，已同步既定桌面发布owner；双方按既有回执确认匹配，无重复部署。
- 云端source `dcf8d9a60976c160e2b2aca33313c668c071132c`，binary SHA256 `b73f5d462504e2d5a132d672ad85ba660605404ef21c46d4af937f92b5748d63`。主干回执 `dev-docs/auth-renewal-production-20261018.md` 记录实际部署与真实原账号OIDC；云端owner `01a12b99-7b38-78b1-831f-9c60257d386a`。该source包含PR103，实际server.rs保留/desktop及desktop-complete页面。此处核对回执与源码，不冒充本聊天再次实测云端。
- 桌面0.5.11 source/tag `15be9d6fda17c464afa54ee675d10f1d7fd4507f` / v0.5.11，同样包含PR103；签名/公证和公开分发已验。实际正式候选网页登录及原设备恢复后自动关闭登录窗、冷启动恢复通过，证据 `dev-docs/releases/moxbots-0.5.11.md`。该记录明确OS scheme与轮询fallback没有独立仪器化归因。
- `/Applications/MoXBots.app` 在上述发行验收时仍0.5.9，未由该任务替换；0.5.11从临时路径运行，不等同日常已安装或自动更新A-to-B通过。

## Blockers and unknowns

OS独立唤起证据、A-to-B安装仍开放；当前无新增安全维护窗口。既定桌面owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 已确认：本轮会话审计只补记录，不另启生产发布、不操作日常客户端、不覆盖不可变0.5.11，也不为历史未部署快照重复部署云端。云端及桌面运行事实以上述精确回执为时间点边界，不宣称之后环境从未变化。

## Next step

将后续真实OS唤起和A-to-B请求排入统一发布队列；由原owner在下次安全窗口取得fresh空闲准入、备份/回滚后验收，分别记录运行source/digest、系统唤起、PKCE/凭据保存、弹窗关闭和安装结果。未获窗口前保持待验，不重开生产发布。
