# BC-02/03 本地项目交接验收 · 2026-11-07

## 已完成范围

本地项目会话向另一稳定Bot执行session start时，Admin从持久来源决定是否继承；接收方在原Session出生前再次验证当前项目/成员/工作区，把来源固定项目说明/资料/revision与接收Bot身份组合为现有projectSpace。原Agent快照继续决定目标模型/工具/权限。首条send.request通过同一个隐藏提醒携带有界背景，气泡仍只显示原任务。固定背景可冷读，未加入动态历史和私人记忆。

## 验证

- 68 unit：projectSpaces/handoff/projectContext、start-admin/start、session-event/drain。涵盖旧revision保持、成员移除/归档/删除、身份/工作区歧义、override拒绝、外部不继承和结构标签转义。
- 30 integration：10项新交接实际临时SessionStore持久化/冷读/目标模型权限/真实传给inject的文本/拒绝零写入/未知ACK；1项原fresh回报关联；19项原项目背景隔离。执行器为替身，没有访问真实模型、用户目录或业务账号。
- 4 Rust fresh admission contract：完整lib test编译通过，布尔序列化/缺省false/外部入口/不确定回执通过。Rust报告11条未涉及模块warning，无编译错误。
- TypeScript、逐文件ESLint、测试分类、server bundle构建、文档链接检查与git diff --check通过。依赖检查0errors/20warnings。
- 非实现者独立55项通过，无P1/P2；重点复核Inbox不经desktop query而直接注入固定背景、原dispatch/rollback/terminal保护保持。独立与主测重叠，不相加。

## 失败与修正记录

首轮新集成fixture缺少严格registry要求的Agent.enabled，导致REGISTRY_CORRUPT；补齐真实schema后验证正确拒绝原因，未放松生产校验。第二轮fixture在一次明确拒绝并回滚后复用同一target ID再次出生，残留原V2快照对不同capturedAt执行immutable保护；改为独立用例/独立Session，符合Rust每次新UUID的实际契约，未改SessionStore。

原生测试首次缺CLIProxy资源、随后缺Tauri bundle路径。使用仓库prepare-cliproxy helper取得签名及固定摘要验证的资源；Tauri非执行资源沿现有test.yml方式在本独立工作树生成惰性fixture，保留实际server bundle。这是本地Rust库测试，资源不能用作运行客户端/安装或发布，未跳过签名/摘要检查、未改CI/build脚本。带Swift runner的正式测试命令随后通过。

## 可复核命令

使用Node24，根目录执行：

```sh
npx vitest run --project unit src/shared/projectSpaceHandoff.test.ts src/shared/projectSpaces.test.ts src/shared/projectContext.test.ts src/server/inbox/start-handler.unit.test.ts src/server/inbox/start-admin-handler.unit.test.ts src/server/inbox/session-event.unit.test.ts src/server/inbox/drain-handler.unit.test.ts
npx vitest run --project integration src/server/inbox/project-handoff.integration.test.ts src/server/inbox/fresh-session-collaboration.integration.test.ts src/server/session-engine/project-context.integration.test.ts
npx tsc --noEmit
npm run build:server
npm run test:classification
npm run lint:deps
npm run verify:agent-docs
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib inbox::deliver::tests::fresh_ --no-default-features --config "target.aarch64-apple-darwin.runner = ['env', 'DYLD_FALLBACK_LIBRARY_PATH=/usr/lib/swift']"
```

变更文件ESLint清单见checks.json。原始日志保留在项目协作目录work/MB-BOT-COLLAB-20261107/logs（非Git）；Git只保存源码与脱敏结论。

## 交付与限制

部署单元desktop/macOS-arm64/updater/sharedCI/main仍由01a12bc2-907a-7702-b6dd-788225c5dfe4唯一负责。当前仅源和本地测试通过，main/统一CI/版本/制品/安装/真实用户验收待原owner完成；不分配版本，不替换543.2冻结制品，制品摘要不适用。本批无UI布局变更，未启动或接管日常客户端，未宣称截图/原生路径验收。

持久协作主题/负责人/成员入口、真实模型两Bot协作、停止/重开完整业务闭环仍未完成。本批是其前置能力，不是BC-02/03全部完成。下一步按PLAN实施群关系与简洁入口，保留原Task/Session/Inbox owner；需要新owner或通信模式时先讨论方案。
