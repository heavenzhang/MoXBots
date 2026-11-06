<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=e522e198-84f6-4789-8139-1db6c63709cb -->
<!-- git-project-sync-task:branch=codex/bot-collaboration-main-ready-20261107 -->
<!-- git-project-sync-task:base=a650939d2c38b8dc04750e282b159ddaac8ea346 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:source-digest=d78e56299b2ebacde998fac3cede1ffda4ac2195a2478253898204d0cbb54890 -->

# Task: BC-02 integrate simple Bot collaboration on current main

## Objective

将负责Bot持久协作入口、项目本地交接及前两批SimpleUX完整纳入最新main候选，保留主干修复，交原唯一owner统一CI/main/发布。

## Acceptance criteria

- 当前main a650939d、8240ddbc、1471ec01f、aef6d722a全部为候选祖先，计划冲突双方内容保留。
- 默认聊天简洁，负责对话可重开，成员按需打开真实工作区原对话；任务/成果明确当前会话，成果仅一个入口但保留搜索/来源/分页/重试。
- 组合类型/lint/测试/构建和独立复核通过，源码、main、共享CI、签名制品和真实模型路径分别留证。
- 不触发共享CI或正式包、不占543.5候选；原owner01a12bc2统一选择下一未冻结批。

## Completed

- 普通合并全部指定祖先，保留主干与源分支完整历史；只解决计划文档冲突。
- 协作成果复用SessionFilesPanel，消除重复入口；保持原阅读锚点、分页和文件安全服务。
- 组合337项/20文件、独立70项/6文件（重叠）与类型/lint/Web/server构建/8主题通过。
- 实际IAB组件合成数据下搜索、精确来源、末尾焦点和390px深色布局通过。证据dev-docs/bot-collaboration-entry-20261107/integration.md。

## Verification

- Source digest: `d78e56299b2ebacde998fac3cede1ffda4ac2195a2478253898204d0cbb54890`; 337 combined focused tests and 70 overlapping independent tests PASS; type/lint/Web/server/theme8/dependency0errors/docs/classification PASS; actual IAB synthetic component search/source/focus and390px PASS; original owner main/CI/native pending.

- 337 focused tests /20 files PASS; independent70/6 PASS with overlap; type/lint/Web/server/theme8/dependency0errors PASS. Source-only and synthetic UI evidence; no native or real-model acceptance claimed.

## Blockers and unknowns

- 远端main/共享CI/正式发布由原owner协调，尚未证实包含候选。真实账号模型及安装版按同一签名制品另验。

## Deployment request

- Required: desktop/macOS-arm64/updater/sharedCI/main, sole owner01a12bc2-907a-7702-b6dd-788225c5dfe4。
- No other deployment units, migration or version allocation. Next unfrozen batch only; preserve543.5 current owner task.
- Evidence: dev-docs/bot-collaboration-entry-20261107/integration-checks.json; original source aef6d722a and dependency1471/8240 included.
- Status: ready for original owner intake; code/main/CI/artifact/native acceptance separate.

## Next step

推送精确候选并向原owner交接，待其复核/CI/main；核验远端main包含完整成果后跟进同一制品真实协作路径。
