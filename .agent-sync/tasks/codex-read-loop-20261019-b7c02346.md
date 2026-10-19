<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/read-loop-20261019 -->
<!-- git-project-sync-task:base=2ff314ed05fb21df446215829efbe5647c7eb21b -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-READ-LOOP-20261019 执行会话读循环的有界进展检查

## Objective

修复 builtin 执行会话"反复读取同一内容、反复表态开始修改、始终不产生编辑"的不收敛问题。只改客户端通用逻辑，不接管薪资业务代码；不停止/重启任何会话，不改 Provider/模型/超时/账号配置。

## Acceptance criteria

- [x] 先读观察证据，区分正常大范围阅读、环境阻塞、模型不收敛、客户端状态/上下文缺陷。
- [x] 未发现工具重放或 bridge 截断；根因判定为模型行为，自动压缩放大重复阅读。
- [x] 实现基于内容证据的低误报进展检查：阶段表态 + 同文件重叠重读 + 无编辑 + 非只读/非等待。
- [x] 不按固定超时/工具次数判定死锁；不停止、不切换模型、不重放、不写业务数据。
- [x] 新单测覆盖原问题与反例，不含薪资会话 ID 或 94 次硬编码。
- [x] 定向单测、builtin-session 单测、tsc、ESLint 通过。
- [ ] 合入 main、推送、远端包含核验（结果见观察目录 `read-loop-repair-result.txt`）。
- [ ] 真实客户端构建/安装后的模型行为验证；本任务未安装、未重启。

## Completed

- 新增 `src/server/builtin-session/progress-convergence.ts` 与 13 项单测。
- 接线 `src/server/builtin-session/turn.ts`（轮次边界、助手文本）与 `src/server/agent-session.ts`（`PostToolUse`、会话切换）。
- 验收记录：`dev-docs/read-loop/acceptance.md`。

## Verification

`progress-convergence.unit.test.ts` 13/13；`src/server/builtin-session` 153/153；`tsc --noEmit` 通过；改动文件 ESLint 通过。全量 unit 有 2 个与本改动无引用关系的文件 3 个用例失败（host notify 10s 超时、tableSource 两例），已单独复跑区分，未修改这些测试。

## Blockers and unknowns

- 真实模型在收到提示后的收敛效果未验证；需安装/构建后观察，安装重启须等待原薪资任务安全结束。
- 主 Tauri crate 本机无法编译（缺完整 Xcode），未产出候选安装包。
- `src/server/agent-session.ts` 与并发 `MOXBOTS-RUNTIME-REPAIR-20261019` 有文件交集，改动区间不重叠；交接见观察目录 `read-loop-handoff.txt`。

## Next step

按隔离提交合入实际 main（fast-forward 到远端），核实远端包含；之后由构建/安装流程在安全窗口验证真实收敛效果。

## Deployment request

仅客户端 sidecar 代码，随下一次未冻结桌面版本生效；本任务不请求安装、重启或发布，不操作日常客户端。
