<!-- git-project-sync-task:source-digest=943c3cf2c2927c074339be5f6e6bc01deb2e887b9e71473598cc0f2ad20a89c2 -->
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

- Source digest: `943c3cf2c2927c074339be5f6e6bc01deb2e887b9e71473598cc0f2ad20a89c2`; Merged main a650939d normally; only append conflict in shared plan retained both; 12 files 80 tests and TypeScript PASS; official Feishu read-only preflight PASS; actual roundtrip/native/remote main pending

- Source digest: `2d503ededb97a66a33e061994e12c1233f9cab14b51c12b70fd328a693d3b4d7`; Documentation-only follow-up; official Feishu credential/bot/member preflight code=0, no messages sent; runtime bytes unchanged from f8dc56e4; main/native/real roundtrip pending

- Source digest: `794c45a4c417522c8d9660f80d21fece647c805322cd95e8f9bcf14b1f11540f`; 80 targeted tests PASS; TypeScript/lint/classification/Web build/theme/diff PASS; deps 0 errors; IAB actual components light/dark 390px PASS (synthetic only); real IM/native/main pending original release owner

已 merge 最新 main a650939d（保留两边计划追加），再次实跑 12 文件 80 项回归和 TypeScript 通过；51 项功能/身份/向导与 29 项原配置/插件/回复隔离回归保持通过；TypeScript、定向 lint、diff、测试分类、Vite moxbot Web 构建、主题 CSS 检查通过，依赖检查 0 error / 20 未改动 orphan warning。内置浏览器 1280 浅色/390 深色、选择/取消/展开通过，纯合成数据。真实账号与原生验证未运行。

## Blockers and unknowns

用户已授权使用本人飞书验证；既有机器人凭据/启用状态及原配对用户的官方 API 预检查通过，当前 MoXBots 尚无飞书绑定/插件，真实收发待原生设置接线和本人回复。共享 CI/main/发行由原 desktop owner 统一安排，本会话不越权执行。无发布版本或制品摘要，不声明全部完成。

## Deployment request

- Required: desktop/macOS-arm64/updater/sharedCI/main，下一未冻结批。
- Handoff: 本任务分支及 `dev-docs/im-bot-binding-20261107/acceptance.md`；精确提交写外部发布队列。
- Evidence and dependencies: 无新进程/配置格式/迁移/权限，无跨单元依赖，原 Channel 和 Session 机制不变。
- Status: 本地验证完成，本次保存同步远端分支后提交精确 source 供独立审阅/统一集成与发布。
- Owners: `01a12bc2-907a-7702-b6dd-788225c5dfe4`。

## Next step

原 desktop owner 统一集成/发布本源码；协调当前原生窗口，把已核实的既有飞书身份绑定到同 ID 的 Bot 后执行本人私聊单条收发验收。新 UI 原生验收与现有版本技术联调分别记录。
