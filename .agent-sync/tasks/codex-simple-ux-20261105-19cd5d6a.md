<!-- git-project-sync-task:source-digest=0e682c8d3b920e281785faee5777af4fc17c430a28ad045e8d8e98f0711bdf43 -->
<!-- git-project-sync-task:id=c5e972be-3a7c-4fb0-9715-6085d7f1026c -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/simple-ux-20261105 -->
<!-- git-project-sync-task:base=39b3447659dd92e71f9bb86bf12f2326bb3e5fcd -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-SIMPLE-UX-20261105 简洁界面首批改进

## Objective

按用户确认的 Grok Bot 借鉴示意逐步实施。首批 UX-01～06：右侧工作区默认收起/记住主动选择、状态摘要去外框、输入菜单收拢；复用已有恢复保护和阅读/草稿行为。完整稳定清单 dev-docs/simple-ux-20261105/PLAN.md。

## Acceptance criteria

- 首批行为与原权限/恢复 owner 一致，默认不遮挡对话；相称测试、类型、lint、构建通过。
- 真实 renderer 宽窄/焦点/菜单实测，独立源审，远端分支保存与 handoff 通过。
- 由既有唯一 desktop/sharedCI/main owner 统一 CI/main、版本和下一未冻结包；远端 main 与原生路径单独核验。

## Completed

- 实现提交ac3aa8c已推送远端任务分支，handoff通过，工作树干净；源码/本地层完成，main和发行另待owner。

- UX-01/02/05 源码修改与相应测试，UX-03/04/06 复用现有实现且关键行为回归通过。
- 本地228项布局/DOM回归、8项主题；类型和修改文件lint通过；moxbot renderer构建通过。未声称真实UI或原生完成。

## Verification

- Source digest: `0e682c8d3b920e281785faee5777af4fc17c430a28ad045e8d8e98f0711bdf43`; Documentation only; product bytes unchanged from tested ac3aa8c; prior handoff PASS; real UI and main/release remain pending original owner

- Source digest: `92c04bff68f921ce32487f9e597411bc69144eefe12ea6865d667734600855aa`; 228 targeted unit/DOM +8 theme PASS; 26 review-fix DOM PASS; tsc and changed ESLint PASS; classification PASS; deps 0 errors/20 warnings; moxbot renderer build PASS; independent P2 closed; actual UI blocked by Work browser settings

- 见 dev-docs/simple-ux-20261105/acceptance.md 与 evidence/checks.json；原始日志在协作工作区 work/MB-SIMPLE-UX-20261105/logs/。
- vitest 28 unit +173 DOM +27相邻DOM，8 theme PASS；tsc --noEmit PASS；定向eslint零错误零警告；分类PASS；depcruise零错误20警告。
- MYAGENTS_BUILD_PROFILE=moxbot npm run build:web PASS。独立源审1项P2已修复并复审关闭，见review.md。

## Blockers and unknowns

- 内置浏览器被Work设置禁用，未操作用户Chrome或日常App；真实页面与原生路径待验。
- desktop/macOS-arm64/updater/sharedCI/main 仍唯一01a12bc2-907a-7702-b6dd-788225c5dfe4；当前该owner协调PR249，开发不另开PR/共享CI。冻结542.1不变，不分配版本。
- 未合main、未正式打包/安装/发布，不涉及cloud/mobile/Host/website、数据迁移或业务写入。

## Next step

保存精确远端提交并通过handoff后，交既有唯一owner核对最新main、必要UI门禁和下一未冻结批；后续UX-07～18按PLAN逐步推进。
