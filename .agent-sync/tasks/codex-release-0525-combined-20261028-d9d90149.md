<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0525-combined-20261028 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-0525 unified current desktop improvements

## Objective

主人要求等当前开发会话收尾后统一打包。Root 01a12bc2-907a-7702-b6dd-788225c5dfe4 沿用 desktop/macOS-arm64/updater 及 combined CI/main 唯一归属；本批计划0.5.25/525.1，保留已交付0.5.23/0.5.24及tag/制品不可变。

接收五项精确远端源码：输入立即清空fdade88b7、紧凑状态栏580e39360、输入字号71f1f3c7、错误续跑07fef8d2、多Agent状态/交互3a62a12d（产品3ef4cf8b）。完整SHA、既有验证及Root源码审查在WPS工作区work/release-next-20261028/owner/BATCH.json。无Host/backend/mobile/Windows/网站部署或未提交源码集成。

## Acceptance criteria

- [ ] 五项改进同树保留：提交释放草稿、14px/26px输入、32px无边框单disclosure、失败/未知显式可见及安全续接，不丢新稿/历史或错误重放。
- [ ] 受影响组合测试、实际组件交互与精确共享CI通过，正常PR/main推送并核远端包含。
- [ ] 唯一冻结源码/正常优先级正式构建/签名公证/验签制品，有限真实客户端与正式更新通道使用同份摘要。
- [ ] 正常维护/一致备份/回滚可用，未知业务ledger和blocked memory100不重放，交付后还原自有临时设置。

## Completed

- [x] fresh remote main caab6ab6、五个源分支完整SHA和干净工作树；源码及作者既有证据由Root审阅。
- [x] 单一隔离工作树/分支，从精确main通过Git同步start/task-init门禁。
- [ ] 融合状态栏布局与multi-Agent计数/语义，组合验证。

## Verification

当前仅源审与输入身份通过，无新正式build/CI/App维护。小范围作者DOM/浏览器和Root源审不替代本批组合结果或生产验收。每步原始日志/owned control在WPS work/release-next-20261028/owner。

## Blockers and unknowns

独立MOXBOTS-MODEL-RECOVERY-001真实故障矩阵仍待原两项GUI窗口/临时QA路由确认，不以沉默批准、不重复提问；不宣称该矩阵已通过。冻结前核本批相关风险，不扩为重复全部历史验收。现有业务现场不操作，安装前fresh核活动owner和维护窗口。新source/main/制品/本地/线上分别追踪。

## Next step

依BATCH精确SHA融合五项源码，逐项保留双方冲突语义，运行组合受影响验证；通过后固定唯一候选，按原publisher串行完成共享CI/main及同份制品发布安装。
