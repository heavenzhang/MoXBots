<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/auth-renewal-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-AUTH-RENEWAL-20261018

## Objective

修复浏览器已完成授权而MoXBots客户端无法完成登录；为101.42.11.29原MoX Host增加安全自动续期和断线恢复，复用原device/principal/key/config，完整测试后正常合入远端main并按唯一操作窗口部署101。仓库沿用https://github.com/heavenzhang/MoXBots.git。不得更新/重启/操作日常Mac客户端配置、钥匙串或模型任务。客户端使用隔离环境验收。

## Acceptance criteria

- [x] 核实际仓库/remote/main/clean base9269dd8c，独立分支与同步start通过。
- [x] 截图和只读日志定位：0.5.9 owned login start返回OWNED_LOGIN_INVALID；通知SPACE_*错误分开。101原connector83e48946为ACCOUNT_SESSION_EXPIRED，Host本体正常。
- [x] 真实HTTPS六次start/cancel复现TTL300/本地301钟差拒绝，未登录/入网；修复回归与交付另行记录。
- [x] 原owner登录修复/严格inspect_session及270s服务兼容，PKCE/设备/信任/取消/迟到边界回归，独审401映射缺口修复后源审通过；生产状态独立。
- [x] 设计并实现可撤销、原设备绑定、持久化/并发/重放安全的自动续期，不能用延长TTL、明文密码计划任务或复制Mac token替代。
- [x] Host bounded重连/续期/进程重启恢复、断网/撤销/过期/崩溃窗口回归通过，原管理binding及身份不被替换。
- [ ] 定向测试、完整相关回归、独立安全审查、UI/隔离原生及真实协议联调通过；代码/模拟/真实分别记证据。
- [x] 登录PR118 exact625七CI通过、正常合入远端main e87654fbdf050157b2f50b620fe7e0f69e7cd6cc；parent b6/625与合并tree bae916c5be1142ed0d08725150db4d1c702af216已核实。
- [ ] 联合续期PR119最终CI/main与实际部署验收（不能由PR118替代）。
- [ ] 唯一操作owner核101空闲/锁/备份，部署已验候选、验真续期/断线/重启/目录ready和保全；不动日常Mac、不扩大模型权限。

## Completed

主Agent统筹诊断、协议/集成、主干及验收；login_diagnosis_1018只读追踪桌面登录链路（请求Luna/medium）；renewal_security_1018只读安全诊断（请求Sol/high，原因是认证撤销/设备绑定/崩溃与并发跨模块风险）。无外部模型调用；不将请求模型当作已验证实际模型，不估算费用收益。

## Verification

工作区 /Users/zhangshaohua/Documents/Codex/2026-10-18/moxbots-auth-renewal；原101 device cc8fc885-529b-43e9-8a58-ee7c5f2a4c58 / principal ea1e144e-a432-48c0-bf5a-cf29d3da3b56。现PID1921064，旧MyAgents两个PID未变。只读证据存项目pointer output/auth-renewal-20261018；秘密仅留既有私有凭据owner，不打印或入Git。登录/API定向7和headless全183通过，主Agent独立重跑定向7通过；server start兼容/PKCE2、全service159通过/5手动fixture按原配置ignored；headless clippy redlines通过，封闭request profile清除原9参warning后183再通过，headless+service strict clippy -D warnings均通过，登录exact625七CI全绿并由PR118交main e87654fb；独审401错误合同已修并通过复审。现有network-install30、network-control-daemon6、unified-install11共47测试通过；useOwnedLoginFlow16+OwnedAccountEntry22共38通过；无新制品/部署/真实账号登录通过声明。详细决策和证据见dev-docs/auth-renewal-20261018.md。

## Deployment coordination

核读并行任务当前人类原文：Ubuntu24.04/x86_64一命令安装/浏览器授权/自动续期，测试/main后“发布交给统一部署聊天，不要动日常Mac”。因此沿用当前唯一统一部署聊天01a12bc2-907a-7702-b6dd-788225c5dfe4，Host-onboard聊天01a13320提供唯一续期实现并协调部署；本聊天交付登录修复/联合安全评审/独立101验收，不主动占101/140窗口。用户本轮明确授权101部署，待具体联合候选、云端配套协议/兼容和备份回滚就绪，由现owner核新目标授权后串行执行；不修改stable/桌面安装或扩大账号/模型权限。main合入不代表部署或Mac安装。

## Blockers and unknowns

101既有session已到期，必须一次正式认证后建立后续续期，不能复活旧token。唯一续期实现8cdeac561已由主Agent和独立审阅接受，Host191/service166（5既有ignored）与严格Clippy通过；实际读日志确认真实key恢复fixture。PR119最终组合CI/main及真实迁移、生产续期和断线恢复仍未完成。日常Mac操作与更新明确排除。

## Next step

登录修复已交远端main，唯一续期owner完成PR119最终门禁及主干交付后，由统一部署聊天协调兼容cloud与101 connector的串行维护窗口；不需等待无关桌面/Windows/公网installer发行，但不能跳过实际source/CI/备份/授权。保留原Host/Node/有限grants，由本认证聊天独立核实际网页登录、101 Ready/恢复及后续自然24h；整个task仍in-progress，不把源码合入当生产通过。

登录组合证据：main b6 Goal/Todo与625合并tree bae916c5be1142ed0d08725150db4d1c702af216，Node24隔离组合DOM116与完整typecheck通过；Test39087732715及Owned39087732694共7项成功。PR118已更新最终主干回执。
