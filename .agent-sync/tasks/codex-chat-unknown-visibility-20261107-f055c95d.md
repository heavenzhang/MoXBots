<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-unknown-visibility-20261107 -->
<!-- git-project-sync-task:base=bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: CHAT08 real unresolved operation visibility

## Objective

CHAT08-UNKNOWN：真实受控停止后存在未决操作，但无任务计划时原生结果不明提示缺失。沿现有恢复检查与产品transcript投影补齐最近已结算轮的提示，不改变账本、审批、Stop或执行权。先完成此真实验收门禁，再交付已推送的CHAT09阅读保护1921分支。

## To Do List

- [x] U01 原生失败证据：543.1受控Bash已开始；普通Stop一次；journal仍reserved，无nativeError proof；UI仅执行失败。私有证据work/native-confirmation-chat08-20261106/owner/UNKNOWN-NATIVE-GAP.json。
- [x] U02 源码：仅精确原生tool ID与最近终态轮匹配的未决调用提示；历史/运行中/已完成/已证明结果排除；不新增执行或持久化owner。
- [x] U03 RED→GREEN与相关回归、类型/lint、可见性与恢复隔离检查。
- [ ] U04 提交推送及唯一桌面owner独立审阅/main/下一未冻结批；保留543.3已冻结候选。
- [ ] U05 同一真实样本重开复验、Codex待审批路径及后续阅读保护安装验收。

## Acceptance criteria

停止状态仍保留；当前轮未决操作在过程之外明确可见、可定位原调用，重开后仍在；已知失败不被伪造为unknown；已证明完成、历史匿名记录、其他轮与运行中调用不被误提示；无重放/清账/自动继续。代码、模拟、main、签名安装及真实验收分开。

## Ownership and dependencies

源码本会话直接负责；desktop/macOS-arm64/updater/sharedCI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4。依赖原owner保护真实QA和统一候选，开发不运行共享CI/正式构建/安装。无网站/云/mobile变更。

## Verification

158项unit/DOM、15项模拟集成、完整TypeScript、定向lint、分类与diff通过；真实组件WebKit桌面/窄屏通过（合成快照，非安装版）。详见dev-docs/chat-unknown-visibility-20261107/acceptance.md。主干基线bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2；阅读保护保持独立已推送分支，不在本分支重复引入。

## Next step

提交推送并交原owner审阅，下一未冻结批先用保留的真实QA验收未确认结果提示，再验阅读保护；不能以当前本地通过宣布真实验收完成。
