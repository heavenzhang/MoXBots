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

唯一正式分发阻断是完整App公证大文件上传在本机系统代理路径持续失败/未完成；凭据与小型已签文件上传、公证均已验证。未获完整App/DMG Apple Accepted；staple与Gatekeeper门禁开放。系统代理未改，临时notary timeout/chunk偏好恢复，等待用户稳定网络接续。

真实Host凭据恢复等未合入功能不属于本包。当前 installed MoXBots由其他owner用于联调；本任务未替换或启动实例。新机器安装、真实模型/Host路径与完整ASR仍未验证，不能用签名/公证代替业务通过。

## Next step

稳定上传网络到位后，复用moxbots-notary钥匙串profile与已签App/ZIP，取得完整App Accepted并staple/validate；然后重建正式DMG，签名、公证Accepted、staple/Gatekeeper和独立只读内容核验。不再请求密码，不套用小型probe的Accepted。候选已可审阅，当前不是正式分发完成。

## Packaging progress

Node24隔离依赖和assets构建通过；typecheck、许可、theme检查通过。DSH0.1.17 release、CLIProxy8.0.13、Cuse0.4.0原始档案已校验。15个独立projection Mach-O已按QJ5URBG9AP签名，Node/Claude保留源码JIT权限；Cuse独立已公证vendor App保留PMSG2Y8C6Z签名与原始清单。文档PMSG预签cache虽精确命中当前输入，但与QJ speech跨Team Library Validation冲突，正式包必须完成QJ document与speech一致构建。当前没有可交付App/DMG，也未提交本包公证。

本机证据位于项目work/mac-release；Swift overlay位于Documents/Codex/2026-10-13/moxbots-release-toolchain，未修改系统CLT或Cargo依赖源码。原生资源与主应用的独立target/cache不影响正在联调的现有安装实例。

原生文档projection已统一QJ重签并重生成sha/size/signing元数据，所有Mach-O UUID与文件映射sections保持不变；未写入或伪装QJ官方prepared cache。speech用最终QJ ORT真实摘要重新走官方helper并成功。文档OCR实测识别MOXBOTS 2026 TEST；最终包内media worker能完成1000ms PCM解码，hardened无额外entitlement探针真实加载三原生库并取得ABI2；ASR模型未安装，完整识别未测。最终App已于/private/tmp/moxbots-release-ydtxfo9m封装并严格Developer ID签名验证通过（Documents同步元信息不参与最终包）；ZIP生成及公证待完成。

独立candidate审计已通过；App公证上传已分别使用默认S3 acceleration和普通通道，但均deadlineExceeded且completedParts为空；并非Apple Accepted。仅notary upload timeout临时提高900s并备份，上传结束finally恢复原设置；第三次上传继续。工作目录受同步FinderInfo影响，最终App位于/private/tmp/moxbots-release-ydtxfo9m，完整证据与交付草稿位于项目work/mac-release。候选未安装、未公开发布；当前主干已并发推进至fb92ce9c，不追溯夹带其新代码到冻结包。

## Candidate and pending notarization handoff

可审阅Developer ID签名候选：项目output/mac-release/MoxBots-0.5.2-macOS-arm64-candidate.dmg，393006841 bytes，SHA256 56bc9953647ab1c35c67cf243cf5923247eb62d7a84d0b37be2bb85d7f316085。codesign strict及hdiutil verify通过；独立DMG mounted内容核验进行中。candidate-provenance.json与SHA256SUMS-candidate.txt同目录。

小型已签native-load-probe上传成功并获Apple Accepted（70d885f2-c8b6-49f1-85d1-956bea07eb25），只证明认证和小文件通道，不代表完整App。整包第三次延长timeout后20min未完成，主负责人停止自身任务进程，已finally恢复原notary timeout偏好。第四次App仅移除task进程代理env并明确5MB chunk/900s timeout，但lsof仍实证经过系统代理127.0.0.1:7897；App ID d58ed8f2-13d4-4c60-a6f7-06e4443c858d仍处于上传，尚无Successfully uploaded/Accepted证据。已请求用户切稳定上传节点或保留candidate稍后公证；未修改全局系统代理、不停止用户自有notary终端进程。

下一步：用户网络解除后完成完整App上传并取得Apple Accepted，staple/validate App；重建含stapled App且说明更新的正式DMG，DMG签名、公证Accepted、staple、Gatekeeper与readonly内容独立验收。若用户选择延期，停止自身剩余上传并恢复timeout/chunk偏好，仅交付candidate和明确待验边界。源代码无需重构；不得把小型probe的Accepted套用于完整包。

最终candidate独立DMG核验通过：签名/Team/secure timestamp、hdiutil VALID、readonly挂载14843项内容与已审计App完全一致，自有mount已卸载。正式App/DMG AppleAccepted/staple/Gatekeeper仍开放。第四次task-env去代理仍经过系统代理，已停止自身上传，timeout/chunk偏好已恢复；没有后台上传遗留，没有动用户自有notary终端或现有安装。等待用户网络动作接续；交付与接续在docs/MOXBOTS-MAC-DELIVERY.md及output/mac-release/DELIVERY.md，独立报告同目录留存。
