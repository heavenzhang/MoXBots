<!-- git-project-sync-task:source-digest=c8c8a7e8a36236a76c776dcb1fe351001f36d0fcb6880511a85a70931ed126e3 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=c8e90687-8067-40f2-a41d-f5e9926b0149 -->
<!-- git-project-sync-task:branch=codex/mobile-workflow-release-20261103 -->
<!-- git-project-sync-task:base=186f88dc942607ddb5e58db158b294c37f0ad83d -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-CROSS-END-WORKFLOW-01 手机第一批测试交付

## Objective

MB-CROSS-END-WORKFLOW-01手机增量：将运行/等待/中断/本轮结束与打开动作明确呈现，补齐屏幕可见状态说明；保留原Bot/Session/onOpen，目标为原owner新包安装Kevin手机。

## Acceptance criteria

- 状态说明真实显示；打开原会话不dispatch、不重试；新包含精确源与main，版本/摘要可回读，当前手机可启动。

## Completed

- 从旧跨端源抽取mobile三文件，无桌面历史计划或其他改动。

## Verification

- Source digest: `c8c8a7e8a36236a76c776dcb1fe351001f36d0fcb6880511a85a70931ed126e3`; 117policy/type/scopedlint/classification/diff passed; actualExpoQA synthetic390/320 productUI shows turn-end boundary and open original session. Native package/install pending originalowners.

- 117 policy/type/lint通过；真实Expo QA页面320/390可见说明、原会话打开通过；记录dev-docs/mobile-workflow-release-20261103/acceptance.md。

## Blockers and unknowns

- 原CI/main和mobile owner需完成复审/发布；完整V10不在本批。

## Deployment request

- Required: mobile iOS test install; CI/main owner01a12bc2，build/sign/install owner01a12b99；当前Kevin iPhone。无desktop/cloud部署。
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence and dependencies: link tests, cross-unit compatibility/order, configuration/migrations, and rollback constraints.
- Status: not submitted; track code/main delivery, each unit rollout, and production acceptance separately.
- Owners: route each unit to its designated CI/deployment chat in the latest canonical plan; this task does not claim ownership.

## Next step

- 原owner对精确远端SHA独审/CI/main，手机owner完成build9/安装并回读。
