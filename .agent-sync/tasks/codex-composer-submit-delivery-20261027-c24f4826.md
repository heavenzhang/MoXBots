<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/composer-submit-delivery-20261027 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MOXBOT-COMPOSER-20261027 提交即释放草稿

## Objective

修复消息已上屏但输入框仍保留已发送原文。沿现有SimpleChatInput/TabProvider发送与失败恢复路径；不改变后端接纳、模型、权限、业务或持久化authority。既有权威仓库 https://github.com/heavenzhang/MoXBots.git 已从原用户明确URL回复核实，当前remote/push一致。

## Acceptance criteria

- [x] 提交立即清空正文、附件与查询上下文，不等待HTTP回执。
- [x] 快速重复Enter不重复提交；下一稿、主动删空、附件和中文IME保持。
- [x] 拒绝/异常恢复未变更的完整原稿；跨会话迟到结果不污染当前稿。
- [x] 236项DOM、全量TypeScript、ESLint、test classification与6组Chromium/WebKit实际渲染交互通过。
- [ ] 原唯一owner独立审阅、共享CI、正常main集成及远端包含核验。
- [ ] 新正式制品、维护窗口安装与真实路径验收。

## Completed

SimpleChatInput提交时释放本稿；input编辑代次和会话scope限制失败恢复，成功不改新稿；保持原发送防重。更新Chat/TabProvider注释，附精确源码摘要、测试与浏览器复现证据。

## Verification

见`dev-docs/composer-submit-20261027/acceptance.md`与`evidence/browser-results.json`。原实现三项复现红；本修复6文件236项回归绿；作者完成源diff、实际页面与截图检查。0子Agent、无独立reviewer，后续owner独审单列。

初次在已编辑源树运行start/task-init被正确拒绝；完整保留原提交，在本交付树从相同base先通过start/task-init，再cherry-pick自有实现；4项源码/测试逐文件SHA256与已验收实现一致。没有清理/reset/覆盖其他修改。没有触发PR/shared CI、正式构建或日常App操作。

## Blockers and unknowns

影响单元desktop/macOS-arm64/updater；combinedCI/main及发布唯一owner仍为`01a12bc2-907a-7702-b6dd-788225c5dfe4`。当前源已完成，正式候选/版本/tag/制品摘要由该owner分配。无cloud/Host/mobile请求，无接口/配置/数据迁移。安装记录0.5.24/build524.1不包含本次未合入源码；本地合成浏览器不是原生真实Provider验收。

## Next step

原owner核对远端本分支精确HEAD与本记录，独立审阅，选择下一未冻结批次统一CI/main/版本/打包；维护窗口备份回滚后复验真实发送即清空、一次提交、失败可恢复。按用户现行“其他会话向对应单元负责会话提交CI或发布请求”规则发送精确SHA，本任务不另起发布或重复共享CI。后续证据另记，不能把队列登记/消息投递等同于接收、主干或发布成功。
