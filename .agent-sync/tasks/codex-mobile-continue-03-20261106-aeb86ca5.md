<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-continue-03-20261106 -->
<!-- git-project-sync-task:base=05ea1e2c4d06f112585012a27503adc75c184dcc -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-MOBILE-CONTINUE-03 原任务内对话请求成果直达

## Objective

MB-MOBILE-CONTINUE-03：按 V10 缩短原任务内对话、待处理、成果路径。只改 mobile/app 展示与导航，不新增执行 owner、协议或虚构版本关系。

## Acceptance criteria

- [x] C03-1 固定对话/待处理/成果入口，去重成果入口。
- [x] C03-2 当前审批/提问直接可达；切换保留输入，只允许原 generation/turn 的请求进入待处理。
- [x] C03-3 草稿、历史阅读位置和成果返回原会话保持，未知回执禁止重复操作。
- [x] C03-4 策略、类型、lint、320/390 真实组件合成 UI 验证。
- [ ] C03-5 提交远端并交原 shared CI/main owner 集成；远端 main 回读。
- [ ] C03-6 原 mobile owner 下一未冻结候选打包及真机验收，保留 build10 原制品。

## Completed

- 核实原工作树干净；从远端 main05ea1e2c 创建本任务隔离分支。
- 核对 V10 与已实现边界；完整项目聚合和成果版本谱系不在本增量。
- 完成固定导航、请求代际过滤、输入与阅读位置保留；补修从待处理进入成果修改后回到可见输入框。
- 非实现者源码与截图复核通过，C03-R1已关闭；独立点击验收因其IAB不可用未完成。

## Verification

- project-sync observe/start/task-init PASS；125/125 policy、type/lint、320/390主审组件走查通过。独立源码/截图复核，独立点击因IAB不可用未验证。证据见 dev-docs/mobile-continue-03/acceptance.md。

## Blockers and unknowns

- 本地 UI 合成验证不能证明真实账号、Host 或物理设备体验。旧 build10 原生验收未闭环，不改其 IPA/tag。
- shared CI/main owner01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile iOS/Android owner01a12b99-7b38-78b1-831f-9c60257d386a。无 cloud/desktop/website 变更；版本由 mobile owner 分配。

## Next step

- 提交精确候选，交原sharedCI/main owner统一集成，随后由mobile owner安排下一未冻结包和原生验收。
