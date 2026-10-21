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

## PR186 首轮 CI 修正

首轮候选 bce4b094ec3283d1a370df3add72f55b9a4ca184，Test run39660350758 / service run39660350905。Test发现共享owned_login模块误引用桌面专属owned_oauth，导致headless/mobile/iOS编译失败；另两处上层账号入口10项DOM测试还操作已移除的URL/手动检查控件。不能将本地定向测试通过当作完整CI通过。

修正将start_oauth/receive_oauth实现移入桌面专属owned_oauth，仅在共享OwnedClient暴露只读origin/既有reqwest transport借用；不改变TLS、token或设备身份边界，不向Host/mobile引入桌面OAuth依赖。服务端未变化。两处既有上层测试改用浏览器返回focus，固定实例确认没有可编辑URL且调用精确原issuer/connection/revision；保留取消、迟到结果及账号隔离断言。

修正后的实际本地验证：headless-network与mobile/connection各自cargo check --all-targets均PASS（日志 /tmp/login-oauth-standard-{headless,mobile}-check.log）；desktop owned定向57/57 PASS（/tmp/login-oauth-standard-native-repair-tests.log）；四份登录相关DOM测试84/84 PASS（/tmp/login-oauth-standard-ui-repair.log）。Service worker独立只读审阅模块分离修正，无阻断。后续由既有desktop owner推送修正候选，自动PR CI仍须重新确认；main、服务发布、桌面发布、Air真实验收保持未完成。

第二轮PR head4206b461b0f251f5f7c4c066a378bf63a3ee522b（仅为首次push前补提交rationale，源码tree与896aa5a79一致），Test39662590446的完整native 1783 PASS / 0 FAIL / 8 ignore，但Clippy redlines拒绝新增manager TCP测试内两处原始调用。修正仅将测试server spawn改为tauri::async_runtime::spawn、localhost browser改为crate::local_http::builder，不增加allow或放宽门禁。主Agent实际执行与CI相同的 `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D clippy::disallowed_methods -D clippy::disallowed_macros`，exit0（仍有既有普通warning）；该真实TCP重试测试定向1/1 PASS。日志 /tmp/login-oauth-standard-clippy-repair.log 与 /tmp/login-oauth-standard-redline-test.log。生产逻辑及服务代码不变；再次交owner更新同PR并收集新精确head完整CI。

同轮macOS CI在并行agent_network回归中发现新增listener last-drop测试1秒旧地址连接探测超时（274PASS/1FAIL/1ignore，日志 /tmp/login-oauth-standard-ci-macos.log）。代码审阅未见Inner自持有，单凭端口可连接不能区分取消调度与被其他测试重绑；不把未复现当无问题。主Agent原测试本机同过滤器默认并行275PASS/1ignore后，将测试改为Weak owner释放和原listener AbortHandle完成态直接验证，仍通过真实TCP callback验证clone保活，保留原1秒上限、无ignore或production修改。非实现者独立复审通过；修正后按macOS CI agent_network默认并行275PASS/0FAIL/1ignore（/tmp/login-oauth-standard-network-parallel-repair.log）。

第二轮其余完整CI已结束：service39662590434 SUCCESS；Test39662590446除上述两项已修正测试问题外，各job成功，条件iOS simulator跳过。不能以此替代最终新head CI或主干。下一步仅一次提交推送最终测试修正，由原owner重新采集精确head完整CI。

最终listener测试修正后，再执行相同all-targets Clippy redlines命令exit0（/tmp/login-oauth-standard-clippy-final.log）；既有普通warnings保留。
