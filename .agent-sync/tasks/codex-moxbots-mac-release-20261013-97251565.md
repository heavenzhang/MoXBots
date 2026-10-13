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
- [ ] 原生资源/源码检查/品牌profile构建与Developer ID签名。
- [ ] 资源闭集、架构、嵌套签名/hardened runtime及来源独立验证。
- [ ] Apple公证Accepted、staple和Gatekeeper/DMG解包验证。
- [ ] 可用制品与摘要、发行边界和接续记录。

## Completed

冻结base e976726355918cd37fa832641028c84b78786234；原工作树credential_slots等并行未提交改动未触碰。证书团队QJ5URBG9AP有效身份已在钥匙串。Apple公证是独立认证，证书名称不是notarytool profile；公证授权正在由用户本机配置，不把原始凭据写到记录或聊天。

## Verification

Git project-sync observe/start/task-init通过。当前main不含固定reader实验；不得从试验分支夹带。build_macos.sh pkill/默认MyAgents调用不直接执行。签名改动只发生在构建资源副本，原资源/应用保留。

## Blockers and unknowns

公证profile具体配置尚待验证；真实Host凭据恢复等未合入功能不属于本包。当前 installed MoXBots由其他owner用于联调，原生安装/启动验收必须避免争抢既有实例；不能用签名/公证代替业务路径通过。

## Next step

完成固定版本资源与签名构建后，核验用户配置的moxbots-notary profile，提交Apple公证并独立验证最终制品。
