<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/replay-recovery-20261024 -->
<!-- git-project-sync-task:base=670881d8cc1b4eed2aaa66df886cdfc83f70c14f -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-REPLAY-RECOVERY-20261024: settle native failures without poisoning action recovery

## Objective

修复正常 Bash 非零退出和原 PreToolUse 明确拒绝被永久归为 unknown、使整个 Session 只读的问题。保留中断/超时/无可信 native 配对/存储失败/旧未知动作的防重放门禁。开发会话 01a16e60-136b-71e1-9f52-1304b48bc1cb；不变更其他业务文件或既有部署归属。

## Acceptance criteria

- [x] 明确退出的 Bash 错误后可运行修正命令，原错误和 native ID 保留。
- [x] 本控制器的执行前拒绝不制造新 unknown，不核销旧 unknown。
- [x] 中断、超时、未配对、伪造/过期 owner、并发、恢复/存储失败仍 fail closed。
- [x] SessionStore 持久化和重建后规则一致；真正重复的副作用在恢复期间仍被拒绝。
- [x] 实际 SDK/native 本地合成上游实测失败→纠错→新工具执行，并覆盖拒绝不污染。
- [ ] 提交推送；由唯一 desktop owner 组织共享 CI/main、下一未冻结制品及真实安装验收。
- [ ] 目标原 Session 有私有备份、结果核对和受控恢复证据。

## Completed

- 只读核实安装 0.5.21/build521.2，远端 main 670881d8cc1b4eed2aaa66df886cdfc83f70c14f，从此隔离新分支。
- 原 Session 首因是 Playwright 浏览器文件缺失；后续拒绝被继续加入 uncertain。真实业务文件未改，旧 ledger 不删除。

## Verification

基线新增测试 3 RED/8 PASS；最终相关 33 文件 590 PASS（新增 15 项单元与 1 项真实 SessionStore 集成）。tsc、改动 ESLint、测试分类、4 项文档链接检查通过。真实 SDK/native/Shell 两种 loopback（有错误输出/空输出）均：5 推理、1 拒绝、失败命令副作用 counter=1、纠错写入与复验成功、unknown=0。合成模型、本地 journal fixture 与真实 SessionStore 集成分别记录，不代表已安装客户端/真实 Provider 验收。见 dev-docs/replay-recovery-20261024/acceptance.md。

## Blockers and unknowns

桌面 macOS/Sidecar 和 combined CI/main 唯一 owner 沿用 01a12bc2-907a-7702-b6dd-788225c5dfe4；本会话只开发/本地验证/分支推送和交接，不独立触发 PR/shared CI/签名构建/安装或重启日常 App。Host/mobile/cloud 不在本次部署范围。已发布 521.2 不改字节/版本/tag。

## Next step

唯一 desktop owner 审阅远端精确 SHA，组织共享 CI/main 和下一未冻结签名候选；同时沿原 owner 核对本地 historical-reconciliation-evidence.json（5 unknown hash / 6 native 实例）及 21 文件私有摘要备份，制定旧会话恢复，不把历史结果伪造为新 live hook receipt。本开发分支不删除旧 ledger、不重放网站任务、不触发共享 CI 或安装。
