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
- [x] 相关JS/Rust回归、类型检查、局部lint、独立真实组件页面验收；208 Rust+2既有ignored，Host41+页面4，P2修复复验通过，完整CI待PR。
- [ ] 提交、PR/CI、合入最新远端main并核实。
- [ ] 指定发布owner交付原生版本、真实原账号恢复在线、状态及持久化复验。

## Completed / Evidence

源码权威 https://github.com/heavenzhang/MoXBots.git，main；本任务分支codex/cloud-network-recovery-20261018。
- 主负责人：连接排查、Rust错误投影、集成/交付；network_status_ui：renderer实现（Sol medium）；network_ui_review：独立合成实际页面验收（Luna medium）。精确token/费用未暴露。
- 103项DOM/API测试通过；状态修订后的3项恢复回归通过；局部eslint/diff-check通过。其余检查另记。
- 云instance/Dex公共发现响应200；同TLS13握手通过。独立同crypto/reqwest探针先复现5s超时，随后继承代理/直连都发生过成功与超时，不能认定代理为唯一原因。探针保留平台证书校验，无全局代理/证书信任修改。
- 运行基线 /Applications/MoXBots.app v0.5.9；日志官方SPACE_REAUTH_REQUIRED和owned-account5s timeout。实际连接状态/账号恢复待原生owner核对，不从HTTP200推断在线。

## Deployment request / Ownership

用户于本聊天明确回复“授权协调两个发布聊天”。已通知桌面01a12bc2-907a-7702-b6dd-788225c5dfe4与云端01a12b99-7b38-78b1-831f-9c60257d386a；先只读核对，未发行dirty源码。遵守共享计划现有target归属，不并发换包/重启。
需要桌面修复发行；云端是否需变更待诊断。原生、真实登录和生产在线验收单独记录，不将合成通过视为恢复。

## Verification

结果与独立UI证据保存在 dev-docs/cloud-network-recovery/。私有诊断在/private/tmp/moxbots-cloud-network-diagnostic-20261018，不进入Git；不保存令牌/密钥。

## Blockers and unknowns

真实云网络尚未恢复；需要核对原生连接快照、是否需要用户正式登录和实际运行版本。指定发布owner接收/可执行窗口待确认。不能将超时直接归咎于服务器宕机。

## Next step

完成Rust与UI验收，提交精确修复并通过PR/CI交付main；将不可变SHA交指定owner，验证原账号在线和设备真实状态。
