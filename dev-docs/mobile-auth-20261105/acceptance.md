# MB-MOBILE-AUTH-20261105 验收

用户要求：按已诊断问题修改手机频繁退登与多余登录确认。源码与本地测试已按下述证据验证；main、实际页面、云/手机包及真机分别开放，不把本地联调当作生产。

诊断：mobile/connection/runtime.rs保存账号但不续期，expires_at后投影expired；前台loadAccount回到登录页。服务默认24h（线上实际TTL未读取）；已有/v1/session/renew及设备证明。原生登录每次重置授权勾选，并通过3秒poll显示正在确认登录。

当前baseline：remote main065f2b6c8fb2aff58e774000909990b531ff8eb8。工作树独立，保留其他任务。Expo58文档 https://docs.expo.dev/versions/v58.0.0/ 已阅读；未增加依赖或更新版本。

## 验证记录

- `CARGO_TARGET_DIR=/tmp/moxbots-mobile-auth-connection-target cargo test --manifest-path mobile/connection/Cargo.toml --locked --lib`：155 PASS / 1 原有 ignored（完整证明链另显式执行）。新增15项覆盖持久化/读回失败、401与503分类、时钟回退、缺少同设备key、logout远端挂起截止及冷缓存不得复活。
- `CARGO_TARGET_DIR=/tmp/moxbots-mobile-auth-agentnet-target cargo test --manifest-path services/agentnet/Cargo.toml --locked --lib --no-fail-fast`：217 PASS / 8 原有 ignored；只允许verified native password选择30天，Web/Host/OAuth隔离、兼容DB重开、幂等、撤销、过期和同设备proof HTTP测试通过。
- `CARGO_TARGET_DIR=/tmp/moxbots-mobile-auth-headless-target cargo test --manifest-path src-tauri/headless-network/Cargo.toml --locked --lib`：226 PASS / 2 原有 ignored，含共享owned_client恢复/撤销。
- Node24 `npm run test:policy`：117 PASS；`npm run typecheck`、全mobile `npm run lint -- --no-cache`通过。
- 服务 `cargo clippy --locked --lib --tests --no-deps -- -D warnings`通过。最终mobile Clippy等待完整链运行释放target锁后执行。
- 独立审阅mobile_auth_review只读复核生产diff：4项初稿安全缺陷修复后未见P1/P2。实际修复为候选必须原key/handle证明、冷验证失败不留已验证缓存、仅真实401可判死、退出远端清理总预算小于外层截止。该审阅未操作UI/CI/部署。

## 可观察行为与兼容

- 原生password登录产生30天窗口；每次合法新candidate续期滑动，同candidate幂等不再滑动。旧session原TTL不追溯变更，升级后首次过期需正常登录一次。
- mobile最多6小时发起一次维护轮换；旧短TTL按半窗提前（最小30秒）；pending恢复不受clock节流。账号status仍校验当前bearer，401退到expired，503/超时保留当前账号与磁盘证据。
- 原account JSON三字段不变，新pending/clock只在OS私有record；待确认轮换先持久化+readback，后HTTP及scope校验，后account写回；已确认轮换立即deactivate旧snapshot，即使account写失败也保留候选恢复。
- 冷恢复先检查candidate并以其建立既有device key proof，核对sessionHandle/keygeneration/fingerprint；不先拿过期old bearer阻断恢复。只读status不能隐式注册缺失key。
- 退出在远端不确定时仍清本机account，保留加密撤销候选；old alias已过期也会DELETE candidate。通知清理在旋转已提交时用确认后的candidate，随后两个token均撤销。
- 登录前不再强制额外checkbox；明确的“同意并登录”动作携带原consentAccepted:true，授权说明继续可见。Ready事务立即poll一次，后续保留原single-flight状态恢复，不重发密码。

## 完整本地链与红绿记录

完整测试命令：`CARGO_TARGET_DIR=/tmp/moxbots-mobile-auth-connection-target MOXBOTS_FULL_MODE=mobile-renewal MOXBOTS_FULL_NODE=/opt/homebrew/opt/node@24/bin/node MOXBOTS_FULL_SERVICE_TEST_BIN=/tmp/moxbots-mobile-auth-agentnet-target/debug/deps/myagents_agentnet_service-cd567fef1f7bc63c MOXBOTS_FULL_HOST_TEST_BIN=/tmp/moxbots-mobile-auth-headless-target/debug/deps/myagents_host_network-1146d4b99fc52e7f cargo test --manifest-path mobile/connection/Cargo.toml --locked --lib runtime::full_host_e2e_test::original_mobile_wss_host_chain -- --ignored --exact --nocapture`。

使用原AuthStore、真实TLS/WSS与设备key，SSO身份为隔离合成身份，OS为原EncryptedIdentityStore测试KEK；不等于真实Dex、手机Keychain或生产Host验收。分别运行mobile-renewal（真实等待old expiry并验candidate恢复/撤销）和text（原业务/会话链，新环境），避免把主动logout留下的joined旧设备套用原single-offline-peer断言。

已保留红运行：第一次证明候选恢复后发现大async future栈溢出，修serialized request为Box::pin；第二次因对已enabled mount重复调用default-disabled fixture断言失败；第三次退出后额外offline设备使旧单offline断言循环并触及原proof容量。没有扩大proof配额、删除回归或清生产状态；按不同场景独立生命周期运行。最终PASS回执待本节补充。

## 页面与外部门禁

内置浏览器工具返回“Local browser use is disabled in Work settings”。已异步请求独立Chrome访问本机页面的许可，尚无回复，未访问用户Chrome或通过其他UI技术绕过。Expo测试服务仅localhost:8087，`EXPO_PUBLIC_MOBILE_QA=1`仅web开发fixture。登录实际交互、320/390布局和真机均未验。

真实Dex容器集成未执行：本地Docker daemon socket目标不存在，未启动Docker或访问远端。生产service/密码适配器现有发布owner负责最终集成。

## 发布/回滚

sharedCI/main owner01a12bc2；cloud/mobile owner01a12b99。先服务兼容升级，备份当前auth DB及原binary/config；新列为可空加法迁移，旧binary继续读写原列，保留当前DB凭据，回退服务会恢复旧配置TTL续期行为。再由mobile owner分配下一未冻结build/版本与不可变tag/IPA摘要；本任务未擅自分配版本、覆盖build9/10或替换设备。旧account格式保留，旧包可读；新pending只能由支持它的版本处理，回退前应确认无未解决轮换或保留加密恢复证据。

## 真实验收

Kevin iPhone未连接，未修改设备/登录账号，未发业务消息；不把本地fixture当真实设备或生产验收。
