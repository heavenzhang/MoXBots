<!-- git-project-sync-task:source-digest=238dfe1b2ab8debda91e0ac23708f174fb6c773b16e813b66c8f993cc58587b3 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=db25b842-2d58-4987-9664-942dbf210ef4 -->
<!-- git-project-sync-task:branch=codex/intent-transport-20261107 -->
<!-- git-project-sync-task:base=bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-INTENT-TRANSPORT-20261107 修复任务识别传输失败并实跑简单流程

## Objective

修复 MB-INTENT-TRANSPORT-20261107：任务识别暂态连接失败直接拦截发送，以及纯文字计算被误分执行任务后反复工具验收。只涉及 desktop builtin tool-free utility / intent 分类，不修改业务权限、自动候选池、用户原任务或账本。

## Acceptance criteria

- [x] 原生 543.2 日志定位发送前失败，保留原请求不重放。
- [x] 已知暂态 HTTP/连接失败可在同模型有限重试，仍共用 60 秒和两次调用上限。
- [x] 手动不切模型、取消/选择变化不重试、401/TLS/output-limit 不新增同模型重试。
- [x] 纯回复不创建执行任务或要求根工具证据；真实文件操作仍进入执行。
- [x] 完整相关回归、类型、lint 和实现者源码审阅通过；原owner独立集成审阅待交接。
- [ ] 远端分支、主干、统一桌面修复包交付。
- [ ] 新包实际原生发送→回复→正常结束复验。

## Completed

- 543.2 首发在 structured-utility 中 openrouter/deepseek-v4.1-flash-1017 返回 transport，未进入业务轮；当前 kimi-k3.1-pro 不在自动候选池，原代码因此无接管且立即失败。
- 实际同供应商最小调用恢复成功；原日志没有HTTP状态，不能追认具体网络错误或永久服务故障。
- 原生独立测试 b7268084-cc46-448d-8882-1d382fd5c590 返回1+1=2，但误分execute并经两次无效accept后暂停，证明纯回复分类问题。
- transport新增安全HTTP状态/网络码、暂态标识，不保留供应商错误正文；builtin在无合格当前模型接管时允许暂态原模型再试一次。
- 分类指引按实际产物区分回复与外部行动，不放宽原工具证据/未知操作保护。

## Verification

- Source digest: `238dfe1b2ab8debda91e0ac23708f174fb6c773b16e813b66c8f993cc58587b3`; 34 unit + 351 integration PASS; tsc/eslint/diff PASS; real classifier 4/4 PASS; native pre-fix fault reproduced, new package acceptance pending owner

- RED：新增18条transport测试失败，新增3条utility行为测试失败。
- GREEN：transport/classifier 34条通过，builtin utility 32条通过；完整两组integration 351条通过，typecheck/lint/diff检查通过。
- 真实OpenRouter分类：验收措辞的1+1、普通1+1均answer，文件写入核对与原用户原型承接均execute，4/4通过。仅分类，无业务工具调用。
- 证据见 dev-docs/intent-transport-20261107/acceptance.md；本机原始记录 work/MB-INTENT-TRANSPORT-20261107，不提交真实会话或配置。

## Blockers and unknowns

- 现有543.2原生最小验收暴露问题，不算新修复安装后验收。
- 原失败HTTP/网络根因未知，补充安全诊断后后续可识别。
- 原生程序替换及main/sharedCI均由既有桌面负责人执行；本会话不接管版本/构建/安装。

## Deployment request

- Required: desktop/macOS-arm64/updater/sharedCI/main，需要新不可变修复包；无其他单元改动或数据迁移。
- Owners: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用 .agent-sync/plan.md。
- Handoff: 本分支和任务记录，最终精确SHA在交接JSON给出；不修改已冻结543.3。
- Evidence and dependencies: 新增回归与真实分类证据；原待执行业务不重发、不改池、不切用户模型。
- Status: 已向原owner登记问题和新增原生证据，最终源码交接待完成；main/安装/真实验收分别追踪。

## Next step

完成完整回归、审阅并提交精确源码给既有桌面owner统一集成；新包后原生重复最小任务检查只产生一轮正常回复。
