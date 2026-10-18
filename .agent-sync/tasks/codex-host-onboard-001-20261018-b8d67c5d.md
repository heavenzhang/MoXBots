<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-onboard-001-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-HOST-ONBOARD-001

## Objective

用户明确授权Ubuntu24.04/x86_64一条命令安装Host、浏览器授权后自动入网与会话自动续期；测试后提交main，发布交由统一部署聊天；不安装、重启或更新日常Mac。

## Acceptance criteria

- [x] 核实际repo/main/worktree，隔离分支，保留其他聊天修改。
- [x] 同源HTTPS正式入口及严格版本/hash/平台检查，统一安装事务/重复安装/繁忙拒绝/回滚。
- [x] 一条无凭据命令及Host侧浏览器授权→同principal续接→auto join/run代码和协议/安装器测试；实际发行浏览器路径由统一owner验收。
- [x] 有效会话的原设备DPoP续期；过期/注销/换key/跨scope拒绝；加密CAS原绑定/handle不变、并发与未知结果受控。
- [x] 添加Host界面取消Linux人工安装/登录勾选，真实目录自动检查；loading/unavailable/error/ready与账号切换拒绝陈旧响应。
- [x] 安装器/认证/真实Axum HTTP/connector/界面回归与非实现者安全/UI审查；实际Ubuntu安装另列证据，不等同生产。
- [ ] CI与远端main实际包含成果；source、fixture/隔离Linux、真实发行/生产分开。
- [ ] 有证据的发布请求交统一owner，非本聊天发布；日常Mac零触碰。

## Completed

已提交同源安装/发行准备、Linux自动发现引导、原设备token轮换和恢复、Tauri状态读取及独立审阅。关键运行时代码8cdeac561；模型租约测试时钟修复af20d4a32，不改模型权限。测试、UI截图和联合发布/回滚合同见dev-docs/host-onboard-001/。当前源码review门禁与正式发布分别追踪。

## Ownership and contract

Primary负责架构/接口、Tauri公开installer状态读取、集成/验证/CI/main/记录。host_onboard_ui独占renderer引导及中英文文案；primary独立审查实际渲染/关键行为。host_one_command_installer独占scripts/host，host_session_renewal独占AuthStore/网络HTTP与Rust Host续期路径；各独立worktree和提交，不并发同文件。后续由非实现者独立安全和UI审查。本轮ai-yaoren-local纯内置模式，无外部模型；三worker请求gpt-6.1-sol/high，运行型号/effort及费用未暴露不冒称确认。

正式分发GET /host/stable.json<=16KiB；strict unavailable或available profile=moxbot-test/platform=ubuntu-24.04-x86_64，固定/host/install.sh和releaseId路径、sourceCommit与hash/bytes。没有可验证已发布元数据时不展示可执行命令。信任为正常HTTPS来源与hash完整性，不虚称发行签名。Installer复用原统一安装、加密store、systemd owner；不得复制desktop token、删除identity pin或启用模型执行。

续期POST /v1/session/renew走既有设备access/DPoP准入，AuthStore原session事务更新expiry，同principal/device/network/handle/key校验；handle/local binding保留，客户端在原加密owner先存候选，原AuthStore事务轮换token hash，旧bearer立即对所有validate路径失效，无新owner，不复活已过期/撤销session，不延长有限Bot/model grants。客户端CAS持久化后原binding安全重新连接，原业务操作不回放。

## Verification

代码与定向门禁已实现；installer100、UI26、Host191、service166/5既有ignored及双方strict Clippy已通过；合入main631后root复跑UI26和完整TypeScript通过。完整正向Connection恢复proof与真实SPKI格式修复由另一认证聊天独立复审接受。runtime冻结8cdeac561；af20d4a32仅固定既有模型租约测试时钟，保留1800/1801秒边界，无生产权限变化。Test39087695311/Owned39087695420为首轮组合证据；CI/最终main交付回执以PR119当前检查/合并和最终交接为准。具体证据在dev-docs/host-onboard-001/acceptance.md累计。生产/101/82/日常Mac不作为测试目标，不通过改变现网TTL或模型权限测试。隔离真实Ubuntu环境探测中。

## Blockers and unknowns

无剩余已知源码安全阻断。最终CI/main尚待正常门禁；隔离Ubuntu24.04.5已验证系统/架构/制品同源，但首次cloud-final尚在处理发行镜像依赖，真实systemd安装结果待PR119最终回执。正式发行浏览器入网、现网101恢复及自然24h续期观察由统一发布owner验收；当前没有公开正式installer，不得据源码生成假发布命令。实际运行模型细分和token/费用不可见，不估算收益。

## Deployment request

Required; queued给01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人），用户本次明确指定统一发布，已发送启动协调。需要同源码正式Host+connector bundle和同源installer静态路径、owned服务续期路由、客户端入口联合冻结；不得混入已冻结发行；此请求不等于已发布/可以改日常Mac。交付后补main SHA/digest/测试/备份回退和真实生产验收门槛。

## Next step

代码已冻结并完成独立复审；完成精确head CI、Ubuntu相称验收与main交付，最终main/CI回执归档PR119及发布owner交接。发布交接dev-docs/host-onboard-001/release-handoff.md，不以队列接受当已发布。

本记录为合入前review快照；最后两个checkbox为CI/main及发布交接门禁，最终远端main SHA、精确CI和统一owner队列回执归档PR119最终交付记录，并作为后续状态入口。发布/实际OIDC/自然24h观察仍由release-handoff指定owner承接，不因本源码任务完成而宣称生产完成。
