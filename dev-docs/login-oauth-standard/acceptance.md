# MOXBOTS-LOGIN-RETURN-02 — 验收与发布接续

日期 2026-10-22。当前基线 main 263b1cf5c064c7ee5f375fd5c3f5697854e35723，分支 codex/login-oauth-standard-20261022。最终冻结 SHA 由提交后交接和发布记录提供，不把本文件中的未来描述当已完成。

## 已完成的源码与本地验证

- 产品OAuth AS标准授权码/S256、随机loopback、单次token兑换、严格state/redirect、旧协议隔离；Dex OIDC验证及原AuthStore/设备/凭据提交继续复用。
- 新桌面路径不请求旧start/poll/ACK/cancel，不写Pending Keychain；已收token可在内存恢复会话检查/保存，未知兑换明确重登。提交后沿原主窗激活路径返回前台。
- 固定实例单一登录入口，隐藏URL/CA/完整授权链接与手动检查；等待/保存/失败提示按真实阶段区分。
- 服务端作者实际运行：`CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-service cargo test --manifest-path services/agentnet/Cargo.toml --lib`，210 PASS / 0 FAIL / 8既有手动ignore。相同target的 `cargo clippy --manifest-path services/agentnet/Cargo.toml --all-targets -- -D warnings`、`cargo fmt --manifest-path services/agentnet/Cargo.toml -- --check` PASS。5个新增定向OAuth流程测试亦通过。主Agent审最终服务端diff，要求并确认修复重复/并发callback毒化及token extractor标准error边界；不重复重跑完整suite。
- 主Agent `CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-native cargo check --manifest-path src-tauri/Cargo.toml --lib --tests` PASS。`DYLD_FALLBACK_LIBRARY_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx` 同target运行 `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_network::owned_ -- --test-threads=1`，57 PASS / 0 FAIL。原文 `/tmp/login-oauth-standard-native-{check,tests}.log`。
- 新增9项native传输测试包含真实TCP wrong-state后合法回调、重复回调、单次form+S256/并发singleflight/缓存、响应丢失不再兑换、取消在途结果可精确撤销、拒绝回显、clone/lastdrop及Send约束；新增manager真实TCP整合测试实际证明 `/auth/session` 首次503后复用同一token恢复、没有旧poll/ACK或二次token，取消只revoke该staged session。既有凭据事务/身份恢复回归通过，但不是实际Air Keychain验收。
- DOM两文件28/28 PASS；TypeScript与定向ESLint PASS。命令使用已安装bundle Node24和本机已有依赖，不安装/重启日常App。首轮Rust staging缺CLIProxy和Node资源、一个Send适配器编译错误已修复后重check；成功日志为最终结果。注册表22/22 PASS（`/tmp/login-oauth-standard-registry-tests.log`）；Native仍有既有unused/dead_code warnings，不宣称原生Clippy零警告。
- 主AgentIAB在后台实际点击生产JoinNetworkDialog组件的隔离合成夹具，常规1280和iframe内390x844视口检查单入口、等待和失败重启，无按钮重叠；保存阶段用已声明fixture投影。截图/夹具位于ignored `output/login-oauth-standard-qa/`。这是UI模拟，不是浏览器真实授权或OS凭据结果。

## 独立审阅

Native worker未实现manager/client/registry/UI，已只读确认新旧transport隔离、取消/late-token清理、缓存重试、原principal/device保持和原commit/恢复链。Service worker未实现native module，已独审oauth2库、S256/state/Host/loopback、单次兑换、TLS/代理/redirect和取消栅栏，范围内无阻断；仅有短期内存副本及可选error字段组合两个非阻断建议。主Agent负责整体取舍、最终diff、真实UI和后续生产验收。

## 发布和真实验收（尚未完成）

- [ ] 精确源码SHA推送与owner接收。
- [ ] owner统一CI、main合入及远端main包含改动核验。
- [ ] Cloud owner `01a12b99-7b38-78b1-831f-9c60257d386a`：fresh quiet/admission、备份、精确服务制品、程序切换、旧新兼容与回滚记录。已只读确认既有Nginx `/auth/`前缀覆盖，无需新增Dex client/config。
- [ ] Desktop/combinedCI owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`：新未冻结批次版本/签名制品/摘要/正式下载与回滚，云先桌面后，不改5165或5168冻结字节。
- [ ] 用户原Air `c109300d-b8c9-45e3-9246-cb1e31d7f42b` 新构建真正登录，保持原principal/device；正常Cmd-Q退出重开仍登录。需要真人GUI反馈及服务端同原设备的只读佐证，不能以其他Mac/Ready/HTTP200替代。

此前5165签名候选和旧云端replay/ACK修复属于上一批证据，不证明新标准流程上线或原Air成功。当前没有本批生产写入或真实OIDC/Air验收；用户已同意新包就绪后按下载链接操作，无需再请求一般发布意愿。

最终增量核查：token已收到但 identity inspection 暂时503时，native阶段提升为verifying_identity，UI更新native阶段并解除旧browser TTL计时；新hook测试证明3秒授权期限过去10秒后仍可接收真实native成功。原生TCP整合测试增加该阶段断言；非实现者复审terminal/expiry/busy/cancel边界无阻断。

本轮沿用两位既有本地协作者，服务端和native传输文件互斥，主Agent整合manager/UI并总审。未升级或降档模型；未调用外部模型，既有本地上下文和工具足以完成该范围。没有可准确归属的token/费用实测，不编造节省比例。
