<!-- git-project-sync-task:source-digest=38da54d47fd84faa3b088f15489844ae170979da6cc480b611c8f54a0ae94b88 -->
<!-- git-project-sync-task:id=b8430c97-780b-44d8-8d23-b536eed0194d -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/bot-nav-cleanup-20261102 -->
<!-- git-project-sync-task:base=589351245610910476fb4f1328b7c8d4f83da203 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-BOT-NAV-20261102 会话侧栏整理与原规划进度复核

## Objective

让侧栏以会话主题为主、Bot/项目为简明归属；清楚分置顶/未读/最近并支持Bot/项目筛选，保持全部历史和原Session打开owner。更新R3原计划到真实发布状态。用户另已授权原desktop owner替换本机最新合格包。

## Acceptance criteria

- 同Bot重复继续消息下仍可辨会话主题；每会话只出现一次，置顶未读不重复。
- Bot过滤覆盖其A/B和旧会话，项目过滤只显示该逻辑项目；切换与打开不重绑身份。
- 实际产品组件深浅主题/窄侧栏/错误恢复/键盘可用；无业务消息与模型调用。
- 原计划分别记录M1/M2主干、隔离原生、发行与本机安装，M3未实现不作已完成。
- 定向回归/类型/lint/实际组件与独立审查通过后，精确source交唯一owner共享CI/main及下一未冻结批。

## Completed

- 已核验原R3和真实0.5.36画面；latest main589351245610910476fb4f1328b7c8d4f83da203，新隔离分支start/task-init通过。
- 已实现两行主题优先、三分组、Bot/项目筛选与重复项目入口合并；29项定向测试、类型/lint/classification/本地renderer build通过。
- Root实际组件深浅、390px无横溢、两类筛选、打开原ID、空态/失败重试、单一新项目入口、Return/Escape通过；独立源码/静态视觉无P1/P2。
- 原owner已安装0.5.37/537.1，Root独立核对版本/运行/摘要/签名通过；本轮NAV不在该旧候选中。

## Verification

- Source digest: `38da54d47fd84faa3b088f15489844ae170979da6cc480b611c8f54a0ae94b88`; 29 targeted tests; tsc, scoped eslint, classification, renderer build and primary live component UI PASS; native release pending original owner

- 五文件29tests PASS，tsc --noEmit/scoped eslint/test分类/本地moxbot renderer build PASS；ui-final-dom 12行/12唯一ID。
- 脱敏复核见dev-docs/bot-navigation-20261102/ACCEPTANCE.md；真实画面/安装回执仅在项目指针work/MB-BOT-NAV-20261102。
- 独立reviewer无可用浏览器上下文，仅源码/静态视觉通过；Root亲测实际合成组件交互。共享CI/main/新包/真实原生侧栏仍待原owner。

## Blockers and unknowns

0.5.37本机替换完成，原业务TLS502/unknown仍独立受保护。不得清unknown或以UI改动替代业务恢复。Root不触碰dirty cross-end/group工作树、不触发共享CI/正式构建。NAV须进入下一未冻结批，由既有desktop/macOS-arm64/updater/sharedCI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4集成。

## Next step

提交并核验远端任务分支，交原owner一次统一CI/main及下一UI候选，之后复核新包真实侧栏。原M3在导航修顺后推进稳定群组/单一收件人/真实交接与验收。
