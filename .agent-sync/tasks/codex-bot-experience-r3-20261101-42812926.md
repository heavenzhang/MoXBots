<!-- git-project-sync-task:source-digest=c93437ada68fb92f83047e2260f3f974c414ee08b4a96a3035e38358b83ea38e -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=0d495c8b-a8ee-439b-993d-bd32d37deaba -->
<!-- git-project-sync-task:branch=codex/bot-experience-r3-20261101 -->
<!-- git-project-sync-task:base=ad68c28d3408b9e21705837c08acd8af383de75a -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-BOT-R3-DEV-20261101 Bot 中心对话与项目体验

## Objective

落实用户批准的 R3 原型，保留 MoXBots 风格、项目和原执行保护。独立 worktree；集成已审阅 R1 依赖 874acaad，保留 main ad68c28d 恢复修复。第一可运行页面先实现对话/项目导航和明确身份的新会话，再扩展真正的项目上下文与群组机制。

## Acceptance criteria

- [ ] 对话/项目互斥导航，真实消息摘要、未读与执行状态；沿用原App导航owner和历史管理能力。
- [ ] 统一新建明确Bot/有效项目；错误可恢复；不静默重绑原会话。
- [ ] Bot身份各入口一致；项目目标/成员/会话/任务/成果有实际来源。
- [ ] 对话内回报/验收/返工接原任务账本；真正群组成员及交接不得复用会话角色伪装。
- [ ] 单位/DOM/集成与独立UI验收，真实接口及生产边界分别记录。
- [ ] 提交推送、原owner审阅/共享CI/主干精确包含、下一未冻结批发布和真实路径验收。

## Completed

- [x] 已核实仓库、分支、main、干净新worktree与桌面部署owner。
- [x] main ad68c28d 与R1依赖874acaad本地合并为2616e107；共享计划追加冲突保留双方内容。
- [x] 独立前置审查确认 group-phase1 dirty且nativeConsultation=false，不作为完成依赖。
- [x] M1产品导航/新建实现、107项定向测试与本地renderer构建。
- [x] 独立源码/静态视觉审阅，rail P2修复；独立IAB交互受环境限制未执行。
- [ ] M2跨项目上下文与M3稳定Bot群组/交接，仍未实现。

## Verification

- Source digest: `c93437ada68fb92f83047e2260f3f974c414ee08b4a96a3035e38358b83ea38e`; integrated exact current main, final-source CI pending; native and production not run. Producer852 historical evidence: 210 targeted tests across 6 files and full unit 659 files/7453 passed/5 skipped; tsc/scoped ESLint/classification/moxbot renderer build passed before fixture-only token correction; theme architecture guard repaired without relaxing policy; independent source rereview pass; final candidate CI and native/production not run.

git-project-sync start PASS（main ad68c28d）；task-init遇代理TLS间歇故障，R1合并后HEAD已前进，显式建立任务记录；通过单命令Git代理空覆盖恢复observe PASS，不修改全局代理、不降低TLS。正式save生成源码摘要。107相关测试、tsc、lint、分类、本地Vite构建、主题CSS通过；deps0error/18既有warning。证据dev-docs/bot-experience-r3/acceptance.md与verification/。

## Merge repair 2026-11-02

- [x] 用户明确授权本批合main；不延后到下一功能版本。
- [x] 原owner P1启动false误报及重复意图保护已修，真实App调用链测试覆盖。
- [x] 独立P2全局新建锁定已修；未知receipt保留而独立空白意图可继续。
- [x] 210相关测试、tsc/scoped lint/classification/本地moxbot build；deps 0error/18既有+1 type-only warning。
- [x] PR225首轮Rust/clippy等通过；前端unit唯一fixture主题guard失败已修，不放宽guard。本地完整unit659文件/7453pass/5skip。
- [ ] 原owner协调新精确修正SHA的PR225共享CI/main及独立远端核验；首轮失败不作为通过。

## Blockers and unknowns

M2/M3为后续实质开发，非已完成能力。独立IAB交互验收不可用；原生持久化与发布待原owner。完整App390截图工具缩放失真不作为视觉通过。详见acceptance.md。

## Next step

提交并推送启动回执修正SHA给原owner，推进当前R1+M1 PR/共享CI/main；远端主干包含独立核验后再进入下一步M2/M3。当前未安装/未发布。

## Deployment request

仅 desktop/macOS/updater；唯一共享CI/main/发布owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。开发会话不触发正式CI、不分配版本、不替换日常App。无其他部署单元变更。

## Execution

主Agent负责实现与集成；/root/r3_acceptance 只读审查和后续独立UI验收，请求gpt-6.1-sol/medium，运行暴露用量未知。选择依据：跨页面身份/上下文判断；不调用外部原因：本轮选择内置协作，已有源码和工具足够。暂无升级/回退。
