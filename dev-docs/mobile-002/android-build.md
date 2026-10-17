# Android 内部构建与制品核验

当前为独立的 Expo 自定义原生应用，包名 `com.moxbots.mobileinternal`。源码、APK、模拟器安装、真实账号/Host 联调、签名分发分别验收。完整进度见 [plan.md](./plan.md)。

## 构建前提

- 仓库根 `rust-toolchain.toml` 指定的 Rust；Node24、JDK21。
- `ANDROID_HOME` 指向已安装 SDK；原生构建脚本使用 NDK27.1.12297006，或明确的 `ANDROID_NDK_HOME`。Android SDK 许可须已获用户授权并由工具接受。
- 安装根项目和 `mobile/app` 的锁定依赖，安装 Rust Android target。生成的 `mobile/app/android` 和原生 `.so` 不在 Git 中。
- 在 `mobile/app` 用 Expo prebuild 生成 Android 工程；配置来自 `modules/moxbots-remote/app.plugin.js` 和模块 Gradle/CMake 源码，不修改生成工程来修复打包。
- 如完整 Xcode 的新许可仍未接受，可对普通 Git/Android 命令使用 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`；这不能替代 iOS SDK 许可或构建。

## 执行

在仓库根构建 Rust 动态库，脚本生成同目录 `native-build.json`，记录 Rust 输入文件摘要、源提交、编译器及原始库 SHA-256：

```sh
node mobile/scripts/build-native.mjs android
```

在 `mobile/app` 构建应用；已运行专用测试模拟器时可附带原生回归：

```sh
./android/gradlew -p android :app:assembleDebug :moxbots-remote:connectedDebugAndroidTest --console=plain
```

回到仓库根，核验**应用 APK 本身**。配置工具目录后将报告写到一个尚不存在的 Git 外文件；脚本不覆盖已有证据：

```sh
ANDROID_BUILD_TOOLS="$ANDROID_HOME/build-tools/37.0.0" \
ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006" \
node mobile/scripts/verify-android-apk.mjs \
  mobile/app/android/app/build/outputs/apk/debug/app-debug.apk \
  /tmp/moxbots-mobile-apk-verification.json
```

核验要求应用 APK 中同时有 JNI 和 Rust 库。Rust 字节须等于构建记录中的输入，或等于相同 NDK `llvm-strip --strip-unneeded` 的精确结果；所有已打包原生库须为 arm64、ELF LOAD 对齐至少16KiB、无构建机绝对依赖路径，APK 的16KiB ZIP对齐与签名验证均须通过。报告也标明是否包含内嵌 JS、是否使用 Android Debug 测试签名。上述检查不证明真实业务可用或商店签名合格。

## 已观察到的故障及当前证据

Instrumentation APK 自带的 Rust 库曾掩盖应用 APK 漏包；16项原生测试通过时，应用 APK 仍缺少 `libmox_mobile_connection.so`。已通过模块 `main.jniLibs` 修复；保留测试 APK 的独立打包配置。不得只凭 instrumentation 或安装成功关闭应用启动门槛。

修复后应用构建及16/16原生测试通过，制品核验通过28个原生库。当前检查记录为 `/tmp/moxbots-mobile-apk-rust-production-check.json`，APK SHA-256 为 `0e35d824a3827f7c759405708d4933d3e9ccff2f5576fd9a7db2f110b2d58377`。它使用 Debug 测试密钥、没有内嵌 JS，依赖开发服务器；不是可日常独立使用或正式上架的发行包。后续修改必须重新构建及记录实际制品摘要，不沿用此结果。

`EXPO_PUBLIC_MOBILE_QA=1` 仅用于显式 Web 合成夹具。原生运行不以夹具替代真实设备、附件、麦克风或服务端能力。独立发行包还须验证离开开发服务器后的冷启动、实际账号和 Host、授权/回执恢复、文件及语音路径；发布范围和真实设备条件仍按主任务记录执行。

## 目录快照与成果恢复复验

新版原生构建记录源码为 `c8775b5d83e8c2fcb498892cb8c05ef47cad393b`，`sourceDirty=false`，源码摘要 `0b8dec1e521d73c2c73c1a15202a0d5af731cfd85ba512c1e283e80a830181d5`。本机成果状态、暂停和移除改用当前账号的已批准目录快照；下载、预览和分享仍检查新鲜授权。连接层90项测试及严格clippy通过；Android重建通过（1m36s），应用构建与27项仪器测试通过（46s）。随后加入真实JNI未登录快照拒绝断言，27项回归再次通过（25s）。日志 `/tmp/moxbots-mobile-snapshot-android-native.log`、`/tmp/moxbots-mobile-snapshot-android-regression.log`、`/tmp/moxbots-mobile-snapshot-jni-regression.log`。

应用APK SHA-256为 `05b4844fe254291083e4a66462b127eb83497979f2a7db6ccc408ebbec2cea5e`，核验报告 `/tmp/moxbots-mobile-snapshot-apk-verified.json`；原生输入及NDK剥离结果、16KiB对齐与签名检查通过，专用模拟器安装成功（`/tmp/moxbots-mobile-snapshot-debug-install.log`）。仍为Debug测试签名且无内嵌JS，依赖Metro；此处不构成独立分发、原生页面、真实Host或物理语音验收。

## Notification SDK 与内嵌JS测试包（2026-10-18）

- 客户端源码 `b57e5252b1c6473e02cd3e6b1784edfc017f4cc4`；原生库构建记录 `cf8bba760d00154536982a85e92409499423d3b6`，两者之间只有不影响Rust输入的app文案与仪器断言；当前干净的原生源码摘要核对一致。新版摘要scopeVersion=2包含实际导入的共享AgentNet/lifecycle源码，不能与旧scope摘要直接比较。
- Rust原生release8.70s；Debug应用与27项仪器测试1m29s通过（0失败/0错误/0跳过），真实JNI覆盖通知未登录拒绝和JS伪造安装标识拒绝。日志 `/tmp/moxbots-mobile-notification-android-native.log`、`/tmp/moxbots-mobile-notification-android-regression.log`。
- 实际 `:app:assembleRelease`3m12s通过，`EXPO_PUBLIC_MOBILE_QA=0`，APK包含 `assets/index.android.bundle`，无需Metro提供界面代码。日志 `/tmp/moxbots-mobile-notification-offline-build.log`。
- APK SHA256 `67f97eec1ec2d82bc2f8b737816bd2f7620fe72e0ed15504ba180901734146f0`；16KiB ELF/ZIP对齐、签名和实际Rust二进制/当前源码一致性通过。原生sourceDigest `baef71792a5f4478513aa222cd0803e18f247a02040871e7e82415f4c2fc58b4`。报告 `/tmp/moxbots-mobile-notification-offline-apk-verified.json`。
- 使用 **Android Debug test key**；不是正式上架签名。已通过adb安装到专用emulator-5554（`/tmp/moxbots-mobile-notification-offline-install.log`），未验收原生UI启动/账号/Host/语音/推送。
- 独立保留制品：`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/mobile-002/native-checkpoints/MoxBots-mobile-002-android-offline-test-67f97eec.apk`；复制后再次核对SHA256一致。尚未交付可日常使用版本。

## 来源适配后的离线测试包（2026-10-18）

共享OwnedClient已变更，本节制品替代上一个67f97eec原生代码检查点。Rust输入commit c1c32e1661a888696d46c60441e1d85cc9287f18、sourceDirty=false、sourceScopeVersion=2，digest `66bfb6fff8e5ed03baff819ccc6a093388535721a9b10ffbc135d32b8483df33`。Rust release30.78s，Android仪器27项（0失败/错误/跳过）与内嵌JS Release包1m32s通过。

APK SHA256 `cbbf253b3566d6398e1b040e0114bb18f9949511acdc0231e911d23917e6be87`。保存文件 `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/mobile-002/native-checkpoints/MoxBots-mobile-002-android-offline-test-cbbf253b.apk`，复制后重新核对SHA，0600。packaging/原生当前源码/ELF与ZIP16KiB/signature验证通过，embedded JS=true，专用emulator-5554 install -r成功。仍使用Debug test key，不是正式内部签名；没有以安装成功替代启动/账号/Host/推送/语音真实路径。

准确日志 `/tmp/moxbots-mobile-source-android-native.log`、`/tmp/moxbots-mobile-source-android-regression-apk.log`、`/tmp/moxbots-mobile-source-apk-verified.json`、`/tmp/moxbots-mobile-source-android-install.log`。

## 原生来源夹具整合后的最终本地检查点

新增cfg(test) shared identity/JWT构造辅助使保守来源摘要改变，已再次重建。Rust源码232320481c2947a38cfc7bd26b8a415334441bec，sourceDirty=false，sourceDigest `4152ed9e2549eab4f0390ad50447bdfd8ae103b54f3d3482dda2a3d0da3b948b`。Rust22.63s，27仪器用例零失败/错误/跳过；offline Release应用打包38s通过。APK SHA256 `ee811a54df61ac933d02a80767bba9973be1f56b3bd63c22da028a418f9cae9c`。已保存 `native-checkpoints/MoxBots-mobile-002-android-offline-test-ee811a54.apk`（在本任务外部output/mobile-002目录），复制SHA及0600核对、原生当前来源/ELF-ZIP16KiB/signature/embeddedJS和专用AVD安装通过。仍为Debug test签名，无原生UI/真实账号/Host/push/物理语音验收。

日志 `/tmp/moxbots-mobile-source-combined-android-native.log`、`/tmp/moxbots-mobile-source-combined-android-apk.log`、`/tmp/moxbots-mobile-source-combined-apk-verified.json`、`/tmp/moxbots-mobile-source-combined-android-install.log`。后续f9859eb9仅扩展headless/service测试fixture，不改变此APK导入的原生来源。


## 语音待授权竞态修复后的测试包

本应用包源码913e3b5916843306d397553bc17d04013aac1f62，构建时整个工作树clean；内嵌JS Release构建1m14s。Rust输入仍为23232048/digest4152ed9e，不伪造或修改其原构建记录。新增Kotlin权限gate/stop/lifecycle修复、Preparing状态与提示文案已经在该应用包内；旧ee811a54不包含这些修改。

主Agent最终32项仪器测试0失败/错误/跳过，Gradle8s（其中原有27+readiness1+gate4）；本机中文模型未安装仍为unavailable，未录音/授予权限/下载模型。原生字节与当前来源、ELF/ZIP16KiB、签名、embeddedJS验证通过；专用AVD安装Success。APK SHA256 `a8fe8ed492d0217c783a885ac573372dca817bad46c5cd473f2e9cb4836b0333`，外部文件native-checkpoints/MoxBots-mobile-002-android-offline-test-a8fe8ed4.apk，另有同名.provenance.json记录整个app源码913e与Rust库来源，均0600。Debug测试签名，仍没有原生UI启动/账号/Host/推送/真实ASR/手机/日常分发验收。

日志 `/tmp/moxbots-mobile-speech-permission-accepted-instrumentation.log`、`/tmp/moxbots-mobile-speech-accepted-android-apk.log`、`/tmp/moxbots-mobile-speech-accepted-apk-verified.json`、`/tmp/moxbots-mobile-speech-accepted-android-install.log`。
