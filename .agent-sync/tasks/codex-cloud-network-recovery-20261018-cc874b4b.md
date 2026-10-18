<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/cloud-network-recovery-20261018 -->
<!-- git-project-sync-task:base=ffaf0005aedf88df49e127781020948bdb8cebe1 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: CLOUD-NETWORK-RECOVERY-20261018 — 恢复云网络并区分连接与设备状态

## Objective

恢复既有云网络连接，准确区分登录/凭据授权、连接超时/不可用以及已连接网络内的设备离线。不重置已有账号、绑定、设备身份或密钥，不中断活动任务。

## Acceptance criteria / To Do

- [x] 核实源码仓库、最新远端main、运行实例和日志；从ffaf0005a建立独立分支，原工作区不变。
- [x] 客户端状态投影：登录与超时有明确提示；断网缓存设备为状态未知；连接恢复显示真实状态。
- [x] 精确保留HTTP请求/响应读取的timeout错误类别，普通transport和鉴权失败不误分类。
- [x] 相关JS/Rust回归、类型检查、局部lint、独立真实组件页面验收；208 Rust+2既有ignored，最终150项DOM/API/Host，P2修复复验通过；CI39132053740九项成功、一项预期iOS专项跳过。
- [x] PR134全部正常CI通过；合入0b15218ad47ee03f765ca9f47686e6b31e6898e4并核实远端main包含成果。
- [ ] 指定发布owner交付原生版本、真实原账号恢复在线、状态及持久化复验。

## Completed / Evidence

源码权威 https://github.com/heavenzhang/MoXBots.git，main；本任务分支codex/cloud-network-recovery-20261018。
- 主负责人：连接排查、Rust错误投影、集成/交付；network_status_ui：renderer实现（Sol medium）；network_ui_review：独立合成实际页面验收（Luna medium）。精确token/费用未暴露。
- 最终150项DOM/API/Host测试通过；类型检查、本地全量ESLint、默认和最终MoXBots Web构建通过；Rust208通过/2既有ignored。独立UI1280/760/390通过，1处P2修复复验关闭。首轮CI新增测试tokio::spawn被clippy拒绝，已改为直接并发future，未绕门禁。
- 云instance/Dex公共发现响应200；同TLS13握手通过。独立同crypto/reqwest探针先复现5s超时，随后继承代理/直连都发生过成功与超时，不能认定代理为唯一原因。探针保留平台证书校验，无全局代理/证书信任修改。
- 运行基线 /Applications/MoXBots.app v0.5.9；日志官方SPACE_REAUTH_REQUIRED和owned-account5s timeout。原生CUA于本轮接续只读确认原选中账号曾在线，随后重现超时，详见下方。

## Deployment request / Ownership

用户于本聊天明确回复“授权协调两个发布聊天”。已通知桌面01a12bc2-907a-7702-b6dd-788225c5dfe4与云端01a12b99-7b38-78b1-831f-9c60257d386a；先只读核对，未发行dirty源码。遵守共享计划现有target归属，不并发换包/重启。
需要桌面下一未冻结批次修复发行；已通知owner最终main/CI不可变证据。云owner21:12–21:14只读确认既有服务与101freshReady，无云重启需求；原生日常Mac后续5秒超时链路已补交云owner针对性只读排查。原生、真实登录和生产在线验收单独记录，不将合成通过视为恢复。

## Verification

结果与独立UI证据保存在 dev-docs/cloud-network-recovery/。私有诊断在/private/tmp/moxbots-cloud-network-diagnostic-20261018，不进入Git；不保存令牌/密钥。

## Blockers and unknowns

原账号网络未证明持续稳定：CUA所选cloud在线、2台设备、本机Mac-mini-2在线，MacBook-Air离线（最后1月22日）；几分钟后出现自动重连，旧版详情Host区称离线却缓存本机在线。14:25:15Z原生日志owned-account GET send timeout5002ms。当前同一日常0.5.9进程85691；没有重启、改代理、凭据或绑定。官方/QA/另一同名绑定仍未恢复，不能互换账号或从缓存断言设备状态。修复134尚未安装，活动用户任务禁止中断，冷启动验收待安全窗口。

## Next step

源码主干交付完成，测试tree d5a220f13de2d5f19be1feacf9a955ae189ac714与修复merge完全相同；后续main baa1a637仅官网记录变更，renderer/src-tauri相同。保持本记录in-progress：云owner继续原生5秒超时链路诊断；桌面owner准备下一未冻结签名候选并回报版本/制品/SHA，安全启用后验证三类状态、原账号稳定在线及冷启动持久化。实时交付回执位于本地项目output/cloud-network-recovery-20261018/delivery.json，队列由唯一桌面owner维护。
