<!-- git-project-sync-task:source-digest=5454ee67448582bd057861f786ac1c015c3892ac76e8783d14304f51b290c904 -->
<!-- git-project-sync-task:id=c74b740f-2c5d-4624-a74a-74c70e02663c -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/website-0544-download-20261107 -->
<!-- git-project-sync-task:base=f676255050e8210c9f913afae86ecf70dd986a72 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: WEB-DOWNLOAD-0544-5441 官网下载更新

## Objective

把现有101官网的 macOS Apple 芯片下载入口更新为0.5.44/build544.1，只复用原正式自动更新通道已验证的同一TAR.GZ。保留历史版本、静态设计、Windows准备状态及旧版回滚；不碰日常客户端、云/Host/Nginx/TLS。

## Acceptance criteria

- [x] 核对原owner完整正常TLS GET、size/SHA、生产更新签名和不可变tag。
- [x] 新manifest与仓库trial-release字节一致，下载页和发行说明指向0.5.44；23项确定性测试通过。
- [x] 重读线上0542指针/HTML及40文件库存，受保护Nginx与stable manifest快照。
- [x] 三把维护锁下备份、所有权/CAS切换且仅新增manifest/notes和改HTML；失败仅在持有新指针时回滚。
- [x] 公网正常TLS精确读回、16路由回归；旧资产可访问。真实页面布局因本轮内置浏览器不可用，未验。
- [ ] 只提交本任务源码；由共享CI/main owner审查合入并核远端主干。

## Completed

源码使用独立worktree从main `f676255050e8210c9f913afae86ecf70dd986a72`起步。原正式制品与签名证据在项目私有 `work/release-queue/WEB-DOWNLOAD-0544-5441.json` 指向的位置。新静态JSON为 `releases.e9987d2b76e0.json`。生产当前指针 `/srv/moxbots-cloud101/releases/20261106-web0542-8d74e35844eb/website`，HTML SHA-256 `7a156c4bd26fafd681bdd0a7386b2e0cf3056804e15857b1aecd5b983a95bdf4`，40文件库存/完整备份保存在私有 `output/website-download-0544-20261107/`。

## Verification

- Source digest: `5454ee67448582bd057861f786ac1c015c3892ac76e8783d14304f51b290c904`; node --test services/website/download.test.mjs: 23/23 PASS; git diff --check: PASS; production exact TLS readback and 16 routes: PASS; browser visual unavailable

- Source digest: `83d776f30ddf69c513c1d3a647f2e2d007eb81d9ee4e2bafef35a12553e07d50`; node --test services/website/download.test.mjs: 23/23 PASS; git diff --check: PASS; producer normal-TLS full GET and updater signature PASS

`node --test services/website/download.test.mjs`: 23/23 PASS。原Owner完整GET和签名回执PASS；本任务没有重复下载整包。线上发布、真实浏览器、CI/main分别待验，不以静态200当作完成。

## Blockers and unknowns

已确认三把锁空闲并按原锁发布，发布者操作结束并释放。真实浏览器本轮IAB不可用；若后续授权专用浏览器，可补视觉与窄屏检查。Host、模型、手机业务不在本官网单元验收范围内。

## Next step

交shared CI/main owner审查当前源码分支、创建PR并遵守检查合入；官网当前生产回执保留。
