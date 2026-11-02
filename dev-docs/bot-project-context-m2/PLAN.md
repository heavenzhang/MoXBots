# MB-BOT-R3-DEV-20261101 / M2 · 发行后进度复核

2026-11-02更新。目标关系与字段仍见CONTRACT.md；原验证过程见ACCEPTANCE.md。本文件纠正此前仍写“CI/原生/发行待完成”的过时状态。

|步骤|当前状态|精确证据与边界|
|---|---|---|
|schema/配置/项目页|已实现、主干与发行完成|ProjectSpace原config锁、revision保护、成员/资料；M2源ffc6b34e5a6398cb8578ad13d83f99bb5aca7379|
|出生与快照/背景隔离|已实现、CI与隔离原生通过|原prepare/rekey/commit；A/B/legacy与共享记忆保护，保留Bot原目录|
|本地定向检查|通过|unit469+DOM214+integration251=934；类型、lint、renderer build通过|
|完整CI/Rust|通过|runs41391625599/41394511475；原Rust crate1834passed/0failed/8ignored，新memory guard两项实际ok|
|远端main|已合入|PR233/234；release main1626ca58，含M2ff；实际打包137fd178与该main/tag tree一致|
|隔离原生|通过对应范围|独立UpdaterQA真实UI创建同Bot A/B和三空会话、v1/v2快照、实际磁盘与冷启动；0用户消息/0模型token|
|正式包/分发|已完成|0.5.36(536.1)，v0.5.36，SHA06bbca4f20b7e61468d5ae5f9d3114d722e5c317288b28cae2228f2819f120f1，302230704bytes，Apple签名公证、真实公开全文件minisign验签|
|官网与stable|已完成|PR235/main9a79da2b，实际页面与同一归档一致，正常TLS/390px检查；Windows仍准备中|
|本机实际使用|已替换为0.5.37/537.1并重启|原owner正常退出、备份、安装；Root独立回读版本/进程/摘要/codesign通过；不把安装等同于原业务恢复或付费模型验收，也不代表含下一批NAV代码|

- [x] M2代码、临时文件/DOM、真实Rust CI和远端主干。
- [x] 新版本/不可变tag、签名公证、归档摘要和回滚记录。
- [x] 项目/会话隔离原生真实保存、出生、重开与冷启动。
- [x] 公开新包、官网和stable、完整字节/签名与实际页面复核。
- [x] 本轮0.5.37/537.1安装与运行单独回执，源65daa43ca5050272c13b0ffe3cb6df70448d3e58；stable仍0.5.36，0.5.37业务验收独立未闭合。

下一步：优先处理用户当前导航问题MB-BOT-NAV-20261102，再推进原M3稳定群组与真实交接。M2只组织项目上下文，不迁移既有Project/Agent唯一绑定，不宣称文件沙盒，不改旧看板/跨端任务或群组并行代码。

0.5.36完整交付和私有原生/下载回执位于项目指针work/MB-BOT-R3-DEV-20261101-M2/；不把业务数据或截图写进Git。原desktop owner01a12bc2-907a-7702-b6dd-788225c5dfe4继续负责正式CI/main/版本/安装与发布。历史源分支codex/bot-project-context-m2-20261102已交付，当前工作在独立NAV分支，原工作树保留。
