<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/bot-project-workbench-20261107 -->
<!-- git-project-sync-task:base=4ceeb2d21acc164487ef199b4a5788d7d27c65f1 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->
<!-- git-project-sync-task:id=eca9faba-6a6e-46e7-9c09-302451a6c701 -->
<!-- git-project-sync-task:source-digest=0f8a9ec9b6385e9b1c7369df2738e65b31ebdf92b4432cc0831ccc1ce78410e7 -->

# Task: MB-BOT-NAV-20261102 PROJECT-01 项目工作台

## Objective

PROJECT-01：基于现有项目页面呈现当前工作、最近/全部会话、成果记录和资料，保留成员/编辑入口；以 Session 冻结 projectId 精确关联，不按 Bot 或工作区推断所属项目。总 goal 的 GROUP/HANDOFF 阶段仍未完成。

## Acceptance criteria

- 同一 Bot 的 A/B 项目互不串入；跨项目/不完整链接的 Task 不误归属。
- 实时查询只读、有限并发、仅活动页面；不唤醒会话、不发消息。切换/隐藏/迟到结果安全。
- idle 不冒充完成；仅 Task/Goal 明确终态进入成果，实际文件/说明在原会话查看，不恢复聊天人工评审控件。
- 真实产品组件深浅/窄屏、键盘、原会话打开及部分失败重试通过；源码/主干/发行分层记录。

## Completed

PROJECT-01 实现完成：当前工作、项目对话、成果、原资料/成员；冻结项目归属和只读有限观察。具体行为、完整清单和范围见 dev-docs/bot-project-workbench-20261107/PLAN.md。

## Verification

本地 5 文件 22 项测试通过；TypeScript、修改文件 ESLint、分类与依赖边界通过；moxbot renderer build 通过。隔离 WebKit 实际组件合成数据检查通过：原会话回调、同 Bot 项目隔离、失败重试、390px、主题与键盘。验收边界与复现入口见 dev-docs/bot-project-workbench-20261107/acceptance.md。未运行共享 CI/正式构建/安装/真实业务验收。

## Blockers and unknowns

唯一桌面/sharedCI/main/版本/安装 owner 仍 01a12bc2-907a-7702-b6dd-788225c5dfe4。NAV 独立已交 producer80a58f3a；本项目页面任务不得改变其精确候选或当前543.3。项目的成果只可声称明确完成记录和回到原会话，不能将 Task 状态或空闲误作文件已存在/用户已验收。

## Next step

提交并核对远端精确 SHA 后交原 owner 独立审阅与 main/下一未冻结批发布；继续 GROUP-01/HANDOFF-01，整体目标不缩减。
