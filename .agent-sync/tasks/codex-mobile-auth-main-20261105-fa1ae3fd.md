<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-auth-main-20261105 -->
<!-- git-project-sync-task:base=fcf06ff24bd57f4f1211c1f82f19fb43a9e66c1d -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-MOBILE-AUTH-20261105 Root main integration

## Objective

将702a08a原手机安全续期和原mobile owner94c9050显式按钮授权修复，与最新mainfcf06ff正常集成、精确CI和远端主干交付。Root只负责sharedCI/main，cloud/mobile发布由原owner01a12b99接续。

## Acceptance criteria

- [x] INTAKE01 源审及兼容性检查，原desktop native login保留。
- [x] INTEGRATE01 基于fresh main隔离集成，plan冲突保留双方记录。
- [x] VERIFY01A 新组合及R2本地157native、双strictClippy、完整TLS/WSS旧Host续期及目标重读链。
- [ ] VERIFY01B R2精确自动CI全门通过。
- [ ] MAIN01 freshmain/祖先/受测树准入后正常合入和远端核实。
- [ ] HANDOFF01 共享原owner云先手机后发布，实际页面与真机另验。

## Completed

已核producer702a及其子commit94c9050，后者仅密码键盘done/关闭键盘，登录由明确同意按钮发起。生产源码自动合并，单一plan冲突保留双方完整记录。

## Verification

原producer本地155mobile/117policy/217service/226headless及TLS设备证明链证据已读。Root新组合155mobile native/1原ignored、117policy、typecheck及Expo全lint通过。生产代码自动合并，密码键盘授权最小修复一并纳入。首轮依赖接线错误导致policy/类型失败，原件保留；按锁文件安装本地mobile依赖后复核通过。

## Blockers and unknowns

实际页面和Kevin真机不可用，原cloud/mobile owner负责最终生产与设备验收。desktop原生登录mainpush41978809337已实际9success/iOSskip。R1手机组合CI有Headless续期失败，全部已terminal。原件保留，Root在本分支定向修复。本集成不分配desktop/phone版本，不安装或修改日常实例。

## Next step

保存已验证组合精确提交，既有PR248在R1全部terminal后仅一次FFpush R2源，等待新精确自动CI；不重复旧job。

Root R2诊断与修复/首红/负向围栏/完整绿证据见acceptance.md Root combined R2 intake。原producer及授权按钮fix Git祖先保持，后续新源按新CI结果决定准入。
