<!-- git-project-sync-task:source-digest=6fb688d46846a9294adf6bf23814d5e6165750cd772724ee61c2298df7030b8d -->
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

- Source digest: `6fb688d46846a9294adf6bf23814d5e6165750cd772724ee61c2298df7030b8d`; 107 targeted tests passed; tsc and scoped ESLint passed; test classification passed; dependency-cruiser 0 errors/18 existing warnings; moxbot Vite build passed; theme CSS 31 mappings passed; primary synthetic UI and narrow App navigation checked; independent source/static visual review passed; independent interaction/native/production not run.

git-project-sync start PASS（main ad68c28d）；task-init遇代理TLS间歇故障，R1合并后HEAD已前进，显式建立任务记录；通过单命令Git代理空覆盖恢复observe PASS，不修改全局代理、不降低TLS。正式save生成源码摘要。107相关测试、tsc、lint、分类、本地Vite构建、主题CSS通过；deps0error/18既有warning。证据dev-docs/bot-experience-r3/acceptance.md与verification/。

## Blockers and unknowns

M2/M3为后续实质开发，非已完成能力。独立IAB交互验收不可用；原生持久化与发布待原owner。完整App390截图工具缩放失真不作为视觉通过。详见acceptance.md。

## Next step

保存并核验M1远端源码，提交原owner下一未冻结批审阅/共享CI/main请求，继续M2/M3合同与真实接线；独立原生/生产门槛不混同。

## Deployment request

仅 desktop/macOS/updater；唯一共享CI/main/发布owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。开发会话不触发正式CI、不分配版本、不替换日常App。无其他部署单元变更。

## Execution

主Agent负责实现与集成；/root/r3_acceptance 只读审查和后续独立UI验收，请求gpt-6.1-sol/medium，运行暴露用量未知。选择依据：跨页面身份/上下文判断；不调用外部原因：本轮选择内置协作，已有源码和工具足够。暂无升级/回退。
