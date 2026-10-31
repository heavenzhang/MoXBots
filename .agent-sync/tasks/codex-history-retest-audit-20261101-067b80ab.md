<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/history-retest-audit-20261101 -->
<!-- git-project-sync-task:base=3b62a664ff1d33282592dddf6da2a38045264787 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-HISTORY-RETEST-20261101-AUDIT settle visible rejected input

## Objective

当普通输入已写入聊天历史但在SDK派发前被拒绝，原Product turn耐久结算为stopped，不能永久running。只结算本queue自己展示且仍持有的live root；不改原会话历史数据或业务操作。

## Acceptance criteria

- [x] 原队列/真实Product writer复现：零SDK输入、observer已stopped、磁盘仍running。
- [x] 通过transcript owner捕获具体live turn，在取消回执前持久结算；原活动轮/后来接管轮保持running。
- [x] 300项最终回归、全量TypeScript、定向ESLint、测试分类、差异检查通过。
- [ ] 交既有desktop/sharedCI/main owner，精确候选CI及远端main包含。
- [ ] 新制品/安装与三个原会话真实业务验收，当前仍0/3。

## Completed

实现和证据范围见dev-docs/history-retest-20261101/acceptance.md。已同步最新main3b62a664，其tree与原8364候选一致；原候选完整CI41230825137成功，0.5.29/529.1已由既有owner进入正式构建，本增量不改变该已冻结候选。三个原任务的业务源码仍未交付。

## Verification

使用应用内Node24.20.0；vitest integration builtin(210)+session-execution(78)+unit runtime-boundary(12)最终300/300通过，76.09秒；tsc --noEmit通过；四源/测试文件ESLint通过；check-test-classification 473 tests检查通过；git diff --check通过。新增3案例实际读回隔离磁盘，SDK是合成实现，不是实际Provider或原用户业务验收。RED为旧8364同一队列/writer的running/stopped断言失败；早期fixture访问错误已修正，未据此改变产品行为。

## Blockers and unknowns

实际安装仍528.1。INTENT_UNCONFIRMED根因仍待新版具体诊断，不把新增枚举当已修复。已遗留的历史running与独立启动watchdog不在本补丁自动修复范围。旧报告的“旧解析器”解释已在本地报告更正。部署单元desktop/macOS-arm64/updater和sharedCI/main，唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4；没有新增子Agent或发布owner。

## Next step

唯一发布owner审查本增量，仅选入后续未冻结批次并重新运行精确源码CI；不覆盖529.1制品/tag。安装核实后，由MB-HISTORY-RETEST-20261031按保留的三个原Session继续，并独立核对实际工具、提交与业务结果。原候选已通过CI不自动证明本增量通过共享CI。
