<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-build5-main-20261029 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->
# MB-MOBILE-BUILD5-MAIN-20261029

## Objective

Root01a12bc2-907a-7702-b6dd-788225c5dfe4按既有shared CI/main唯一归属，将原mobile owner01a12b99-7b38-78b1-831f-9c60257d386a的snapshot读取修复与build5版本分配一次提交主干。手机实际build/sign/iPhone安装/TestFlight仍归原mobile owner；本任务不构建或发布手机/桌面、不操作日常Mac或101。

源producer40a30926d237ea0eb84261a5f6d6d59ef9097e66=maincaab+原5c3d修复同字节cherry-pick d10883a2+0.1.0/build5及任务文档。原build4不可变。当前独立桌面0.5.25/525.1源45a9不改，不混入手机产物；两单元生产制品分别绑定自己的源码和摘要。

## Acceptance criteria

- [ ] 原snapshot tracker/owner/错误重试三源测试同5c3d精确字节，buildNumber5包含，不先合4再增一轮CI。
- [ ] 修正交接任务标准章节，精确source/Root candidate只差记录，Git gate和远端分支可核。
- [ ] 相称精确共享CI、正常PR/main与远端SHA/tree核验完成。
- [ ] 向原mobile owner留可读取主干回执；iPhone/native附件与真实安装仍由其原任务分别验收，不虚报完成。

## Completed

- [x] 直接读取mobile聊天最新人类要求继续开发可用并安装iPhone；确认sharedCI/main与mobile部署归属。
- [x] 原5c3d已由Root正常push，当前maincaab冲突检测通过。原handoff仅缺标准任务章节，未冒称PASS。
- [x] 读取40a固定提交、三份源码/测试逐字节等同5c3d、app.json仅4到5；原工作区只有作者archive derived未跟踪输出，保留不动。
- [x] 新隔离分支从实际main通过start/task-init。
- [ ] 相称CI/main及远端包含；未启动手机构建、安装或生产发布。

## Verification

复用原独审output/testflight-20261022/reviewer-mobile-snapshot-5c3d-final-source-local-evidence-review-20261026.json：84policy含6focused、typecheck和3个390x844实际React合成场景。旧lint/type compound退出不能冒称独立lint退出；mobile owner另报告40a上的policy/type/lint各独立exit0。Root不重复手机构建，后续共享CI以精确Root candidate为准。真实Provider/iPhone登录/附件Read与download/preview未由这些模拟证据关闭。

## Blockers and unknowns

当前desktop PR208 CI的hostedmacos15容量两次无法分配；其同head经过诊断cooldown的mac-only attempt3由Root单独接续。mobile独立准备/CI可继续，不需把手机工作全部暂停。main变更串行并核独立单元范围，不覆盖桌面冻结源或tag。发布与账号/原设备事实仅由原owner实测关闭。

## Next step

合入精确40a producer，补齐源任务章节并核mobile product树未变；正常push/创建唯一mobile PR和CI，收结果，按最新main兼容合并并核远端。将最终main/source/tree/CI写入私有发布队列，不发未获授权跨聊天回复。
