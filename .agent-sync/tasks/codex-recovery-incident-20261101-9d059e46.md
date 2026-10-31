<!-- git-project-sync-task:source-digest=16027550e794eddb1343a5cda7d47a4da5e759d6dc9ccd4005c0ffd123edde80 -->
<!-- git-project-sync-task:id=6003f676-f42f-4c63-ba54-799bac465a23 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/recovery-incident-20261101 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-INCIDENT-20261101 恢复横幅回归与并发恢复隔离

## Objective

修复 528.1 四会话反馈中的重复恢复横幅与并发拒绝扩大问题，保全原会话与账本；以原业务完成为最终稳定性标准。证据：`dev-docs/recovery-incident-20261101/acceptance.md`。

## Acceptance criteria

- [x] 当前安装、main、部署 owner 和四会话只读证据核实。
- [x] 重复横幅和并发拒绝分别失败复现、修复、回归；未知操作与真实流中断围栏保留。
- [x] 134 单元、27 隔离集成、22 DOM、TypeScript、ESLint、分类与差异检查。
- [x] 第一提交44fd167远端保存且owner定向独审通过。
- [ ] 第二批增量远端保存、owner联合审查及主干包含核验。
- [ ] 原 owner 统一版本/CI/制品/安装；在可用原生窗口完成原会话验收。

## Completed

四会话只读快照已保存任务相邻私有 evidence。第一提交两处源码修复及5项新增测试完成；第二批补Responses合法推理事件/进展和有界意图失败证据，原保护状态未修改；完整范围和失败证据见 acceptance.md。

## Verification

- Source digest: `16027550e794eddb1343a5cda7d47a4da5e759d6dc9ccd4005c0ffd123edde80`; Phase2: 46 protocol/unit/HTTP + 66 execution integration + 17 DOM PASS; full tsc, scoped lint, classification, diff check PASS; public unauthenticated network GET 6/6 only; original Session acceptance remains pending with authorized desktop owner

- Source digest: `fe8a9f06d0344c0f124e3a3e88cf1ace1386f5cad9a2c898d55329e0f2e45a28`; Node24: 134 unit + 27 isolated integration + 22 DOM PASS; full tsc, scoped eslint, test classification and diff check PASS; original ledgers untouched; native acceptance pending with desktop owner

Node24: context recovery 134 unit + 27 integration、22 DOM PASS；全量 tsc、定向 lint、test classification、diff check PASS。第二批46协议/HTTP、66执行集成及17 DOM通过；真实业务未重放，原生验收由原owner推进。

## Blockers and unknowns

意图识别失败具体原因、代理连接超时以及 Responses idle/首错分类仍未闭环；旧未知结果不可凭截图核销。部署 owner 当前暂停 528 晋级；用户本轮已明确解除原生暂停，授权原owner安装验证。任务总体尚未完成。

## Deployment request

desktop/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`；沿用下一未冻结批。不新增部署 owner，不触发共享 CI/PR/正式构建或安装。本次没有版本分配、制品摘要、发布 tag；源码推送不是生产交付。

## Next step

将精确分支 SHA 交原 owner 独立审查并正常集成 main；按最新授权由原owner安装候选并验证四原会话，失败继续定位，真实会话验收单列。
