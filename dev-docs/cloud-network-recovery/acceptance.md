# CLOUD-NETWORK-RECOVERY-20261018

## Outcome and boundaries

修复网络列表将登录失效、连接超时和不可用统称离线的问题。连接未Ready时，设备卡片和详情将缓存状态显示为“设备状态未知（网络未连接）”，不继续显示缓存在线/同步圆点；恢复Ready后按服务器设备状态展示。只有Ready网络内的offline设备呈现离线/最后在线。

- 共享纯投影 `networkStatus.ts` 同时驱动选择器与banner；已确认登录失败优先于transport中间态，系统凭据授权提示保留。
- HTTP请求和响应读取仅在reqwest明确is_timeout时投影 `NETWORK_CONNECTION_TIMEOUT`；连接拒绝、协议/认证等错误保留原fallback。使用现有Actor恢复，不新增重试writer或修改系统代理/TLS信任。
- 读取超时为连接超时；不确定写仍为unconfirmed，不自动重放。身份、授权、撤销、配额、凭据和发布owner不改变。

## Verification

- 初轮JS103项全过；补官方reauth5态后NetworkSelector30/API35全过。最后108整组107成功，既有onboarding等待用例一次在高负载超过原1秒门限；原断言、门限未改，单独复验通过，之前两轮整组通过。保留这一轮失败记录，不把重试写作零失败。
- 最终五个相关DOM/API/Host套件150/150通过。TypeScript全量 `tsc --noEmit` exit0，PR首轮typecheck/lint阶段通过；本地全量ESLint、变更TS文件ESLint和diff-check通过。
- `cargo test --manifest-path src-tauri/headless-network/Cargo.toml --locked --lib`：208通过、0失败、2既有ignored；包含共享owned HTTP路径与真实loopback超时/连接拒绝，保持保存会话的错误语义。
- 主桌面官方账号模块由正常PR Rust/native CI另行验证；本地headless不能替代原生构建。
- P2 Host管理提示冲突已修复；两个Host套件41项、页面集成与缓存恢复4项通过。独立实际组件1280/760/390视口、选择器、卡片/详情与恢复流程复验通过，见[review-ui.md](review-ui.md)。
- 默认和MoXBots profile Web生产构建通过（既有chunk大小提示保留）；最终Host提示修复后的MoXBots构建通过。最终CI、主干SHA另见交付回执。
- 首轮CI39131394887：headless208测试通过，但本次新增测试夹具使用tokio::spawn被既有clippy红线拦住。已改为测试直接拥有的并发future/select，未加allow或降低规则；修复后208项再次通过，使用与CI一致的disallowed_methods/disallowed_macros严格clippy通过；新一轮完整CI继续记录。

## Live recovery evidence

公共instance和Dex发现接口正常TLS可响应200，Python TLS1.3握手成功；这不代表桌面认证已恢复。独立同crypto/reqwest探针复现5秒超时后，继承代理/直连均发生过成功与超时，不能归因为某一代理设置。

云端指定发布owner于2026-10-18T13:12:14–16Z只读确认：原101 Host连接器freshReady、原PID/设备/实例/keygen不变；云目录epoch与连接epoch一致，云network/auth/Nginx active且NRestarts0。相关目标access_log关闭，不能以日志空白推断桌面请求未抵达。原生0.5.9客户端仍报owned-account5秒timeout和官方SPACE_REAUTH_REQUIRED，实际连接归属与恢复待桌面owner核对。

本轮无云服务重启，无绑定删除、系统代理/TLS信任修改或外部CLI权限启用。已装CLI不支持agent network-diagnose，network status因External Calls关闭被正常拒绝；没有绕过该权限。Mac有活动任务，未退出或更换程序。

## Deployment / acceptance remaining

人类已明确授权协调桌面和云发布聊天；已向原指定owner发送请求。桌面发行/安全启用/同账号登录与在线、设备状态、重启持久化真实验收仍开放。不从合成UI、HTTP200、主干合并或发布请求推断这些门已通过。

## Execution record

主负责人负责Rust、诊断、集成、主干和发布协调；network_status_ui（Sol medium）负责renderer，network_ui_review（Luna medium）独立页面验收。使用ai-yaoren-local纯内置模式，未调用外部模型。精确token/产品用量与费用未知，未估算节省。
