<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0525-combined-20261028 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-0525 unified current desktop improvements

## Objective

主人要求等当前开发会话收尾后统一打包。Root 01a12bc2-907a-7702-b6dd-788225c5dfe4 沿用 desktop/macOS-arm64/updater 及 combined CI/main 唯一归属；本批新修订0.5.25/525.2（旧525.1/source45a已封存未构建），保留已交付0.5.23/0.5.24及tag/制品不可变。

接收五项精确远端源码：输入立即清空fdade88b7、紧凑状态栏580e39360、输入字号71f1f3c7、错误续跑07fef8d2、多Agent状态/交互3a62a12d（产品3ef4cf8b）。完整SHA、既有验证及Root源码审查在WPS工作区work/release-next-20261028/owner/BATCH.json。原五项desktop源外，最新明确授权追加101迁移的desktop endpointf142与cloud39ee源码；Root不部署云/网站/手机，既有各单元owner不变，未提交源码不混入。

## Acceptance criteria

- [x] 五项改进同树保留：提交释放草稿、14px/26px输入、32px无边框单disclosure、失败/未知显式可见及安全续接，不丢新稿/历史或错误重放。
- [ ] 受影响组合测试、实际组件交互与精确共享CI通过，正常PR/main推送并核远端包含。
- [ ] 唯一冻结源码/正常优先级正式构建/签名公证/验签制品，有限真实客户端与正式更新通道使用同份摘要。
- [ ] 正常维护/一致备份/回滚可用，未知业务ledger和blocked memory100不重放，交付后还原自有临时设置。

## Completed

- [x] fresh remote main caab6ab6、五个源分支完整SHA和干净工作树；源码及作者既有证据由Root审阅。
- [x] 单一隔离工作树/分支，从精确main通过Git同步start/task-init门禁。
- [x] 融合状态栏布局与multi-Agent计数/语义；718项/26文件、tsc/scopedlint/classification及Root CUA1280/390实际组件检查通过。

## Verification

Root组合源码与有限实际组件验证通过；718项26files、全量类型、全部本批TS/TSX局部lint及测试分类通过。原45a精确CI因macOS hosted容量零step取消四次，不能merge通过；未启动正式build/App维护。新head将单独一次CI。小范围作者DOM/浏览器和Root源审不替代本批组合结果或生产验收。每步原始日志/owned control在WPS work/release-next-20261028/owner。

## Blockers and unknowns

独立MOXBOTS-MODEL-RECOVERY-001真实故障矩阵仍待原两项GUI窗口/临时QA路由确认，不以沉默批准、不重复提问；不宣称该矩阵已通过。冻结前核本批相关风险，不扩为重复全部历史验收。现有业务现场不操作，安装前fresh核活动owner和维护窗口。新source/main/制品/本地/线上分别追踪。

## Next step

保留旧45a，融合已交付main775+endpointf142+cloud39ee后验证新delta、既有独立cloudreview静态无P0/P1通过后固定525.2新SHA一次PR208精确CI。正常main/制品前核authorowned-agentnet workflow归属，Root不重复其workflow或云部署。

## Migration revision

- [x] PR209 normalmerge775da/actualtree129d与受测608d一致，producer40a为祖先，手机运行由原owner验收。
- [x] 本分支顺序normalmerge main775、endpointf142、cloud39ee，仅plan追加冲突，产品源无冲突。
- [x] 新build525.2 metadata only；原525.1sourcefreeze与所有失败CI原件保持，旧包/公钥/tag不改。
- [x] 联合新增delta：4profile/3publisher/6bootstrap/type/lint/classification/cloud fmt/adminJS/diff检查全部exit0。独立cloudreview静态无P0/P1，服务源hash逐项吻合。
- [ ] 精确新候选CI/main与签名native/new101发布待完成。

迁移职责和端点约定见dev-docs/cloud-migration-101/desktop-updater.md及dev-docs/cloud-migration-101-20261029.md；新测试identity走正常认证，旧localidentity/history/draft不清除，不宣称旧issuer兼容。
