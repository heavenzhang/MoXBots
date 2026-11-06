<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=43084a79-2a7a-4c36-abff-113e6b327e0c -->
<!-- git-project-sync-task:branch=codex/bot-collaboration-entry-20261107 -->
<!-- git-project-sync-task:base=bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:source-digest=08b0ea524ca2a8be5bf7094bf8b807bae422e6fda5e28cf3ca71a58f0291c588 -->

# Task: BC-02 Persistent lead-Bot collaboration conversations

## Objective

持久协作入口：以负责Bot真实Session为组标识，创建时选项目/负责Bot/成员，侧栏重开原对话，成员/任务/成果按需展开；推动前批和本批原owner统一main交付。依赖已推送1471ec01f，不因待合入改写该提交。

## Acceptance criteria

- 创建、关闭、重开与冷读保持同一负责Session和固定成员；同项目不同协作不混合。
- 既有SessionStore出生owner绑定最终ID，重复prepare幂等；fork/成员会话不能冒充负责会话。
- 本地交接保留组、只允许冻结和当前有效项目成员；无新Store/执行owner/通信模式。
- 默认聊天简洁，详情中成员可打开真实对话；任务/成果明确当前会话范围，不把子agent、回报或链接误作全组验收。
- 源码/隔离测试/实际组件UI/独立审阅/main/发行分别留证，真实用户路径未证明不宣布目标完成。

## Completed

- 核实main bfbc92f起点、现main a650939d及依赖1471ec01f；完成持久组出生、成员/上下文隔离、创建入口、侧栏和按需详情。131项定向回归、独立87项及真实组件浏览器明暗/390px/焦点/导航验证通过；证据dev-docs/bot-collaboration-entry-20261107/。

## Verification

- Source digest: `08b0ea524ca2a8be5bf7094bf8b807bae422e6fda5e28cf3ca71a58f0291c588`; 131 focused tests and 87 overlapping independent tests PASS; type/lint/server and web builds/theme8/classification/deps/docs PASS; actual IAB components with synthetic data PASS; native/main/sharedCI pending original owner.

- Local: 131 tests / 13 files PASS; independent87/9 PASS (overlapping). Type/lint/server build/classification/dependencies/docs PASS; browser production components with synthetic data PASS. Web build final state in checks.json. No native/real-model acceptance claimed.

## Blockers and unknowns

- 主干/共享CI/桌面发布由原owner处理；源分支尚未合入。GUI真实账号与原生发行需对应验收。

## Deployment request

- Required: desktop/macOS-arm64/updater/sharedCI/main, sole owner01a12bc2-907a-7702-b6dd-788225c5dfe4。
- No cloud/mobile/website deployment. No new store; optional snapshot extension stays compatible.
- Status: ready for original owner review and next unfrozen batch; exactsource/main/CI/artifact/native acceptance tracked separately.

## Next step

保存并推送精确源码，交原owner将本批及前批1471ec01f/8240ddbc统一集成；核验远端main和下一签名制品的真实模型协作路径。
