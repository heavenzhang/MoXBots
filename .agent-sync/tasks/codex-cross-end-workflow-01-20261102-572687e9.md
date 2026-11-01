<!-- git-project-sync-task:source-digest=d160fe502a0a9b9ed0ef2a2709ac029b4fc56044ccf39dacd970ef73c9f410ea -->
<!-- git-project-sync-task:id=1ed37374-daed-4120-a074-21c67507e607 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/cross-end-workflow-01-20261102 -->
<!-- git-project-sync-task:base=630ae62ed60c8bf8adf828dcc84cc69b5184e7f4 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-CROSS-END-WORKFLOW-01：统一工作完成与归档语义

## Objective

执行MB-CROSS-END-WORKFLOW-01第一批；范围见dev-docs/cross-end-workflow-01/PLAN.md。统一桌面看板完成与归档语义，手机原会话操作表达。

## Acceptance criteria

- 空闲会话不归入已完成；待验收任务不经归档隐式完成；已完成任务归档恢复无dispatch；手机状态与打开动作不声称验收。

## Completed

- 完成状态/归档与手机入口改造，规则与验收见dev-docs/cross-end-workflow-01/；主干/安装分别待owner。

## Verification

- Source digest: `d160fe502a0a9b9ed0ef2a2709ac029b4fc56044ccf39dacd970ef73c9f410ea`; Verified entire pre-existing shared plan prefix byte-for-byte against630ae62e; only new task section appended. Source unchanged since45desktop/117mobile pass.

- Source digest: `eda56cf217499d992e2fd7c58fd2d534503a5006763398076bdbea81e1ccb8bf`; 45 desktop unit/DOM pass, scoped lint pass; previous117mobile and both type/lint pass; no transport or schema changes.

- Source digest: `9fb66f54937a619001da4dbfdeeea9db48ddd9010c9b3788a31665f058fa1a4f`; 45 desktop unit/DOM and117 mobile policy passed; desktop/mobile tsc/lint and classification passed; actual React synthetic browser1450/390 passed. Native integration pending original release owners.

- 45 desktop unit/DOM + 117 mobile policy通过；双端type/lint、classification、diff通过；1450/390实际组件合成走查通过。

## Blockers and unknowns

- 独立真实接口/原生验收待既有owner统一发布；无新增owner。sharedCI/main01a12bc2；mobile01a12b99。

## Next step

- 原owner核对远端精确SHA和acceptance后统一共享CI/main；保持532.3冻结制品不变。
