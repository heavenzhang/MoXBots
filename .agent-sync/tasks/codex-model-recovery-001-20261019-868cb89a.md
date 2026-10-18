<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-recovery-001-20261019 -->
<!-- git-project-sync-task:base=885426ea19afe9d3d86b54f0d13695c8bdae9ce4 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-MODEL-RECOVERY-001 持久等待与安全续接

## Objective

MOXBOTS-MODEL-RECOVERY-001：普通 builtin API Session 与 Goal 的模型不可用持久等待、安全续接及暂停/停止防复活。用户授权本次实现、测试后合 main，并交既定统一发布聊天安排下一未冻结版本；不操作日常客户端。

## Acceptance criteria

- [x] 同一inference lease持久等待，原native history与动作ledger禁止确切已完成操作重放。
- [x] Stop/Goal暂停撤销epoch并持久停止fence；存储失败显式回报。
- [x] 真实SessionStore与SDK受控故障路径；SDK计数始终1。
- [ ] 最新main组合检查、完整CI、正常合入及远端包含核验。
- [ ] UI实际浏览器、发布交接接收；原生签名包/真实Provider生产验收由唯一publisher单独追踪。

## Completed

实现和审查记录 `dev-docs/model-recovery/plan.md`，机制 `specs/tech_docs/model_recovery.md`。当前阶段尚未合入 main；提交历史与远端ref定义最终状态。

## Verification

已运行定向198项、原builtin组合108项、新增冷恢复/取消准入2项和DOM132项；部分为修复前阶段结果，最终精确提交组合重跑以 `dev-docs/model-recovery/acceptance.md` 为准。SDK受控真实counter=1、重复工具拒绝2次、原native重建/15s意图和原deadline保留。未调用付费Provider。

## Blockers and unknowns

实际发行、签名候选、真实Provider/原生UI/生产业务未验收。本实现不越过external/managed/integrated runtime自身推理owner；范围与限制见机制文档。不冒称所有运行时已支持。

## Next step

收集最终检查、修复UI fixture运行错误、提交并同步最新main后正常PR/CI，通知唯一publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4`，核接收后记录发布批次。

## Deployment request

Required: desktop next unfrozen release, sole publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4`。不得修改已冻结或已发布版本，不重启/替换日常客户端。无配置迁移、无新公网服务/权限/依赖；新增Session字段向后可读，但旧二进制不识别恢复停止fence，因此回退前暂停/导出受影响checkpoint并保持业务与native历史。
