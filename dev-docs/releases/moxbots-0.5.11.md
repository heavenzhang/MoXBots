# MoXBots 0.5.11 登录修复发行

任务：`MOXBOTS-LOGIN-FIX-0511-20261018`。冻结源码 `15be9d6fda17c464afa54ee675d10f1d7fd4507f`（PR #125，`v0.5.11`）。本记录随后的主干提交只更新交付文档，不改变冻结二进制。

0.5.11 纳入 PR #103 的浏览器回跳接续和 PR #118 的有限时钟偏差兼容：有效的 300 秒登录事务不会再因客户端落后约一秒被误拒绝。PKCE、来源、事务绑定和期限上限保留。构建脚本也不再按通用进程名结束其他检出的客户端。

## 制品

- 平台：macOS arm64；应用版本 `0.5.11`，bundle `com.moxbot.app`。
- 更新 TAR：`294768547` bytes，SHA256 `0572512d251733f15253d9936f8aa3445a94559d60420220b0f4cfc7c5070865`。
- 应用可执行文件 SHA256：`4964f1880ea2764c1a84e53a1a5347f2fc6d22e479f4868e6bbc8e6f0e88ebc3`。
- Developer ID、Hardened Runtime、secure timestamp、deep/strict codesign、Gatekeeper 与 stapled ticket 均通过。Apple Accepted ID：`b8eb6dcf-2fe8-4f27-8637-e894339eccfb`。首次被拒的归档/13项嵌套 Mach-O 签名诊断保留，补签后以新 ZIP 重提。
- 正式 Credential Reader SHA256 `e99409ad3e881b202d3adda27f8b98b580ae177df3563cbc73243ad448d87b04`，CDHash `63faf580a4ac68dd0604f97b7a61b5df6d24e7d5`，匹配锁定根。
- 原 updater 公钥与 0.5.9 一致；精确 TAR 的 404B Tauri 签名由既有受保护凭据生成，仓库 prepare 真正验签通过。无 GitHub 二进制发布。
- 独立审阅确认当前 app 与 TAR 回读 app 的 12470 个文件/链接一致；编译输出与签名候选 Mach-O UUID 同为 `0A931054-AFBE-3C51-9E33-6519B1EF4C5C`。源码对应基于冻结工作树、构建操作及读回证据，不宣称可重复构建证明。

## 真实原生验收

用户明确允许在当前 Mac 空闲窗口操作，并正常停止两个等待用户选择的指定会话。日常 0.5.9 正常退出，完成应用、配置/数据、WebKit/preferences 一致备份；未替换 `/Applications/MoXBots.app`。精确正式候选从临时路径运行，故本次不是 updaterqa profile 对生产登录的替代。

- 真实网站账号登录及原设备身份恢复后，桌面自动关闭登录窗口，恢复原账号/设备绑定。
- 冷启动无需重新登录，账号恢复；认证社区读取成功、本机在线及真实 `0/10` Agent 目录读回通过。
- 首次冷启动曾出现约5秒的实例发现超时和重连延迟。只做了一次 app general proxy 诊断，随后撤回为原来的代理配置缺省，再次冷启动也恢复成功。因此不将恢复归因于显式代理，不宣称所有网络延迟消失。
- 独立审阅者实际观察当前原账号/退出菜单、Bots Ready、本机在线/0/10 Agent、认证社区既有话题读取。首次登录和冷重启由 Root 执行，独立者仅复核其历史证据，未冒充独立重放。
- 没有真实模型调用、Host 安装或远程业务任务。离线设备目录错误、Host 管理 `NETWORK_HTTP_FAILED` 及远程可调用路径不在通过范围；OS scheme 唤醒与轮询 fallback 未分别仪器化归因。

## 更新分发

状态：**已发布并完成更新分发核验**。2026-10-18 12:43Z 原子启用0.5.11；公开门禁和独立发布后核验通过，12:45Z 同任务锁正常 finish。更新入口 `https://140.143.183.232/updates/stable/darwin-aarch64.json`，精确 manifest SHA256 `ee5d8b48a2a625cf29622440f11e9f05c01ecac59039e667ab63f2cd72117128`。

- 外部验收机单次完整正常 TLS GET：294768547 bytes、完整 SHA256 一致，HTTP200/TLS验证0/无跳转/curl退出0。保留17份原始证据并完成独审；下载后哈希计算两端的stat完全一致，不宣称stat覆盖整个传输周期。
- 公开stable精确字节/版本及no-store、两个Range206并逐字节比较、Windows unsupported204、5条私有receipt/manifest/lock/history路径404通过。独立者另做一次1055字节正常TLS stable GET，并审阅实际9路响应原文。
- 旧0.5.9 stable精确 SHA256 `38c2443567b6ab4167797066ae56b6c751aed3e7bba9afe9cf3139909950c014` 已保存到私有history；旧归档 `9a23e0b1cd59135b079bcf58082cde85cce814f948f5d9e2e9d8c76ed7d2189c` / `343650367` bytes 在stage/promotion/finish时完整校验并保留。仅恢复stable可停止后续推广，已升级客户端需更高版本修复，不能自动降级。
- 客户端可检查并后台下载此更新，任务空闲后由用户确认重启。更新分发成功不等于已安装；本任务没有替换日常0.5.9安装，也未自动重启任何客户端。

| 原始回执/独审       | SHA256                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Root外部完整GET门禁 | `a7a82e7c6ce85b3c1e317b18e1b2c6c58da4264b44de1e96ee2b10cac1f8d40d` |
| 17原件独立审阅      | `4cd24af7623478baf014b955f8a4c93457c915b57abbfb05b38e84b3e3f6e424` |
| 原子promotion回执   | `772a6656c778f4a8d9854d0873e0b1a3dc9605c43b6951d3e0af1e32377d0c49` |
| 公开9路门禁         | `9e1dcf2b74b409a907a6c0f0b74efa04e45dd11fd4828099a61a08b63fae8f55` |
| 发布后独立核验      | `6abd226d35764fc44b3f237d3eadcf67cc0c4f8f9baf461187836e750d447b66` |
| own-lock finish回执 | `1a27f37e3468f16c439b74a6dfd64d31749d218ddefcb572bbf4f4df5be131f6` |

## 验证及证据

源码阶段登录兼容2项、renderer回跳16项、Rust登录8项、构建隔离9项通过；typecheck、lint、资源构建通过。正式 Tauri release 编译耗时9分41秒；上传及服务器完整验证51.53秒；外部完整下载2475.29067秒（41分15秒），平均119084 B/s。各阶段为实测，整体从准备到验收的总时长未单独计时，不能把编译时间当完整发行耗时。没有确认云实例的带宽配额。

私有证据保留在项目指针 `work/release-0511-20261018/owner/`、`/private/tmp/moxbots-login-fix-0511-nativeqa-20261018/` 和正式包目录 `/private/tmp/moxbots-login-fix-0511-final/`。凭据、业务数据、配置原文及原始日志不进入 Git。独立 native/script review 与最终公网回执分别按精确文件哈希封存。

## 保留边界

本次不发布官网 `/download/`、Windows、Host、auth服务或Nginx。日常安装仍0.5.9，候选运行与正式安装分开；未做0.5.9→0.5.11自动更新安装，未宣称日常客户端已升级。模型、远程Host及自然会话续期不因登录/分发成功自动通过。
