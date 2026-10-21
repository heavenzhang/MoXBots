# Native login transaction verification

验证日期：2026-10-21。工作区为 `/Users/zhangshaohua/Documents/Codex/2026-10-21/moxbots-login-transaction-02`，分支 `codex/login-transaction-02`，基线 `9c01aa370e607e7fd0404f4a3062f8ebed316fbe`。本记录对应集成提交前冻结的原生源码；最终候选以集成 owner 记录的完整 Git SHA 为准。

## 实际执行命令与结果

下列命令均在上述工作区执行。Rust 使用仓库固定的 `1.92.0`；Cargo target 是本任务独立缓存，不是共享 release target。

```sh
CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-native cargo check --manifest-path src-tauri/Cargo.toml --lib --tests > /tmp/login-return-02-native-check-frozen.log 2>&1
```

结果：exit 0，34.99s。原文为 `/tmp/login-return-02-native-check-frozen.log`。输出仍有 build-script、未使用字段/函数及 `remote_assets_target.rs` 未使用 import 等警告；本次 native 检查没有使用 Clippy 或 `-D warnings`，不能表述为零警告验收。

```sh
DYLD_FALLBACK_LIBRARY_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-native cargo test --manifest-path src-tauri/Cargo.toml --lib agent_network::owned_account_desktop::tests -- --test-threads=1 > /tmp/login-return-02-native-tests-frozen.log 2>&1
```

结果：exit 0；32 passed、0 failed、0 ignored。最终增量编译/链接 38.05s，测试执行 0.15s。原文为 `/tmp/login-return-02-native-tests-frozen.log`。

以下两组直接执行上一步生成的同一测试二进制，没有另行构建不同制品：

```sh
DYLD_FALLBACK_LIBRARY_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx /Users/zhangshaohua/.codex/cache/login-return-02-native/debug/deps/app_lib-bca7b7822d77ef8b agent_network::registry::tests --test-threads=1 > /tmp/login-return-02-native-registry-frozen.log 2>&1
```

结果：exit 0；22 passed、0 failed、0 ignored，2.54s。原文为 `/tmp/login-return-02-native-registry-frozen.log`。

```sh
DYLD_FALLBACK_LIBRARY_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx /Users/zhangshaohua/.codex/cache/login-return-02-native/debug/deps/app_lib-bca7b7822d77ef8b agent_network::owned_login::tests --test-threads=1 > /tmp/login-return-02-native-client-frozen.log 2>&1
```

结果：exit 0；13 passed、0 failed、0 ignored，0.61s。原文为 `/tmp/login-return-02-native-client-frozen.log`。三个互不重复的模块合计 **67 passed、0 failed、0 ignored**；这是定向测试，不是全部原生测试套件。`git diff --check` 也已执行并返回 exit 0。

## 本机资源与 Swift 运行时

首次原生检查在 build script 遇到缺失的 CLIProxy manifest 与桌面 bundle resources。仅将本机 `/Applications/MoXBots.app/Contents/Resources` 对应资源复制到当前 worktree 的 ignored staging；沿用并通过现有签名、来源 pin 与资源校验，没有修改校验逻辑，也没有将这些资源作为本次发布制品。

首次测试已链接，但进程启动被 dyld 阻止：`Library not loaded: @rpath/libswift_Concurrency.dylib`，退出为 SIGABRT。原文保留在 `/tmp/login-return-02-native-tests.log`。找到本机 Xcode 的 `swift-5.5/macosx` 后，以以上每条命令自身的 `DYLD_FALLBACK_LIBRARY_PATH` 解决测试运行时定位；没有修改源码、构建脚本、系统设置或全局环境。最后三份 `*-frozen.log` 才是成功结果。直接二进制的文件名属于这次本地 Cargo 输出，后续重新构建应读取对应 Cargo 输出，不假定该文件名长期不变。

## 覆盖行为

- 真实 manager `poll` 的 loopback 失败出口：已暂存 grant 在 `/auth/session` 503 后释放单飞状态，显式 Retry 使用同一 token，重新验证后推进到 identity 查询；测试拒绝任何 `/auth/login/poll` 重复消费。
- 已完成 identity 验证但保存尚未提交的 grant，在恢复时重新访问 `/auth/session`；真实 401 被当前 client 解析为 `OWNED_SESSION_INVALID`，得到 `canRetry=false`，不会返回 Authenticated、创建提交回执或触发 ACK。
- legacy 响应丢失必须 Restart Required；协商 replay 的传输失败可安全重试；本地保存失败保留 grant；信任、身份和会话失效保持拒绝。
- 已暂存 session 可跨原浏览器事务 TTL 恢复，但受自身 session 有效期限制；提交回执可重复观察，late cancel 不撤销已经提交的会话。
- driver 单飞及退出期间的 Retry 排队；feature disable 与 publication 的共享锁顺序；延迟首登保留用户后选网络，原选择未变时选择新连接，existing reauthentication 保留当前选择。
- client 的 replay 兼容协商、未协商能力拒绝、ACK 仅发送设备/事务/PKCE proof，以及既有服务端会话校验等回归。

## 冻结源码校验值

| 文件 | SHA-256 |
| --- | --- |
| `src-tauri/src/agent_network/owned_account_desktop.rs` | `25cb859443fd23a25d18a250489118f676c2cda4e7d4be77c148c464812ac7ab` |
| `src-tauri/src/agent_network/registry.rs` | `3b4f5ecabc79c9ec077085aae0c9f0cfbbf3940920bf372fa0151d3fe2104289` |
| `src-tauri/src/agent_network/commands.rs` | `de58bce570a3365f3806c32e96c3057dc267411001f4c90af8e7dac9e2f7e987` |
| `src-tauri/src/agent_network/owned_login.rs` | `40b1e6987b8d69c35623f81df788d85c9c36ec8cd44b72cbd38e0f88256503bb` |

## 使用边界

这些结果验证本地 macOS default profile 的类型检查、状态/并发逻辑和隔离 loopback HTTP；没有执行真实 Keychain 凭据写入、真实 OIDC/原 Air 登录、生产请求、SSH、共享 CI、正式构建、提交或发布。本地测试所用假凭据不能证明生产身份、权限、凭据保存、设备 Ready 或业务验收；没有以本地 Swift 设置代替正式客户端的运行时打包验证。正式 MoXBots profile、固定 credential reader、组合精确 SHA CI、云端先行兼容发布、新签名桌面制品和原 Air 真实路径仍由既定单元 owner 分别验收。临时日志是本机原文，需要跨机器追溯时须随证据包保存，不能假定 `/tmp` 永久保留。
