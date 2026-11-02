<!-- git-project-sync-task:source-digest=66e500a4d868fec500b8797759b296862c360a39e67d5872493ce9c48b994c26 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=4d32f7b9-0e7a-4a27-a162-3cb9469359b7 -->
<!-- git-project-sync-task:branch=codex/recovery-phase18-20261102 -->
<!-- git-project-sync-task:base=1626ca58c6d409f7ef73a0239a8b87ed1b1c1486 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-INCIDENT-20261101 Phase18 hidden continuation and foreground completion

## Objective

继续 MB-RECOVERY-INCIDENT-20261101，修复535.1原生验收发现的隐藏续接候选丢失和前台命令完成误判。保留原会话、已完成结果及精确未知操作保护；本分支从实际主干1626ca58继续，不变更版本或部署归属。前阶段记录：codex-recovery-incident-20261101-9d059e46.md。

## Acceptance criteria

- [x] 原生现场和旧实现失败复现，两处根因分别确认。
- [x] 隐藏续接保留当前自动主模型绑定的候选，停用/手动/路由变化仍撤销。
- [x] 当前原生前台Bash实际完成回执恢复后续Read验证，后台晋升和迟到/合成回执不放行。
- [x] 九个相关文件530项回归、全量TypeScript、定向ESLint、测试分类和差异检查通过。
- [ ] 精确提交和远端分支核验。
- [ ] 唯一原owner独立审查、实际main交付、候选CI/签名公证/安装。
- [ ] 原未完成会话真实恢复及稳定性验收；完成的三个原执行不重跑。

## Completed

535.1原主供应商502后已有合法候选接续成功；自动验收发现前台命令污染验证代次，下一隐藏续接又清空候选后连续502。此分支在原admission与Query生命周期owner修复，不新增恢复owner或账本清除入口。完成标准及分层证据见 dev-docs/recovery-incident-20261101/acceptance.md Phase18。

## Verification

- Source digest: `66e500a4d868fec500b8797759b296862c360a39e67d5872493ce9c48b994c26`; 530 related cases across nine files PASS; full TypeScript, scoped ESLint, classification and diff checks PASS. Real installed SDK foreground Bash and background control both PASS with local synthetic model only, zero paid calls. Source validation does not constitute installed original-session acceptance.

旧代码两个隐藏续接用例失败，一个真实agent-session消费链前台用例失败。最终9文件530项回归、全量TypeScript、定向ESLint、测试分类和diff检查通过。已安装原生SDK隔离12秒Bash→Read及后台对照均通过，只连接本地模型，付费调用零；各3次模型调用/1次命令/1次Read；前台没有task_updated但Read得到有效验证代次，后台前台结算数为0，仅沿原状态terminal结算。原始证据相邻私有evidence，不进入Git。

## Blockers and unknowns

535.1已安装但原生稳定验收失败；536属于其他项目面板功能候选，不包含Phase18。源码/隔离验证不能替代下一安装包原会话验收。没有新的授权阻断；供应商本身仍可能502，需验证有界恢复和实际候选接管效果。

## Deployment request

- Required: desktop/macOS-arm64/updater/shared CI/main，下一未冻结批；无数据迁移。
- Handoff: 本远端分支精确SHA及此记录、Phase18验收说明与脚本；本开发线程不触发共享CI、正式构建、版本或安装。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用原指定唯一桌面发布会话。
- Status: 待源码审查交接；主干、候选制品和原生验收分别记录，不覆盖已冻结535/536。

## Next step

完成最终验证和精确提交推送后交原owner独审，随后统一下一不可变候选和原Max/薪资核对会话恢复验收。保留已完成原会话及所有未知操作记录。
