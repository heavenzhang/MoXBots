<!-- git-project-sync-task:source-digest=c5ec82dfeafb08d762447a25d6dfa5e6715a5ff5865c6f0e83aa24429b521ad5 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=a0f3e616-909f-4180-9a3b-55f3be989860 -->
<!-- git-project-sync-task:branch=codex/simple-ux-results-20261106 -->
<!-- git-project-sync-task:base=59e0277a518d8b221bc5756bb890da1f91d4417b -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-SIMPLE-UX-20261105 第二批会话成果入口

## Objective

继续用户确认的逐步实施，第二批提供会话成果与文件入口、搜索、原FileAction预览及原消息定位。仅投影原transcript，无新数据库/运行时/权限；第一批59faa99独立待原owner集成。范围与稳定ToDo见dev-docs/simple-ux-results-20261106/PLAN.md。

## Acceptance criteria

- 成功结构化记录/助手本地链接按来源真实展示，失败不算产出，去重/重命名/删除及会话隔离正确。
- 默认关闭不解析历史，打开后缓存稳定文本；原FileAction复验与滚动owner定位/历史锚点保持。
- 类型/lint/分类/边界/构建及相称回归、非实现者审阅、实际宽窄组件页面通过。
- 远端handoff，原唯一owner合main/统一CI/下一未冻结包和真实原生文件路径分别核验。

## Completed

- 实现78ec0b5已同步远端任务分支，project-sync handoff通过，源码/本地层完成。

- UX-09a/09b/10a源码完成；88unit+91DOM+8theme、类型/定向lint/分类及moxbot renderer构建通过。
- 独审14项通过，重命名旧链接、历史重复解析、缓存Tab portal和末页焦点均关闭。
- IAB实际组件页1280/390/320与浅深、搜索/委托/分页/焦点通过；数据和预览回调为合成，不冒称真实文件IO。

## Verification

- Source digest: `c5ec82dfeafb08d762447a25d6dfa5e6715a5ff5865c6f0e83aa24429b521ad5`; Docs only; product bytes unchanged from verified78ec0b5; prior handoff PASS; source/native/main/release gates kept separate

- Source digest: `f5b31051b3b675c8b14e0ae4b712d10d5cd8fc71b9bf88cd66ce75fb23cb0adc`; 88 unit +91 DOM +8 theme PASS; tsc/changed eslint/classification/moxbot renderer build PASS; deps 0 errors/20 warnings; independent14 PASS; actual IAB component1280/390/320 PASS; real file IO/native/main pending original owner

见dev-docs/simple-ux-results-20261106/acceptance.md、review.md、evidence/checks.json及截图；原始日志本地work/MB-SIMPLE-UX-20261105-P2/logs/。depcruise零错误20已有warning，不声称零警告全仓检查。真实凭据/业务写入未执行。

## Blockers and unknowns

真实文件可用性/预览IO/完整原生Chat、main/CI/正式制品与发行待原owner。单元desktop/macOS-arm64/updater/sharedCI/main唯一01a12bc2-907a-7702-b6dd-788225c5dfe4；不改542.2或stable0.5.36、不另触发共享CI/正式构建。没有其他单元或迁移依赖。

## Next step

交既有owner核对最新main与首批59faa99，统一审核/CI/main及下一未冻结批原生文件路径；随后按共享清单继续UX-07/08和完整UX-10。
