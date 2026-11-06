<!-- git-project-sync-task:source-digest=e81f319dd89458aaa92f36be341e379c49bd904d504c1dcc3390ea9bd9ebeebe -->
<!-- git-project-sync-task:id=3bb2b55f-d155-40af-b279-4ebea97758b3 -->
<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/form-scrollbars-integration-20261106 -->
<!-- git-project-sync-task:base=13fb88204108a3b1ad9dc1b9a72cea6e673e94f4 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: 稳定模板保存断言并集成表单滚动修复

## Objective

MB-FORM-SCROLLBARS-20261106：集成已审producerbacd的输入框/项目表单滚动修复，并诊断原PR253旧NewAgentPanel保存测试异步查询失败。Root负责sharedCI/main与下一未冻结桌面候选；当前5424制品保持不可变。

## Acceptance criteria

- [x] 精确复现/定向回归保持trimmed保存与详情页断言，不改生产逻辑、不抬timeout/skip。
- [ ] 相称检查、exactsourceCI、freshmain/受测树/正常merge和remote核验。
- [ ] 下一未冻结安装版项目/设置/聊天验收，当前5424不混入。

## Completed

- 原producerbacd已独立源审；Root新branch从actualmain13fb task-init clean PASS后FF接收producer，原author工作区未改。

## Verification

- 原PR253 JS：666unitfiles PASS；DOM331files/3027cases PASS，NewAgentPanel1case失效DOM断言失败；原日志与SHA在privateowner。Root受控RED稳定复现旧textarea节点在save后移除；修正仅测试结清时序，26DOM/完整type/scopedlint/diff PASS，新headCI/main仍pending。

## Blockers and unknowns

- 原PR253 actualARM仍运行；不取消/重跑，完整终态后才选择下一候选CI。日常原生窗口由jitterowner只读排查，Root不安装/发消息。初始在producerHEAD调用旧task-init因非mainbase被拒；保留失败，无reset；新branch在实际main初始化PASS后FF生产源码。

## Next step

- 保存Root可接续分支；原PR253所有job终态后，只正常FF更新PR253旧head分支到同一新SHA，收新精确自动CI/main；不混当前5424。
