# CHAT08-RECORDS：原生记录读取不依赖列表摘要

543.5 原样本原生复验失败：就绪后的刷新确已发生，接口仍409，独立结果不明提示缺失。原未决操作未发送、重放或清除。旧包保留，不以本地检查替代原生通过。

## 根因与修复

当前 SDK 0.3.296 的 `getSessionInfo` 会在没有可用于列表的 summary/firstPrompt，或摘要不适用时返回 undefined；同一 SDK 的 `getSessionMessages` 和 `importSessionToStore` 仍能通过原 Session ID 定位并读取记录。摘要不是原始证据是否存在的 authority。旧 `readNativeRecoveryRecords` 错把 undefined 摘要作为证据不存在，导致整个检查409。

继续由 SDK 的公开 `importSessionToStore` 定位原记录，不自行推导文件位置、不建立文件写入器。可用摘要仍须通过精确 ID 和有限 fileSize 预检；摘要缺失时逐条导入内存 collector，保留精确 sessionId、禁止 subpath、累计最多50,000记录/64MiB序列化数据。无记录、缺失源、错误scope、超限或读取错误仍失败。collector的load始终拒绝。SDK读取过程中单条JSON解析的内存由SDK负责，64MiB是接受证据的累计上限。

原始 receipt 仍需和 SDK 选中链中的原工具/结果精确配对；没有修改执行门禁、原生判定、自动重试、reconcile权限或账本。此分支只改读取 helper 及相邻回归；69f4冷启动通知由桌面owner与本源组合。

## 验证

- RED：摘要undefined、SDK可提供原记录，旧helper直接拒绝。
- 113 unit/5文件通过，含新增15项读取门禁：无摘要有效记录、可用摘要预检、缺失/空/错误ID/subpath、累计记录与字节上限、禁止load。
- 33模拟集成/3文件通过：18恢复冷/热闲置门禁、4followup、11checkpoint。
- 完整TypeScript、定向eslint、测试分类和diff通过。初次类型检查暴露测试fixture声明过宽及缺少type字段，已修正为SDK SessionStoreEntry类型；未改变生产实现。
- 同份543.5 SDK字节与本地依赖一致；在原账本和V2产品记录上只读诊断，旧helper返回source_unavailable，补修可读36 raw/12 selected记录，识别最新轮1项未决。两份原文件摘要不变，0模型/业务/写账调用。私有证据work/MB-CHAT-STYLE-20261104/diagnose-5435，Git仅保留合计和测试摘要。

## 交付及原生门禁

现有desktop/sharedCI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4独立审阅并分配下一不可变候选；543.5已签名包不覆盖。先同一原样本只读验证卡片、原工具定位与重开，再真实Codex待审批卡、重开/单次操作和原权限还原，随后长会话阅读/选区/详情保持、正常整轮折叠、展开顺序及成果可见。全部必要原生项通过后才合主干/核实远端和CI/同份制品发布。
