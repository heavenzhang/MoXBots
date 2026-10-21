<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-settings-20261022 -->
<!-- git-project-sync-task:base=85981a95b5c9a8e8736d680572e2813b1f7809fd -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-MODEL-SETTINGS-20261022 — 模型策略统一入口

## Objective

沿用用户明确确认的 https://github.com/heavenzhang/MoXBots.git。统一“模型策略”入口已在 cdf33fd9；用户追加授权补齐六项，先修 stale backup 与默认同档接管，跨档须手动开启。通过本地验证及独立审阅后，将精确源码交给既有 desktop 唯一负责人统一合入发布。

## Acceptance criteria

- [x] 单一“模型策略”入口，自动选模型为主，高级故障接管默认折叠，旧导航兼容。
- [x] 1. 空闲新轮次清旧自动备用；manual/null/分类失败/抛错/CAS冲突不得沿用；busy当前轮次不改。
- [x] 2. 自动及指定备用默认与实际主模型同档，显式 allowCrossTier=true 才越档。
- [x] 3. 跟随自动/指定备用/不自动切换三种模式，兼容旧enabled；保留主模型重试、Stop、动作guard。
- [x] 4. 配置就绪反馈与运行时供应商/凭据/endpoint/history、图片、已知上下文及工具协议约束分别检查。
- [x] 5. 标签说明实际主模型、候选与未选原因；真实发送备用请求前才报告已切换。
- [x] 6. 档位读取重试、失效分类器恢复、独立恢复自动分档/档内排序，保留其他配置与失败前值。
- [x] 最终21文件414项 unit/integration/DOM、TypeScript、受影响ESLint、dependency（0 errors/18既有warnings）、测试分类通过。
- [x] 真实组件合成浏览器9组/三宽度/故障恢复通过；非实现者独立复验无阻断项；真实SDK本地回环3路径通过。
- [x] 功能源码与证据已提交；远端同步、handoff gate及发送回执由工作区同任务result.json精确记录。
- [ ] desktop owner统一CI/main集成及远端main核验。
- [ ] owner安排下一未冻结制品、原生配置/真实Provider/生产验收。

## Completed

前两项先以回归复现失败并转绿。六项源码已实现，最终验证及独立review通过。未触碰日常App、真实Provider、生产配置或冻结发布候选。目录读取已拆成catalog叶模块，避免新循环依赖。独立审阅发现异步校验期间canRetry撤销竞态及OpenAI输出预算误判，主Agent修复后复验。

## Verification

证据目录 `dev-docs/model-settings-20261022/`；旧 `evidence/unified/` 只证明入口调整，六项以新增 `evidence/six-features/` 和功能验收文档为准。mock/loopback证明安全门禁与请求行为，不能证明真实Provider能力、原生持久化或生产可用性。未知上下文容量或工具能力仍属未知；仅拦截已知不兼容条件，不虚称已实测。

## Blockers and unknowns

共享CI/main/正式构建与发布仅由既有desktop owner负责。当前功能分支未合入/未发布。真实Provider与原生业务路径验收由其候选制品阶段执行。当前工作区并行写入边界：UI worker仅settings/i18n；主Agentshared/server/route tag/证据；独立reviewer只读，不操作CI或生产。

## Deployment request

- Unit: desktop client（renderer settings、共享配置及内置Session/bridge策略），沿用单一部署单元。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人）。
- Candidate: 以最终远端分支精确SHA为准；替代cdf33fd9 UI-only请求，不加入已冻结批次。
- Compatibility: modelFailover.mode/allowCrossTier均可选，旧enabled按既有语义解析；无数据迁移，无新Session/recovery owner。
- Status: 源码已验收，待提交push与交接；共享CI/main/版本/构建/原生与生产验收待owner。
- Version/tag/artifact digest: 未分配，由owner管理。

## Next step

完成受影响验证与独立review，提交push本任务分支，记录精确SHA与证据，按用户本次授权请求owner统一合入并发布；收到请求不等同已发布。
