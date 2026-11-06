<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-focus-05-20261107 -->
<!-- git-project-sync-task:base=05ea1e2c4d06f112585012a27503adc75c184dcc -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-MOBILE-FOCUS-05 聚焦继续任务的默认界面

## Objective

MB-MOBILE-FOCUS-05：按用户要求进一步聚焦手机默认页面。依赖V04精确01441a9979473a7c000f909624a9964e6b8a091a。主干初始化后已快进继承既有C03/V04历史。用户已认可效果并授权完善关键交互后交原负责人打包，当前完成本地验收并准备精确提交交接。

## Acceptance criteria

- [x] F05-1 首页常驻搜索框、Bot筛选、状态筛选移入按需展开，选中筛选可见且可清除。
- [x] F05-2 去掉普通状态重复说明，离线/未确认回执/同步异常说明保留。
- [x] F05-3 成果默认直接展示文件与操作，说明收进已有详情。
- [x] F05-4 390实际页面渲染与三页效果图；typecheck/lint结果见当前预览记录。
- [x] F05-5 320/390关键交互、独立源码/截图审阅；源码提交与远端交接见Git记录，独立点击未验证。
- [ ] F05-6 原shared owner CI/main与原mobile owner新包、真实设备验收。

## Completed

本地源码4文件展示层调整；用户已认可。验收及证据见dev-docs/mobile-focus-05/acceptance.md、REVIEW.md；搜索expanded一致性修正已完成。

## Verification

最终typecheck/lint/diff检查及125项policy测试通过。320/390筛选恢复、草稿/回答保留、成果接续与新消息后旧成果、过期审批、unknown保护均实际走查；仅合成身份，无真实业务调用。独立源码/截图审查与独立点击门禁分开记录。

## Blockers and unknowns

本地验收完成，尚未发布新手机包。新main和手机候选由原owner统一处理，归属未变。不替换冻结制品，不新增桌面/云端变更。

## Next step

交精确提交、独立审阅与验收证据给原shared CI/main及mobile负责人；核实main包含C03/V04/F05、候选对应及真机体验。
