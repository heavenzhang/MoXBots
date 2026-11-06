<!-- git-project-sync-task:source-digest=280fb83d1dc9c93211fd9427d2860f335f9344abec7b8c74e8b26e8175ccc080 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=77029733-9552-43d5-b3e0-0dbdf0377545 -->
<!-- git-project-sync-task:branch=codex/bot-collaboration-main-ready-20261106 -->
<!-- git-project-sync-task:base=05ea1e2c4d06f112585012a27503adc75c184dcc -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-BOT-CORE-20261106 Bot协作核心与SimpleUX主干准备

## Objective

用户要求两批合入主干，明确简洁且Bot协作为核心。开发完成在精确05ea1e2上的本地组合、冲突处理、相称验证与下一步BC路线。main/CI/发布沿原唯一owner，无竞争部署。

## Acceptance criteria

- 原59faa99与f815453均为候选祖先，最终树保留主干稳定性与两批功能。
- 360定向回归、类型/lint/构建、独立源审通过；旧window偏好可兼容读取。
- 稳定BC清单明确职责、状态、完成标准、依赖和下一步；真实Bot协作不可由子Agent演示冒充。
- 保存精确远端SHA并handoff；原owner确认共享CI/main远端包含；正式制品与原生分别留证。

## Completed

- 两批本地组合与完整源码恢复、兼容偏好、全计划保留完成。
- 116unit+244DOM+8theme、类型/lint/classification/renderer构建通过；独立34项通过，无P1/P2。
- dev-docs/bot-collaboration-core-20261106/PLAN.md和acceptance.md记录产品主线、BC清单及失败修复证据。

## Verification

- Source digest: `280fb83d1dc9c93211fd9427d2860f335f9344abec7b8c74e8b26e8175ccc080`; Combined116unit+244DOM+8theme PASS; tsc/changed eslint/classification/moxbot renderer build PASS; deps0errors20warnings; independent34PASS; exact full main sources preserved, both producers ancestry verified; main/CI/native pending sole owner

验收见dev-docs/bot-collaboration-core-20261106/acceptance.md；本地原始logs在work/MB-BOT-CORE-20261106/logs/。depcuise零错误20警告；真实模型、业务写入、正式签名制品或已安装UI不由本轮本地检查证明。

## Blockers and unknowns

远端main当前05ea1e2尚不包含两批SHA；等待原desktop/sharedCI/main owner01a12bc2统一审核/CI/合入，不越权打开PR或运行共享CI。当前543.1安装与543.2准备保持原边界。M3稳定群组/真实Bot交接尚待实施，不与现有会话角色子Agent混同。

## Next step

原owner接收最终精确组合SHA，复核最新main与候选树并统一CI/main，回执祖先关系；随后按BC-02/03明确原Store/Session/Inbox契约并跑通两个稳定Bot的一次交接/回报/验收。
