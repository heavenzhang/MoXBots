<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-policy-20261022 -->
<!-- git-project-sync-task:base=c8068493cfbfd32836c132ae63d5fbd227300b53 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MODEL-POLICY-20261022-02

## Objective
用户要求重排优先级后完整实现模型策略：P0候选池维护与实际自动路由约束，P1搜索批量和失效/引用维护，P2完整名称与排序换档，P3状态反馈和撤销。用户已明确确认 https://github.com/heavenzhang/MoXBots.git。

## Acceptance criteria
- [x] 核对实际main、旧功能祖先、工作区与部署owner；start/task-init通过。
- [ ] 显式候选池增删/暂停恢复/空池/目录刷新持久化；自动路由、分类器和自动接管遵守。
- [ ] 搜索、批量维护、失效修复、引用影响说明。
- [ ] 三档摘要和全宽列表、完整模型名/供应商、直接换档/双向排序。
- [ ] 原writer锁内修改、保存失败恢复、撤销；作用范围和分档来源说明。
- [ ] 相称策略/配置/隔离联调与DOM测试，独立视觉/交互/窄窗验收及主Agent复验。
- [ ] 提交push并交desktop owner统一CI/main/下一未冻结发布；远端main核实。
- [ ] 原生与真实Provider/生产验收由该制品owner按批次完成。

## Completed
当前主干已包含上一模型设置六项功能；旧分支保留。本任务独立树和分支从main c8068493开始。共享接口固定：autoRouting.pool缺省跟随目录；对象为显式名单，{}为空池，enabled:false为暂停。身份、配置writer和Session owner不变。

## Verification
旧实现基线35项通过，仅证明旧分支。新实现待验证。视觉基线为原纸色/绿色主题，1440x1000、1024x768、768x900、390x844窄窗压力。合成UI不证明真实Provider、原生持久化或生产。

## Blockers and unknowns
无开发阻断。初次start远端查询短暂失败后，保留并暂存本任务补丁，恢复干净起点后start/task-init通过，已恢复补丁。共享CI/main/正式构建与发布由唯一desktop owner控制，不自行触发。未改变日常App或真实配置。

## Deployment request
Unit desktop builtin client；唯一CI/deployment/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人），沿用canonical共享计划。下一未冻结批次，不加入当前5.18冻结包。接口向后兼容无迁移；手动固定/指定备用独立保留。版本/tag/制品摘要由owner分配。

## Next step
完成共享接口并分离UI实现树，主Agent实现后端资格和配置writer，独立审阅者验收实际运行页面；提交精确SHA与证据后按用户部署单元规则交owner。
