<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-policy-20261022 -->
<!-- git-project-sync-task:base=c8068493cfbfd32836c132ae63d5fbd227300b53 -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-MODEL-POLICY-20261022-02

## Objective
用户要求重排优先级后完整实现模型策略：P0候选池维护与实际自动路由约束，P1搜索批量和失效/引用维护，P2完整名称与排序换档，P3状态反馈和撤销。用户已明确确认 https://github.com/heavenzhang/MoXBots.git。

## Acceptance criteria
- [x] 核对实际main、旧功能祖先、工作区与部署owner；start/task-init通过。
- [x] 显式候选池增删/暂停恢复/空池/目录刷新持久化；自动路由、分类器和自动接管遵守。
- [x] 搜索、批量维护、失效修复、引用影响说明。
- [x] 三档摘要和全宽列表、完整模型名/供应商、直接换档/双向排序。
- [x] 原writer锁内修改、保存失败恢复、撤销；作用范围和分档来源说明。
- [x] 相称策略/配置/隔离联调与DOM测试，独立视觉/交互/窄窗验收及主Agent复验。
- [ ] 提交push并交desktop owner统一CI/main/下一未冻结发布；远端main核实。
- [ ] 原生与真实Provider/生产验收由该制品owner按批次完成。

## Completed
当前主干已包含上一模型设置六项功能；旧分支保留。本次实现、独立后端审阅、独立UI三项缺陷修复复验、主Agent复验均完成。本任务独立树和分支从main c8068493开始。共享接口固定：autoRouting.pool缺省跟随目录；对象为显式名单，{}为空池，enabled:false为暂停。身份、配置writer和Session owner不变。

## Verification
完整证据 `dev-docs/model-policy-20261022/acceptance.md`。合并最新main后171项定向测试通过，TypeScript/受影响ESLint/测试分类/依赖检查通过；独立UI10组关键交互及四宽、最终3组键盘增量通过，主Agent5组浏览器复验通过。UI和localStorage是隔离合成，不证明真实Provider/原生持久化/生产。后端只读审阅最终无P0/P1。

## Blockers and unknowns
无开发阻断。初次start远端查询短暂失败后，保留并暂存本任务补丁，恢复干净起点后start/task-init通过，已恢复补丁。共享CI/main/正式构建与发布由唯一desktop owner控制，不自行触发。未改变日常App或真实配置。

## Deployment request
Unit desktop builtin client；唯一CI/deployment/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人），沿用canonical共享计划。下一未冻结批次，不加入当前5.18冻结包。接口向后兼容无迁移；手动固定/指定备用独立保留。版本/tag/制品摘要由owner分配。

## Next step
提交push最终源码与证据，通过handoff gate，按用户明确“合入主干”要求交既有desktop owner统一PR/CI/main。主Agent等待精确main回执并用远端ref和祖先关系回读核实；发布/原生/真实Provider仍按该owner的下一未冻结制品记录，不把代码合入写成已发布。
