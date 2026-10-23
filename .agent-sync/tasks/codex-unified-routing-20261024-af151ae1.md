<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/unified-routing-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-UNIFIED-ROUTING-20261024

## Objective

用户要求删除与自动选模冲突的独立备用模型机制。设置页只维护自动选模型、候选池与档内顺序；自动会话的可恢复故障仅采用原池的兼容同档候选。用户随后要求开两个线程，全面讨论多模型组合及基于意图的自动执行；本分支是局部清理，不代表整体机制已完整。

## Acceptance criteria

- [x] 删除指定备用/off/跨档设置、配置类型和运行时覆盖；旧磁盘字段不生效、不修改用户现场。
- [x] 同档候选受候选池、API执行/凭据/history-family约束；跳过订阅候选并继续寻找下一API候选。
- [x] 保留真实请求能力、Query/root、防重放、Stop、后台归属与持久恢复门禁；手动固定会话不新增自动接管。
- [x] 局部源代码、确定性单元/集成/DOM、真实组件合成浏览器UI、类型/lint/依赖分类及服务端bundle验证。
- [x] 非实现者后端审阅：发现订阅候选资格P2，已修复并复核无新P1/P2；主Agent审阅子Agent UI并实测。
- [x] 整体机制两线程讨论与主会话交叉核查/综合结论，见 `dev-docs/intent-execution-review-20261024/synthesis.md`；仅评审未扩大实现。
- [x] 远端任务分支固定SHA核验，handoff门禁通过。
- [ ] 唯一owner协调共享CI/main交付。
- [ ] 新客户端正式发布及真实Provider/原会话验收。

## Completed

已实现独立备用机制删除、统一同档候选、设置入口清理、旧配置失效、API资格筛选与运行诊断更新；本地验证和独立审查完成。源码/证据已提交到本任务分支，远端同步状态以handoff门禁为准。

## Verification

详见 `dev-docs/unified-routing-20261024/acceptance.md`。243项受影响测试覆盖14文件；最终失败的旧文案断言已更新并在17项DOM复核通过。tsc、相关ESLint、server bundle、测试分类通过；dependency-cruiser为0 errors/18既有orphan warnings，不宣称无警告。真实SettingsPage合成浏览器：1440/768/390宽度、旧配置无入口、开关持久化、失败保存反馈，无pageerror。

## Deployment request

单元 desktop/builtin/macOS/updater/combined CI/main，唯一owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`，沿既有项目指定。本开发会话只提交源码与本地验证；不独立触发PR/shared CI、正式构建、安装、服务重启或发布。保持现已发布519.2及已冻结520候选不可变；本次源进入后续未冻结批次，版本由owner分配。旧等待checkpoint在新策略identity下会沿原门禁暂停而非自动重放，应在发布说明告知并验证。运行版本、精确制品摘要与真实用户路径待owner发布后记录。

## Broader discussion

用户明确要求的两个讨论线程：架构方案 `01a169c4-5bcc-71b1-8bf3-606283281789`；实现审计 `01a169c4-6244-7143-8d84-a4a59d546aef`。仅分析并各写独占报告，不改此源码树；主会话读取综合，避免用本局部补丁宣称完整意图驱动执行。

## Blockers and unknowns

共享CI/main/正式发布由既有唯一owner组织，当前尚未发起；真实Provider/原会话/原生客户端验收未发生。用户新增整体机制评审已在两个指定线程完成，整体方案已形成建议，新增机制未实施；不是局部实现失败。

## Next step

原唯一owner接收固定任务分支，核对本清理进入下一未冻结批的共享CI/main/发布；整体机制评审应拆为后续有明确验收的任务，不把建议静默混入本清理。已发布/原生/真实Provider均未验证，不重放原业务动作。

Host共用部分server源码，但本次没有启动Host发布。是否进入独立Host候选须由对应单元owner按实际候选评估；不改变云API或既有凭据/会话协议。
