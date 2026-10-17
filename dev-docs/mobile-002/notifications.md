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
- [x] 238a40cb 的远端 macOS iOS 预检步骤通过：真实 iphoneos/iphonesimulator SDK 的 Swift owner 类型检查与双 Rust target 检查；完整工作流尚未结束，不能称全绿。
- [x] 来源代码已接入：原 Host SessionStore/worker 筛选、冻结 worker birth scope、持久化有界 outbox、私有 Unix IPC、原 Rust 设备签名，以及服务端当前 session/device/challenge 精确绑定。已完成主审并修复跨账号竞态、确认记录占满容量和提交后读回缺口；组合运行态联调仍开放。
- [ ] 真实 APNs/FCM 凭据、物理设备送达、后台/冷启动、过期登录恢复和旧授权失效验证。
- [ ] iOS SDK协议与签名、真实Host/账号/语音、主干交付和内部签名分发。

## Host来源接入的下一步

现有AuthStore登录会话携带登录时提交的deviceId；仅用Bearer加DeviceStore记录查询，不能等同于已证明持有该设备私钥。来源接口已实现且随通知配置默认关闭，尚未部署。原Session owner生成有限事件，由保有既有设备私钥的Rust连接器提交：复用现有challenge/PoP能力，在通知存储中把challenge绑定当前session_handle、设备binding/generation和确切pointer；验证单次proof后才生成hint。不修改冻结的crypto/protocol，也不让调用方指定其他principal或source device。云端只验证来源设备，手机仍重新读取实际Bot目录与Session；提示本身不授予执行或审批权限。源代码实现已集成；主Agent已复跑185项headless、34项原Host组合与105项SDK回归。没有真实Host/provider/手机端送达验收，不能据此声称已可日常使用。

### iOS真实SDK首轮预检

CI39071442301的macOS预检已实际编译通过device Rust目标，Swift随后发现成果缓存调用不存在的解析方法、跨类型`record`比较错误；这不是本机许可阻断。原始日志 `/tmp/moxbots-mobile-ios-preflight-ci-first.log`。已改为使用同文件内已有的受验证descriptor/project转换，并对两侧record显式取String。原生SecureRecords、NativeArtifacts和NativeUploadScheduler在本机实际Swift/macOS SDK的联合typecheck通过（`/tmp/moxbots-mobile-ios-artifact-core-macos-typecheck.log`）；这不代替iOS SDK或运行态。预检顺序改为先检查两套真实SDK的Swift源码，再下载/检查Rust targets，以便编译错误更快反馈。修复后的iOS device/simulator完整核心预检仍待新CI；Expo wrapper、链接、签名和真机继续开放。

### 完整 iOS 应用构建门禁

新增现有 Test 工作流的手动 `mobile_ios_app=true` 路径，在 GitHub macOS26 上使用真实 Expo prebuild、CocoaPods、Rust XCFramework 与 Xcode Release 模拟器链接；普通 push/PR 保留原自动检查。该路径不使用 Apple 账号或签名，不接受本机 SDK 协议，不替代真机安装。产物要求内嵌非空 main.jsbundle 和正确 bundle ID，保留源码 SHA、原生 provenance 与构建日志。新增构建尚未执行完成。

### 来源接口整合后主Agent回归

185项headless、34项Node原Host/asset/receipt组合、105项SDK、175项service（5既有ignored）、17项notify-core与HTTP定向10项通过。service及core各自strict clippy通过；SDK/headless按现有redline门禁通过。第一次core严格检查实际失败，已由原实现者通过SourceChallengeInput修复；没有降低门禁。完整root lint/依赖/文档核验通过。新版Android27项仪器、离线APK和安装通过；真实跨进程来源联调与当前CI继续开放。
