<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/moxbots-mac-release-20261013 -->
<!-- git-project-sync-task:base=e976726355918cd37fa832641028c84b78786234 -->
<!-- git-project-sync-task:status=complete -->

# MOXBOTS-MAC-RELEASE-20261013

目标：以用户确认的 https://github.com/heavenzhang/MoXBots.git main 冻结快照 e976726355918cd37fa832641028c84b78786234 制作 MoxBots 0.5.2 macOS arm64 Developer ID 签名、Apple 公证安装包。并行 main 新成果不追溯夹带；只打包，不替换或启动现有安装，不公开发布上游更新或网站。

## 验收清单

- [x] 源码/main/独立工作树/签名身份核实；产品源码没有修改。
- [x] 依赖隔离安装、typecheck、license/theme/assets 与 Release 构建。
- [x] 23 项 Mach-O 与 81 项资源摘要独立验收，hardened runtime、secure timestamp、签名及来源通过。
- [x] OCR、Node/Claude 版本启动、media worker PCM/WAV 解码、原生库加载 ABI2 验证。
- [x] 签名候选 DMG 的只读挂载、14843 项内容对应性、镜像校验通过。
- [x] 用户授权 Clash Verge 配置最小调整，完整 App ZIP 成功上传 Apple。
- [x] 完整 App Accepted、staple、Gatekeeper。
- [x] 正式 DMG 重建、签名、Accepted、staple、Gatekeeper、独立内容验收。
- [x] 正式制品、摘要、交付和接续记录。

## 构建与来源

构建 checkout 506be6de097af17af5623d1afebca42bdb08cb09 仅增加任务记录，产品输入仍为冻结 main。实际 MoX profile、工具链、环境覆盖记录在 build-execution-receipt.json，区别于进程环境 dump。task-local SwiftPM overlay 修正系统 CLT stale private interface，public/dylib 保持原字节；未改系统工具链或依赖源码。

文档投影精确命中冻结源码输入编译 cache，保留原 cache；在独立副本重签为 QJ5URBG9AP 并更新实际清单摘要，所有 Mach-O UUID 与文件映射 sections 不变，没有伪装官方 QJ prepared cache。speech 用最终 QJ ORT 摘要按官方 helper 编译。DSH0.1.17、CLIProxy8.0.13、Cuse0.4.0 正式原始档案核验；Cuse 保留有效 PMSG2Y8C6Z vendor 签名及原清单。

## 网络修复与公证

公证认证已验证，复用钥匙串 profile moxbots-notary，不再请求密码；记录不含原始秘密。先前大文件 S3 上传 deadlineExceeded，小文件 Accepted 仅为诊断。用户明确授权修改 Clash Verge 配置，persistent Merge.yaml 和 effective clash-verge.yaml 新增 DOMAIN-KEYWORD,notary-submissions-prod,DIRECT；mihomo -t 与 Unix API 热加载通过，实时连接链为 DIRECT，未更改全局模式/TUN/节点/其他逻辑规则。原配置备份 0700/0600 私有目录，位置与回滚方法见 clash-notary-change.json，不提交备份内容。

完整 App submission 06c69914-5587-4baf-97a6-d01941e24da4 与正式 DMG submission 05b34298-9d78-406c-a6c3-c643c9ec827f 均 Apple Accepted、issues=null，分别 staple/validate 与 Gatekeeper Notarized Developer ID 通过；正式 DMG 从已附票 App 重建，最终输出 signature/hdiutil/stapler/spctl 全0。独立最终输出验收通过，最终只读挂载14844项App inventory完全一致，App/DMG实签名与Apple票据CDHash匹配；自有mount已卸载并清理。

Clash 原配置备份 /Users/zhangshaohua/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/moxbots-notary-backup-2026-10-13T15-35-04-541Z，权限0700/0600；不提交备份内容。备份文件恢复后通过现有 Unix API 热加载即可回滚。配置语义对比证明唯一改动是上述新规则，其余配置完全一致。

## 制品与证据

项目根目录 /Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot。
签名 App /private/tmp/moxbots-release-ydtxfo9m/MoXBots.app；已Accepted ZIP 同临时目录。
候选 output/mac-release/MoxBots-0.5.2-macOS-arm64-candidate.dmg，393006841 bytes，SHA256 56bc9953647ab1c35c67cf243cf5923247eb62d7a84d0b37be2bb85d7f316085。
交付 docs/MOXBOTS-MAC-DELIVERY.md；独立审计 docs/MOXBOTS-MAC-INDEPENDENT-AUDIT.md；完整本机证据 work/mac-release；输出 output/mac-release。

正式包 output/mac-release/MoxBots-0.5.2-macOS-arm64.dmg，377076306 bytes，SHA256 d199f85c71b78614dd56c16d6e7f355fe17cb18bd80f5dc481fc790352f24fc1。provenance.json、SHA256SUMS.txt 同目录；App 与最终DMG的Apple日志、票据及Gatekeeper实证在work/mac-release。

ZIP内 CLIProxy 为额外第24项原生代码：保留有效PMSG vendor签名，正式来源/原档案摘要与Apple代码票据关联独立验证；此前23项仅指直接Mach-O，Cuse亦保留PMSG签名。

## 真实业务与发布边界

未验收新机器安装/首次启动/登录、真实模型、真实 Host 入网/桌面在线、完整 ASR（模型包未安装）。签名/公证不替代上述业务验收。当前安装实例由另一 owner 联调，未替换、启动或退出。官网、生产更新服务、公开 GitHub Release 不在本任务范围；正式协议/credential-reader 实验不因打包而视为实现或验收。临时 notary timeout/chunk 偏好均恢复，未停止用户自有终端。

## 最终交付与接续

正式分发包独立验收通过；原candidate为历史未公证结果，不用作正式交付。正式App/DMG完整公证、票据、Gatekeeper及最终输出独立内容/哈希验证全部通过。交付文件与摘要、报告已保存到上列本机位置。

最终只读同步origin/main为20e89b6f2ac4de297205d168f0bb72614486e899，并验证冻结base e9767263仍为其祖先。本次不改产品源码，打包冻结输入不夹带main并行新成果；任务记录提交/推送本工作分支，未公开上传安装包。

接续：获授权独立机器安装正式DMG，验证首次启动/登录/真实模型与Host/完整ASR；后续main成果要另按明确SHA重新打包。Clash公证桶DIRECT规则保留，其他配置语义相同，私有备份可回滚。当前运行安装实例和他人工作树保留。
