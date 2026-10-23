<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/plan-lifecycle-20261023 -->
<!-- git-project-sync-task:base=d4a89cca58c2c7295560e8ced1d6f769f686bcbd -->
<!-- git-project-sync-task:status=in-progress -->

# Task: PLAN-LIFECYCLE-20261023 方案执行状态与验收闭环

## Objective

补齐现有方案卡片的确认→启动→执行→验收闭环。沿原 Session 账本、任务投影与消息中的成果入口展示；不增加执行 owner、队列或自动重播。

## Acceptance criteria

- [x] 确认后标题为执行计划，当前方案/版本的步骤显示状态、已验收数量与证据。
- [x] 支持启动待处理、执行、待验收、完成、返工、失败、中断、依赖阻塞和未知；回传不冒充验收。
- [x] 历史方案、旧版本/attempt、跨 Session 和断线不能产生虚假完成；重新打开会话从账本恢复。
- [x] 定向 unit/DOM、类型/lint、本地真实组件 UI 及独立审阅通过。
- [ ] 提交推送精确 SHA，交唯一 desktop/combined CI/main owner 集成并核验远端 main。
- [ ] 新签名包与真实用户路径由同一发布 owner 组织，未完成不声明发布。

## Completed

- [x] 从实际远端 main d4a89cca58c2c7295560e8ced1d6f769f686bcbd 创建隔离 worktree，start gate 通过，既有工作树未修改。
- [x] 核对截图对应测试账本：两个步骤 accept，卡片仅消费 planStart，缺少任务生命周期投影。
- [x] 原任务投影只读汇总、当前/历史尝试结果、当前Inspector callback、中英状态文案与恢复提示已实现。

## Verification

- `project-sync start` / `task-init`: PASS。
- pure/DOM90 + SessionStore/plan policy/routes/turn owner82 = **172 PASS**；tsc/ESLint/classification PASS；depcruise0 errors/18 unrelated orphan warnings；Vite最终web build32.20s PASS。
- 独立UI：16场景×3宽度×2主题 **96/96 PASS**。主Agent内置浏览器关键八态、证据与记录回调、断线保留3/3与恢复完成复验通过；视觉实看1280浅色/320深色。参见 `dev-docs/plan-lifecycle-20261023/acceptance.md` / `review.md` / `evidence/ui-results.json`。
- 主 Agent 负责实现/集成验收；独立 `plan_ui_review` 请求 gpt-6-luna/medium 负责只读 UI/代码复核。用量/实际费用未知。

## Blockers and unknowns

- 部署单元 desktop/macOS/updater、combined CI/main 唯一负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 不变；本会话不触发共享 CI、正式构建、安装或重启日常 App。冻结 0.5.19/build519.2 不追加本任务，下一未冻结批次由其分配版本。
- 本地合成 UI 不是 SDK/Provider、签名制品或生产路径的证明。真实验收待发布 owner 组织。

## Next step

- 提交本任务精确SHA并推远端，向既有唯一owner请求下一未冻结批的CI/main/发布；等待并核验实际main包含与新制品真实验收，禁止重复发起共享CI。
