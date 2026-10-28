<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/reliability-20261028 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-RELIABILITY-20261028

## Objective

落实用户已确认的调用稳定性与任务可恢复性分阶段方案。首批修复后台工作导致明确工具结果无法结清的问题，并提供只读历史账本核查能力；保留未知操作保护和原会话进度。整体专项继续追踪历史逐项结清、持久步骤与回执、跨重启恢复、调用链路及原生故障验收。

## Acceptance criteria

- [x] 第五阶段实际SDK组合故障100/100，十种场景各十轮，counter全部为1。
- [x] 两次断流保持原deadline，第二次等待Stop无后续调用；原生Query重建保留历史。
- [ ] 第五阶段原desktop owner源审/main/shared CI/签名客户端和真实Provider验收。

- [x] 第四阶段上游冷却约束覆盖后台/无持久owner，原始拒绝与SDK防重发保留。
- [x] 21文件490tests、实际SDK counter=1、真实HTTP冷却头与重复请求核验。
- [ ] 第四阶段原desktop owner源审/shared CI/main/签名客户端和真实Provider验收。

- [x] 第三阶段精确原生执行身份与持久回执，同参数并发/迟到回调/Stop不误清未知。
- [x] 18文件453测试，真实SDK部分写入counter=1及成功回执写盘失败后的重载保护。
- [ ] 第三阶段原desktop owner源审/shared CI/main/正式制品与真实路径。

- [x] 第二阶段原生任务查询逐项核对入口、原生签名权限、Session空闲归属与Store锁内CAS。
- [x] 查询审计回执持久化，原始未知保留；回退/冷加载不获得历史写入重放权限。
- [x] 429项定向回归、7项原生签名测试、真实SDK查询历史和隔离组件浏览器验收。
- [ ] 第二阶段现有桌面owner源审/共享CI/main/正式客户端与真实Provider验收。

- [x] 后台工作取消推理恢复资格时，精确原生失败和派发前拒绝仍可保存可信证据。
- [x] 原推理重试/切备/续接、Stop、超时、旧未知项、并发同参数与存储失败门禁保留。
- [x] 真正的 SDK/native Shell 受控计数器保持 1，生产 SessionStore 回执持久化和重新加载通过。
- [x] 显式快照的只读历史检查验证摘要与结构，不输出命令/结果正文、不授权或修改账本。
- [ ] 后续源审与主干/共享CI/新制品/真实Provider及已安装客户端验收。

## Completed

第五阶段见 `dev-docs/reliability-20261028/phase-five.md`。修正旧smoke缺失的精确native owner/tool ID；新增有界100次矩阵与连续断流/Stop验证。生产src相对phase4无变化。真实SDK和合成上游通过，时钟压缩，Goal/持久writer是夹具；不能替代真实客户端、Provider或断电验收。类型/lint通过，原490项保留为前阶段证据、本阶段未重跑。

第四阶段见 `dev-docs/reliability-20261028/phase-four.md`。修复长Retry-After在后台或无持久owner时被短退避忽略的请求放大；保留原候选/持久等待authority，无权限时返回原错误和冷却头。增加冷却延后与原生commit_unmatched受限诊断，关闭/异常observer不影响权限。7项基线失败；修复后21文件490项通过，实际SDK故意重复仍仅1次失败上游调用、counter=1。类型/lint/分类/依赖边界通过。

第三阶段完成，见 `dev-docs/reliability-20261028/phase-three.md`。每次原生操作独立UUID和Query epoch，Post成功/失败只结清精确原生准入。复用原Controller/Store，旧未知和同参数并发分别保留；可持久诊断但不授予冷启动重放或业务成功。修改前8项回归失败，修复后完整定向453项通过；实际SDK正常及写盘失败两种受控验证通过。类型、lint、分类通过，依赖0errors/18既有warnings。本阶段无UI变更。

第二阶段完成受限查询结清与可见核对入口，详见 dev-docs/reliability-20261028/phase-two.md。只支持原生TaskGet/TaskList严格参数与原hash，不解析Bash/SQL、不放行历史写入。复用Rust P256 user-action proof、SessionEngine/SessionStore和原恢复控制器；原始uncertain保留，readonlyTasks仅保存受限查询审计。没有清除业务未知或自动启动任务。

首批源码、定向回归及只读历史检查完成。复用原 ContextRecoveryController、SessionStore 和实际 SDK hook，不增加运行时 owner、自动续跑队列或持久化格式。详见 dev-docs/reliability-20261028/acceptance.md。

## Verification

第二阶段17文件429tests、7项原Rust签名源测试通过；真实SDK两次任务查询与SDK历史reader、审计重载PASS（synthetic模型/初始ledger，不是业务或已安装App验收）。真实组件/样式浏览器检查通过，390px无横向溢出。原历史快照仅1/63及0/22可受限结清，全部原文件保持不变。类型/scopedlint/classification与依赖检查见phase-two.md；主干和客户端验收未完成。

基线两项真实逻辑回归失败；修复后 13 文件 386 测试 PASS，tsc与scoped ESLint PASS。SDK/native loopback --background-at-failure PASS，原失败命令部分写入计数1，未知0；后台工作状态为受控夹具，不冒充真实后台Agent或日常客户端验收。两个历史快照只读报告保留63/22未知且原文件hash未改变。业务数据与原始日志不进入Git。

## Blockers and unknowns

desktop/macOS-arm64/updater及combinedCI/main唯一owner仍01a12bc2-907a-7702-b6dd-788225c5dfe4。当前0.5.25/525.2/r3候选已冻结，source cc21d4c925ee41b37a79aeb4ef4266db6a4ae104，本批待后续未冻结批次。未清除或重放业务历史、未替换日常App、未操作Host/cloud/mobile生产。未知记录的外部结果、生产进程/整机冷启动及真实Provider矩阵尚未验收；隔离SDK Query重建和100次组合矩阵已通过。

单Agent直接开发，无子Agent或外部模型调用；真实Token/费用未测量。现有Git链路偶发TLS失败，使用已配置的本地代理在命令级完成核实，不改变全局Git或应用配置。

## Next step

第五阶段精确提交依赖phase4 8cfe7b00815bbc1721a5e0d262e51ced1b7867d4，phase3 f57f2783402fab7291646064501de0c7d07c9093，连同phase2 347b5759、phase1 b453b94依赖，交既有desktop owner下一未冻结批次统一源审、共享CI与main整合。当前main已前进到775da22c196b5c72277469c3c1a357d360f030e6（mobile build5），恢复生产代码无重叠，owner合入时仍须同步最新main验证。不可混入已冻结0.5.25/525.2/r3。

继续专项的业务回执对账、冷启动可恢复状态和真实Provider/网络故障矩阵；先保留可验证的操作身份，再按外部真实结果逐项结清。历史薪资62项和AI配置22项未获得业务结清证明。前两阶段owner已接收下批排队、源审尚未完成；本阶段代码交付不等于主干/发布/业务恢复。
