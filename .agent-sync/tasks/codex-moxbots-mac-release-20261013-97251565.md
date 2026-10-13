<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/moxbots-mac-release-20261013 -->
<!-- git-project-sync-task:base=e976726355918cd37fa832641028c84b78786234 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: MoxBots Developer ID signed notarized macOS arm64 package

## Objective

MOXBOTS-MAC-RELEASE-20261013：用户确认MoxBots名称和canonical main，从e9767263生成macOS arm64 Developer ID签名/Apple公证包。只打包客户端，官网候选不纳入；不发布上游MyAgents更新，不替换当前安装实例或并行凭据修改。

## Acceptance criteria

- [x] 权威仓库/main、并发变更、独立工作树和签名身份核实。
- [x] 依赖隔离安装；源码/现有签名脚本独立审阅。
- [x] 原生资源/源码检查/品牌profile构建与Developer ID签名。
- [x] 资源闭集、架构、嵌套签名/hardened runtime及来源独立验证（23个MachO、81项摘要通过；完整ASR未测）。
- [ ] Apple公证Accepted、staple和Gatekeeper/DMG解包验证。
- [ ] 可用制品与摘要、发行边界和接续记录。

## Completed

冻结base e976726355918cd37fa832641028c84b78786234；原工作树credential_slots等并行未提交改动未触碰。证书团队QJ5URBG9AP有效身份已在钥匙串。Apple公证是独立认证，证书名称不是notarytool profile；公证profile moxbots-notary已在钥匙串配置并通过Apple验证；原始凭据不写入项目、记录或构建命令。

## Verification

Git project-sync observe/start/task-init通过。当前main不含固定reader实验；不得从试验分支夹带。build_macos.sh pkill/默认MyAgents调用不直接执行。签名改动只发生在构建资源副本，原资源/应用保留。

## Blockers and unknowns

公证凭据已就绪。原生资源下载曾partial-file失败，HTTP/1.1已恢复子模块；原始ORT冷源码传输持续中断，改用精确匹配当前编译输入的已验证prepared产物重签投影；保留原缓存、模型及许可摘要，记录原fingerprint与新可复算projection身份。系统CLT混有Swift5.10 private interface与Swift6.3.2 dylib，任务专用SwiftPM库副本移除旧private interface后dump-package通过；任务专用SwiftPM overlay下主应用Release编译已通过，未修改系统工具或依赖源码。真实Host凭据恢复等未合入功能不属于本包。当前 installed MoXBots由其他owner用于联调，原生安装/启动验收必须避免争抢既有实例；不能用签名/公证代替业务路径通过。

## Next step

完成固定版本资源与签名构建后，核验用户配置的moxbots-notary profile，提交Apple公证并独立验证最终制品。

## Packaging progress

Node24隔离依赖和assets构建通过；typecheck、许可、theme检查通过。DSH0.1.17 release、CLIProxy8.0.13、Cuse0.4.0原始档案已校验。15个独立projection Mach-O已按QJ5URBG9AP签名，Node/Claude保留源码JIT权限；Cuse独立已公证vendor App保留PMSG2Y8C6Z签名与原始清单。文档PMSG预签cache虽精确命中当前输入，但与QJ speech跨Team Library Validation冲突，正式包必须完成QJ document与speech一致构建。当前没有可交付App/DMG，也未提交本包公证。

本机证据位于项目work/mac-release；Swift overlay位于Documents/Codex/2026-10-13/moxbots-release-toolchain，未修改系统CLT或Cargo依赖源码。原生资源与主应用的独立target/cache不影响正在联调的现有安装实例。

原生文档projection已统一QJ重签并重生成sha/size/signing元数据，所有Mach-O UUID与文件映射sections保持不变；未写入或伪装QJ官方prepared cache。speech用最终QJ ORT真实摘要重新走官方helper并成功。文档OCR实测识别MOXBOTS 2026 TEST；最终包内media worker能完成1000ms PCM解码，hardened无额外entitlement探针真实加载三原生库并取得ABI2；ASR模型未安装，完整识别未测。最终App已于/private/tmp/moxbots-release-ydtxfo9m封装并严格Developer ID签名验证通过（Documents同步元信息不参与最终包）；ZIP生成及公证待完成。

独立candidate审计已通过；App公证上传已分别使用默认S3 acceleration和普通通道，但均deadlineExceeded且completedParts为空；并非Apple Accepted。仅notary upload timeout临时提高900s并备份，上传结束finally恢复原设置；第三次上传继续。工作目录受同步FinderInfo影响，最终App位于/private/tmp/moxbots-release-ydtxfo9m，完整证据与交付草稿位于项目work/mac-release。候选未安装、未公开发布；当前主干已并发推进至fb92ce9c，不追溯夹带其新代码到冻结包。
