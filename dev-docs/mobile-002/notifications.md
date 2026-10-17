# MOXBOTS-MOBILE-002 — 会话提醒

当前仍未完成真实推送、冷启动、Host 来源与真机验收，不是可发布完成状态。

## 手机端流程

- 账号与设置 → 会话提醒；系统权限与账号内的提醒登记分开显示。只有用户点击启用才申请权限；读取状态不会弹权限框。
- 使用 Expo58 的原生 APNs/FCM 地址，不使用 Expo Push Relay。地址仅经过单次内存和原生 Rust 请求，不写 JS 存储或日志；账号 bearer、E2EE 私钥与附件字节仍不进入 JS。
- 安装 UUID、服务端 endpoint 与当前 instance/principal/device 的绑定由 Rust 和 OS SecureStore 管理。用户启用用 `notification.register`，OS token 轮换用受本机已启用状态约束的 `notification.refresh`，不能反向重新启用。
- 关闭先由原生 owner 记为待确认，再请求撤销；只有确认后显示未启用。网络失败保持待确认，可重试同一登记。退出账号继续原有注销流程，推送故障不阻止本机退出。
- 通知只含随机 eventId 和固定通用提醒，不含会话文字、文件名、审批选项或可执行 URL。
- 点击通知后：Rust 兑换 eventId → 当前 Bot 目录 → UI 再确认目录内 identityKey/agent/online → 原 Session snapshot 与 journal → 打开会话。不会自动 start/send/respond/stop。
- 失败允许重试或忽略；仅在当前进程抑制重复冷响应，后续显式点击同一通知仍能重新读取。未知状态不重放会话操作。
- 会话页继续单个工具条与48px静止输入区；提醒设置独立展开，不增加常驻状态栏。

## 原生接口

| Intent | 输入 | 输出 |
| --- | --- | --- |
| notification.status | version=1 | notification：disabled/enabled/unconfirmed、provider、errorCode |
| notification.register | provider、token | 同上；安装标识由原生管理 |
| notification.refresh | provider、token | 仅刷新当前已启用的同 provider 登记；不得启用缺失或待确认记录 |
| notification.disable | version=1 | 同一登记可明确重试，未确认不声称成功 |
| notification.open | eventId | 当前 targetId、identityKey、agentId、sessionId；只有只读定位 |

所有对象闭合，桥接输出不含 token、endpoint ID 或账号凭据。原 `session.remote.v1`、`session.assets.v1`、`session.mobile.v1` 与原回执所有者不变。

## 安装与配置

`expo-notifications`、`expo-application` 通过当前 Expo58 的 `expo install` 安装，原生包需重建。配置参考 [Expo58 Notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/)。

Android 可通过构建环境变量 `MOXBOTS_ANDROID_GOOGLE_SERVICES_FILE` 指向现有 Firebase **客户端**配置文件的绝对路径；不把 service-account 私钥交给手机构建。未配置的安装包会明确提示推送未就绪，不能当作启用成功。iOS 需要现有开发者账号对应的正确 bundle ID、推送 entitlement、签名和 provisioning；不能用 macOS Developer ID 代替 iOS 签名。

服务端默认不开启通知配置，不自动部署、不创建 Firebase 项目或 Apple 凭据。Provider 私钥与 OAuth 服务账号仅从服务端约定的私有文件读取；不能进入 Git、前端或日志。

## 验收记录与待办

- [x] 主Agent：应用类型检查、lint、50项策略测试；具体日志 `/tmp/moxbots-mobile-notification-ui-{typecheck,lint,policy}.log`。
- [x] 非实现者源码复核：权限/登记状态、失败反馈、token轮换与手动关闭的竞态；已据发现修复。该审阅未获得 IAB，不能称独立运行态验收。
- [x] 主Agent实际 Web 合成流程：账号入口、启用/停用、系统权限单独展示、有效 hint 定位到原会话并保留草稿、已停用 hint 拒绝、重试/忽略后继续使用列表。证据 `/tmp/moxbots-mobile-ui-review-002/primary-notification-settings-separated-pass.png`、`primary-notification-ignore-pass.png`。未验证本次窄屏布局。
- [x] Rust SDK已集成为 `bd9034aa`；主Agent104项连接测试、严格clippy和原桌面reader18项回归通过。日志 `/tmp/moxbots-mobile-notification-root-sdk-tests.log`、`/tmp/moxbots-mobile-notification-reader-tests.log`。
- [x] Android通知版Rust原生库重建通过（8.70s）；应用Debug构建和27项仪器测试通过（1m29s，0失败/0跳过）。新增真实JNI未登录通知拒绝与禁止JS指定installationId断言。日志 `/tmp/moxbots-mobile-notification-android-{native,regression}.log`。
- [x] 原生制品源码摘要覆盖实际导入的共享AgentNet/lifecycle文件，APK核验拒绝与当前干净源码不符的原生库；旧摘要与新版scopeVersion=2不可直接比较。
- [x] SDK错误码与界面提示已对齐；主Agent复跑typecheck/lint/50项策略通过；实际Web合成流程复验未启用提醒的提示及忽略返回列表。证据 `/tmp/moxbots-mobile-ui-review-002/primary-notification-native-contract-notice.png`。
- [x] Android内嵌JS测试包构建、16KiB/签名/当前原生源码核对与专用模拟器安装通过；仍为Debug test key，原生UI/账号等未验收。详见 `android-build.md`。
- [x] 服务端provider包及两轮主审修复已集成：默认关闭、固定origin、APNs JWT缓存与HTTP/2、FCM严格回执、未配置provider拒绝、当前session/device重验及剩余预算领取。主Agent服务168项测试通过（5项既有ignored）、严格clippy通过；core14项测试及严格clippy通过。日志 `/tmp/moxbots-mobile-notification-root-{service,core}-tests.log`。包级fmt通过；未对冻结crypto/protocol依赖做格式化。
- [x] 非实现者再次源码确认“忽略后冷响应复活”的修复闭合；显式点击同一event仍可重开。仍不称独立运行态验收。
- [x] iOS语音Event默认let字段的初始化器编译错误已用本机Swift复现并修复；提取实际Event定义后typecheck通过。新增现有macOS CI内的真实iOS双target Rust和原生Swift核心预检，结果待远端；不包含Expo wrapper/链接/签名/运行态。
- [ ] 新检查点准确源码CI；iOS原生核心预检的实际结果与可能的修复。
- [ ] Host 事件来源契约：云端当前不能证明 Host 私有 Bot/session 归属，不能新增任意登录设备可伪造来源的 public hint 路由。受信内部入口不能替代真实来源接入。
- [ ] 真实 APNs/FCM 凭据、物理设备送达、后台/冷启动、过期登录恢复和旧授权失效验证。
- [ ] iOS SDK协议与签名、真实Host/账号/语音、主干交付和内部签名分发。

## Host来源接入的下一步

现有AuthStore登录会话携带登录时提交的deviceId；仅用Bearer加DeviceStore记录查询，不能等同于已证明持有该设备私钥。通知来源接口仍未开放。下一包应从原Session owner生成有限事件，由保有既有设备私钥的Rust连接器提交：复用现有challenge/PoP能力，在通知存储中把challenge绑定当前session_handle、设备binding/generation和确切pointer；验证单次proof后才生成hint。不修改冻结的crypto/protocol，也不让调用方指定其他principal或source device。云端只验证来源设备，手机仍重新读取实际Bot目录与Session；提示本身不授予执行或审批权限。该设计尚未实现或通过真实Host验收。
