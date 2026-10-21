<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remove-restore-pill-20261020 -->
<!-- git-project-sync-task:base=cd4d8fb6b5ab379abcf454e5f58eeab89b00aa03 -->
<!-- git-project-sync-task:status=handoff -->

# Task: 移除旧标签页恢复入口并保全更新草稿

## Objective

删除标题栏旧恢复 pill、计数与 dismiss/restore 接线；普通启动和异常退出均 fresh Launcher，仅合法更新草稿 handoff 可恢复对应编辑页/原 Session。保护隐藏未挂载 composer 草稿和持久任务目标，不自动发送、重放任务或新建执行器。

## Acceptance criteria

- 标题栏无旧恢复入口，更新入口和 native drag region 保留。
- 旧 localStorage/durable snapshot/quit marker 不再裁决启动导航，历史 Session 仍可从原入口打开。
- 原 checkpoint owner 保留 handoff 到 exact scope 消费；仅有草稿的页面进入恢复投影，未挂载草稿阻挡自动 eviction。
- 本地必要回归、TypeScript 与 scoped lint 真实记录；源码交付不等于 main/CI/安装/发布。

## Completed

- App 删除旧候选与恢复提示，复用原 Tab/Session/Record 恢复合同处理更新 handoff。
- CustomTitleBar 删除旧 UI/props，保留更新和窗口控制。
- checkpoint 读取仅投影有草稿 Tab；未消费 handoff 草稿同 live composer 一样阻止自动缓存回收。
- 补充 fresh Launcher、clean marker 无关、读取失败、草稿范围与 deferred composer 回归。
- 验收与边界见 `dev-docs/remove-restore-pill/acceptance.md`。

## Verification

- Node 固定为 `/opt/homebrew/Cellar/node@24/24.21.0/bin/node`、`v24.21.0`；每个测试 Bash 显式 cd，清 NODE_OPTIONS 并固定 PATH，Vitest 3.2.4。
- App helper DOM 91/91；其余标题栏/composer/task editor DOM 43/43；最终 checkpoint unit 28/28，均通过。
- 上轮 tabPersistence unit 37/37 通过，后续只改注释和 suite 标题，不重复大套件。
- `tsc --noEmit`、9 变更 TS/TSX 文件 ESLint `--max-warnings=0`、`git diff --check` 通过。
- project-sync observe PASS，fetch/push URL 均为用户指定仓库。远端 main 只读锚点 `a746a900122ff6662a214d16c44e15361ac47831`，原任务 base 落后 149 commits；本轮不集成 main。
- 旧未固定解释器的 DOM 失败证据保留，未放宽断言或升级依赖；详见验收文档。

## Blockers and unknowns

- 本轮只交原分支，不运行共享 CI、正式构建、GUI、安装或发布，不改 515.8/冻结 516.2。
- 无独立 reviewer 完成回执；三个此前后台审查停止，本轮未新建子 Agent。
- 最新 main 兼容性、同 Session/不同 Tab ID 并发、异步 boot 满载以及验证失败后的即时 exact-Tab retry 体验未完成组合验证。保留磁盘 handoff 不等于这些路径已验收。
- 不改 Provider/网络/应用配置、ledger、薪资共享资源或持久任务数据；不重启客户端。

## Next step

指定集成/发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 从已推送任务分支精确 commit 审阅，按当前 main 合同处理组合与并发恢复边界，再由原 owner 执行共享 CI/版本/原生发行。本线程不直接 main、不强推、不重写已发布历史。精确最终 commit、远端一致性与本地测试运行时记录在交付工作区 `work/salary-recovery-20261020/a0-source-final-handoff.json`，不把自引用 commit SHA 写入本文件。
