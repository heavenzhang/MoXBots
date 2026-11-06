# MB-IM-BINDING-20261107 — 已有 Bot 绑定多个 IM 身份

## 目标、范围与完成标准

用户明确选择「先完善一个 Bot 绑定多个 IM 身份」。客户端 Bot 是既有 AgentConfig；每个 IM 身份使用该 Bot 的独立 ChannelConfig。范围为已有模型的产品入口、绑定可见性和身份选择校验，不引入按用户/群分派到不同 Bot 的共享网关，也不创建新的角色或权限 owner。

- [x] 核实实际 main、独立 worktree、现有配置/运行/会话 owner 与发布归属。
- [x] 对照 OpenClaw、腾讯云企微适配器和 AstrBot 的账号/会话绑定模式。
- [x] Settings 以现有 Bot 分组展示多个 IM 身份、用户/群计数、真实状态；复用既有 Channel 管理。
- [x] 平台入口选择已有 Bot；筛除缺失身份、归档、隐藏及冲突项；隐藏/归档的归属冲突仍参与校验。
- [x] 重新读取持久身份后验证项目 ID、Bot ID、工作路径，拒绝过期选择。
- [x] 向导明确目标 Bot；新会话采用原 Bot 模板，旧会话快照不被修改。
- [x] 缺失连接观测显示「状态待确认」，不伪装为「已停止」。
- [x] 本地回归、类型、定向 lint 与真实页面交互检查。
- [ ] 远端主干包含成果（由原 desktop/sharedCI/main owner 集成）。
- [ ] 统一桌面构建/安装与真实 IM 收发验收。

## 当前实现核查

- `src/shared/types/agent.ts` 已有 `AgentConfig.channels[]`，多个平台或同平台的多个身份无需新增 Bot。
- `src-tauri/src/im/agent_channel.rs`、`router.rs` 负责生命周期、配对/群权限、peer→Session；Node SessionEngine 执行 AI turn。
- `src-tauri/src/im/bridge.rs` 为每个 Agent/Channel 使用独立 OpenClaw 状态目录；`src/server/plugin-bridge/` 负责插件兼容与 request-scoped reply。
- `promotedPlugins.ts` 已登记飞书 `@larksuite/openclaw-lark`、企微 `@wecom/wecom-openclaw-plugin`、微信 `@tencent-weixin/openclaw-weixin`。此处仅核实本项目登记，不声称本机已安装/平台已连通或所有插件版本均受支持。
- 已有配对、白名单、群审批及启动/停止入口完整；本次管理展开复用 `AgentChannelsSection`，不增加配置 writer。

## 开源对照（2026-11-07 阅读）

- [OpenClaw multi-agent routing](https://docs.openclaw.ai/concepts/multi-agent)：区分 agentId、accountId 与 binding，明确账号所有者及会话隔离。借鉴身份拆分，不复制其 Gateway 或 fallback 机制。
- [TencentCloud-Lighthouse/openclaw-wecom](https://github.com/TencentCloud-Lighthouse/openclaw-wecom/blob/main/README.md)：多账号以 accountId 作为路由/隔离边界。该仓库是对照资料，不是本项目当前安装的企微插件；不混淆其 Webhook 配置与本项目的官方长连接插件。
- [AstrBot Custom Rules](https://docs.astrbot.app/en/use/custom-rules.html)：规则绑定平台实例中的 UMO，不以用户显示名或对话标题识别会话。借鉴稳定身份验证，不引入其 Persona 配置体系。

## 本地验证

Node `/opt/homebrew/opt/node@24/bin/node`，使用现有锁文件匹配依赖；未升级依赖。

- 7 文件 **51 项**：Bot 选择/冲突/过期目标、三个已安装平台入口、取消无副作用、总览更新/归档撤出、连接未知、原向导创建重试与凭据 QR 失败、原 Channels 导航。
- 5 文件 **29 项**：原 Channel 原子更新/删除、OpenClaw 配置与 compat runtime、隔离 loopback reply transport。覆盖请求隔离和最终回复顺序；不等同真实平台收发。
- TypeScript、定向 ESLint、diff whitespace、测试分类、Vite moxbot Web 构建、主题 CSS 检查通过。依赖边界检查 0 error / 20 处未改动文件 orphan warning；构建保留大 chunk 提示。本地日志保存于交付工作区 `work/MB-IM-BINDING-20261107/logs/`。
- Codex 内置浏览器对真实组件夹具验证：1280×720 浅色，390×844 深色；绑定选择传回 `telegram → research`、取消返回、展开/收起管理；窄屏 scrollWidth=innerWidth=390，无横向溢出。
- 页面使用**合成数据**，没有真实密钥、平台连接、消息发送或配置写盘；不是原生客户端或真实账号验收。
- 截图：`evidence/bindings-light.png`、`evidence/bindings-narrow-dark.png`、`evidence/bot-picker-narrow-dark.png`。可复现页面：`/__fixtures__/bot-im-bindings.html`。

## 交付与发布

仓库 `https://github.com/heavenzhang/MoXBots.git`；分支 `codex/im-bot-binding-20261107`；基线 `bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2`。本文件不自写包含自身的 SHA，精确提交写外部交接 JSON。

唯一涉及单元为 desktop/macOS-arm64/updater/sharedCI/main，沿用会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 统一独立审阅、CI、合入、版本和下一未冻结批发行。开发会话只运行本地检查，任务分支 push 不触发 test.yml（只匹配 main/dev/** 与 PR）。无服务端/Host/mobile/网站发布，无数据迁移或新权限；回滚使用原 owner 已验证旧客户端制品。当前无本任务发行版本、tag 或制品摘要。

## 未完成与下一步

用户已回复「你就用我的飞书来验证就好了」，恢复后沿用此授权，以既有私聊配对的本人账号做单条受控消息测试。不得把插件已登记、浏览器夹具或回归 PASS 当作真实平台已连通。原 owner 接收精确 SHA 后执行必要集成检查、核实远端 main 包含改动、按统一发布流程制作候选并完成安装版真实路径验收。

执行由当前 Agent 完成；无子 Agent，无独立审阅结论。实际 Token/费用未统计，不估算节省。


## 恢复后的真实飞书预检查（2026-11-07）

- [x] 重新核实开发分支干净、远端分支为原源码提交；当前远端 main `a650939d2c38b8dc04750e282b159ddaac8ea346` 仍未包含本任务成果。
- [x] 既有飞书机器人凭据通过官方 `tenant_access_token/internal` 校验；`bot/v3/info` 返回 code=0、应用启用；既有配对用户 `contact/v3/users` 返回 code=0。原始身份 ID 仅留本地私有证据，不进入 Git。
- [x] 当前 MoXBots 0.5.43/build543.4 尚无飞书渠道/插件；旧客户端保留一个飞书身份；进程核查未发现运行中的 plugin-bridge。历史 health 的 online 状态是旧观测，不当作当前在线证据。
- [ ] 经现有设置/生命周期入口把既有身份绑定到 MoXBots 中原 ID 的 Bot；不直接覆写全量配置，不复制旧 Session/health，不启动第二个竞争连接。
- [ ] 沿该渠道向用户本人已配对私聊发出一条验收消息，读取平台回执；本人回复后核对 Rust admission → SessionEngine → 同一 IM 会话回复。
- [ ] 本次新 UI 安装版核查仍待原 desktop owner 发布，既有 543.4 技术联调不能冒充新 UI 已发布。

私有证据在工作区 `work/MB-IM-BINDING-20261107/feishu-preflight.json`；不含 token/secret。桌面负责人当前协调 543.5，已请求设置窗口使用时段并通知飞书测试授权更新；未收到窗口交接前只做独立准备。没有发送测试消息或更改用户绑定。


## 当前主干同步

开发分支已正常 merge `main a650939d2c38b8dc04750e282b159ddaac8ea346`。唯一冲突为 `.agent-sync/plan.md` 的末尾追加，保留两边全部任务/发布归属。16 个产品/测试/夹具文件的本任务字节与原 `f8dc56e4` 一致；合并后再次实跑 12 文件 80 项回归、TypeScript 均通过。此次为开发分支同步，不代表远端 main 已接收本任务。
