<!-- git-project-sync-task:source-digest=794c45a4c417522c8d9660f80d21fece647c805322cd95e8f9bcf14b1f11540f -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=c9e0f076-7e61-4567-8c18-1c1e0c14722f -->
<!-- git-project-sync-task:branch=codex/im-bot-binding-20261107 -->
<!-- git-project-sync-task:base=bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-IM-BINDING-20261107 已有 Bot 绑定多个 IM 身份

## Objective

完善已有 Bot 的一对多 IM 身份绑定；用户确认本轮不做同一个 IM 机器人按用户/群分配不同 Bot。复用既有 Agent Channel、Plugin Bridge、配对/群权限与会话 owner。

## Acceptance criteria

- [x] 按 Bot 展示绑定身份/用户/群/真实连接状态，向导明确目标，仍可使用原管理入口。
- [x] 稳定身份筛选与选择过期校验；隐藏/归档冲突不能误绑定。
- [x] 本地回归与真实组件浏览器检查。
- [ ] 原 owner 统一 CI/main、发行及真实测试聊天收发验收。

## Completed

已完成开源/源码核查、总览、已有 Bot 选择与向导提示、选择过期校验、未知状态修正。细节和来源见 `dev-docs/im-bot-binding-20261107/acceptance.md`。

## Verification

- Source digest: `794c45a4c417522c8d9660f80d21fece647c805322cd95e8f9bcf14b1f11540f`; 80 targeted tests PASS; TypeScript/lint/classification/Web build/theme/diff PASS; deps 0 errors; IAB actual components light/dark 390px PASS (synthetic only); real IM/native/main pending original release owner

51 项功能/身份/向导回归与 29 项原配置/插件/回复隔离回归通过；TypeScript、定向 lint、diff、测试分类、Vite moxbot Web 构建、主题 CSS 检查通过，依赖检查 0 error / 20 未改动 orphan warning。内置浏览器 1280 浅色/390 深色、选择/取消/展开通过，纯合成数据。真实账号与原生验证未运行。

## Blockers and unknowns

真实联调尚无用户指定的测试聊天/消息授权。共享 CI/main/发行由原 desktop owner 统一安排，本会话不越权执行。无发布版本或制品摘要，不声明全部完成。

## Deployment request

- Required: desktop/macOS-arm64/updater/sharedCI/main，下一未冻结批。
- Handoff: 本任务分支及 `dev-docs/im-bot-binding-20261107/acceptance.md`；精确提交写外部发布队列。
- Evidence and dependencies: 无新进程/配置格式/迁移/权限，无跨单元依赖，原 Channel 和 Session 机制不变。
- Status: 本地验证完成，本次保存同步远端分支后提交精确 source 供独立审阅/统一集成与发布。
- Owners: `01a12bc2-907a-7702-b6dd-788225c5dfe4`。

## Next step

完成分支保存并交原 desktop owner 精确 SHA 与测试证据，核实远端 main 包含改动后推进统一发布及指定测试聊天验收。
