<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/convergence-scope-20261019 -->
<!-- git-project-sync-task:base=eb75e143046bd2704de3a0b5fddcc105ea9386b5 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-CONVERGENCE-SCOPE-20261019 收敛检查的只读意图范围修复

## Objective

修复 `progress-convergence` 中"不要修改/不得修改/do not modify"不限定对象导致整轮只读的缺陷。允许实现代码、同时保护生产数据/凭据/账号/配置/其他文件或模块的授权任务必须继续接受收敛检查；真正只读研究、"不要修改代码"、"只给方案"保持豁免。不改 409/408 机制、不改薪资源码、不改 `agent-session.ts`。

## Acceptance criteria

- [x] 已核实基线 `556b1633d` 在远端 main，且当前 main 已前进到 `eb75e1430`（goal/bridge 修复）。
- [x] 中文/英文"允许实现 + 局部禁止"不再被标记整轮只读。
- [x] 整轮只读（不修改代码、只读分析、仅给方案、任何文件禁令）保持豁免。
- [x] 引号/行内代码/围栏代码中的否定句不作为任务类型。
- [x] 助手阶段表态不能突破用户只读范围。
- [x] 原 13 项单测保留，新增回归覆盖缺陷复现与反例；复核补充后 48/48 通过。
- [x] `tsc --noEmit`、改动文件 ESLint 通过；`builtin-session` 9 个文件 188/188 通过。
- [x] 仅改 `progress-convergence.ts` 与其单测，未触碰并发任务文件。

## Independent review follow-up

首轮合入后复核确认 6 项边界问题，并已追加修复：

1. `read-only replicas/flag`、`只读副本`、`该目录只读`、`改成只读` 被误当任务类型。
2. 带限定语的泛化对象（`any files in production/`、`the code path that writes to production`、`代码里的生产环境配置`）被误判整轮只读。
3. 引号对象被删空，`do not modify "production data"` 退化为整轮只读。
4. `改成只读` 未在属性转换列表。
5. 具名禁令（`不得修改接口`、`Do not modify the codebase`、`不要修改业务逻辑`、`不要修改它`）回归为可提示。
6. 模块例外用例未真正走到裸 `不修改` 解析。

复核另确认无 `/g` 正则状态污染、无灾难性回溯、无偏移计算错误；`agent-session.ts`、409/408 未触碰。

## Scope / non-goals

- In scope: `src/server/builtin-session/progress-convergence.ts`, `src/server/builtin-session/progress-convergence.unit.test.ts`.
- Out of scope: 409/408 收敛机制、薪资源码、Provider/模型/超时/账号配置、`.moxbot` 持久状态、客户端安装/重启、正式构建。

## Evidence

- 验收记录：`dev-docs/convergence-scope/acceptance.md`。
- 脱敏结果：观察目录 `convergence-scope-fix-result.txt`（分支/SHA/测试/远端核实）。
- 遗留：未做真实模型联调、未安装验收、未构建；不得把单测通过表述为真实模型效果已确认。
