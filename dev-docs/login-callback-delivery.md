# LOGIN-CALLBACK-20261017

用户目标：浏览器登录完成后直接唤起 MoXBots；原 owner 确认成功后关闭登录弹窗，无需用户返回后点检查状态。

## 变更与原因

此前 PR89 自动轮询已在已安装0.5.9中，但云服务成功页只显示英文“返回应用”，没有OS回跳。此次正式桌面显式选择 /desktop；云端成功页自动打开固定 moxbot://login/complete 并提供备用按钮。原生收到精确URL仅触发当前登录检查，现有PKCE/OIDC/账号/设备/Keychain authority保持原路径。浏览器可能要求确认打开应用，页面给出明确说明；不绕过浏览器权限。

旧服务兼容只接受400/422的起始请求拒绝，最多一次无新选项重试；网络错误、503、成功格式错误都不隐式重复。初审发现原HTTP helper提前抛错，已修复并增加纯文本无no-store旧服务响应的真实loopback测试。网页管理员、反馈、社区及headless入口继续使用各自返回目标；隔离QA profile不争用正式scheme。

登录等待区改网格布局，移除按钮内随检查出现的spinner，避免按钮宽度变化及挤压。等待状态仍有明确自动检测提示。

## 已验证

- project-sync start PASS；定向DOM 64/64（账号、selector、dialog、hook），新增原生回跳模拟及取消/卸载防迟到；typecheck、限定ESLint、classification、diff-check通过。
- 服务端登录路由20/20，覆盖新 /desktop opt-in/state绑定、凭据不进URL、失败不自动跳成功页及既有admin/community/feedback。
- 真实本地HTTP loopback：新服务200单请求；旧服务纯文本无cache header 400/422各两次且复用同device/challenge；503单请求失败。测试在共享OwnedClient的headless harness通过，不能替代桌面编译和原生验收。
- 服务端 clippy --all-targets -D warnings 通过。服务端全量152通过/5原配置忽略、headless167通过；服务端format通过。首轮CI另发现新增测试mock类型与禁用spawn，修复后重跑本地检查，CI/main以任务记录后续结果为准。
- 主Agent内置浏览器实点发起、手动检查、滚动操作；独立reviewer复核1280完整页、660×400顶部/底部及CSS zoom2截图，无按钮叠放或标签裁断。当前为dark主题/合成数据，不是OS/WebView原生缩放。
- 独立审阅：dev-docs/login-callback-review.md，发现1项P1，修复后关闭；无剩余已知阻断问题。

## 部署请求与验收边界

需要云端AgentNet服务升级和下一个未冻结桌面安装包同时纳入；先服务端后客户端为优选顺序，客户端旧服务回退保证顺序不造成登录不可用。无数据库migration、无新增公网端口/权限、不变更登录发行者、账号、身份、Host与模型。

桌面目标既有macOS MoXBots，既定唯一发布聊天01a12bc2-907a-7702-b6dd-788225c5dfe4；本开发聊天不并发签名、切stable、换包或重启日常任务。云端仅既有140.143.183.232 AgentNet二进制；执行前需核对现行owner、SSH发布身份、活动任务、二进制/配置/state备份与原版本回滚。服务端读取原状态，不恢复旧数据库来回滚展示变更。

真实验收必须记录：运行服务source/digest + 已安装客户端source/digest → 从该客户端发起 → 网页OIDC登录/必要同意 → 浏览器提示时允许打开应用 → 自动前台 → 原PKCE轮询/现有凭据保存成功 → 弹窗关闭、账号实际可用；取消、超时及旧服务fallback也需保留。仅合main、CI、fixture、HTTP200不宣称生产完成。

## 2026-10-18 双端已发布回执与保留边界

本节更新之前的发布请求状态，不改写源代码或冻结制品。PR103已合入main `b11e10bc776858f5c2a0d4204f00cc515f3218a6`，源头7项CI通过；后续服务与桌面来源都包含该提交，`git merge-base --is-ancestor` 两次核对成功。

| 组件 | 已发布来源 | 权威回执 |
| --- | --- | --- |
| 既有AgentNet/auth云服务 | dcf8d9a60976c160e2b2aca33313c668c071132c；binary SHA256 b73f5d462504e2d5a132d672ad85ba660605404ef21c46d4af937f92b5748d63 | [云端实际发布记录](auth-renewal-production-20261018.md) |
| macOS正式0.5.11 | 冻结source/tag 15be9d6fda17c464afa54ee675d10f1d7fd4507f / v0.5.11 | [签名、公证、原生与公开分发记录](releases/moxbots-0.5.11.md) |

用户要求相关云端与0.5.11一起部署已同步统一发布owner，并与上述现有交付匹配。本聊天核对回执与源文件，不重复执行已有云端升级、签名、发布或客户端操作。旧artifact12103695443不作为本次实际运行证明，实际云端制品以上表回执为准。

正式0.5.11候选真实网页登录和原设备恢复后自动关闭弹窗、原账号恢复、冷启动恢复和认证社区读取已验；OS scheme唤醒和轮询fallback未分别仪器化归因，所以不能宣布“独立OS唤起已验”。发行验收时日常`/Applications/MoXBots.app`仍0.5.9，0.5.11候选从临时路径运行；未做日常0.5.9→0.5.11自动更新安装（A-to-B），公开stable启用不等于已安装。

统一owner确认当前未新增安全窗口，本轮会话审计只保存匹配与边界，不重启日常客户端、不覆盖已发布0.5.11、不新增生产部署。OS唤起/A-to-B后续候选统一排队，下次在fresh活动任务准入、备份/回滚和安全窗口就绪后补验。完整目标因此仍保留这两项待验，不以回执核对关闭它们。

## 执行记录

主Agent负责跨端实现、验收与主干；内置login_review(gpt-6.1-sol/medium请求参数)只读审查及截图复核，模型运行值以运行时工具暴露为限。未调用外部模型。复审1轮修复P1；未取得单任务token或费用实测，不提供虚构节省值。
