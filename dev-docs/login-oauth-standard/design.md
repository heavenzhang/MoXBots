# MOXBOTS-LOGIN-RETURN-02 标准 OAuth 桌面交付

2026-10-22，基线 main 263b1cf5c064c7ee5f375fd5c3f5697854e35723。用户要求保留 OAuth、减少自定义环节、简化登录；原 Air 登录及正常退出重开保留状态才完成。

## 两个既有信任边界

云端继续作为 Dex 的 confidential OIDC client，秘密仅在服务端，原 issuer/audience/JWKS/nonce/state/上游 PKCE 验证不变。产品 AuthStore 继续按已验证 (issuer, sub) 映射稳定 principal 并按精确 device UUID 签发产品会话，不新增账号数据库。桌面不是直接连接 Dex 的 OIDC client。

桌面作为产品服务固定 public OAuth client `moxbots-desktop`，使用 oauth2 5.0.0 生成 Authorization Code + S256 请求。系统浏览器打开 `/auth/oauth/authorize`，Dex 完成原认证后只把短期 code + state 重定向到 native 已绑定的 `http://127.0.0.1:<随机端口>/oauth/callback`；native用标准 form `/auth/oauth/token` 兑换 Bearer access_token，再 GET `/auth/session` 取回服务端 principal/network/device/expiry 权威快照。原身份校验、旧设备私钥、immutable Keychain slot、config 原子指针和 registry commit 全部沿用。

仅接受固定 client、固定 callback path、127.0.0.1、1024以上端口；redirect 不可带用户信息/query/fragment，token兑换完整 URI 精确匹配。服务不连接本机回调，只重定向浏览器；不新增公网监听端口或 Dex client/config。code 短期、随机、只存hash、一次消费，绑定已验证主体、device、client、redirect及S256。native先绑定listener再开浏览器，错误 state/重复字段/超长请求拒绝且不消费合法回调；Token、secret、verifier不进入Renderer、URL或日志。

## 收敛与可靠性取舍

新桌面路径移除 `/auth/login/start/poll/ack/cancel` 交付依赖，不依赖 moxbot scheme 注册才能取回结果；UI观察 native driver 的本地状态，不拥有认证生命周期。固定服务登录仅提供“在浏览器中继续”，隐藏URL/CA/手工检查和完整授权链接；自托管网络设置仍保留。

授权码单次兑换，网络响应未知不重放 code，明确提示重新登录；可能留下直到原session TTL过期的未落盘session。收到的Token留在短期内存；后续会话检查或本地存储失败重试同一已收到结果，不再次兑换。只有原OS凭据及配置提交成功才发布已登录。退出不保存未完成流程，重开后重新授权；已提交会话由原恢复路径读取，不反复访问Keychain或清空旧槽。

已选旧账号/设备走原 start_existing 一次授权并固定原principal/device；真正首次也一次。原generic账号未知、临时设备后发现已有登记的兼容分支仍要求精确旧设备再授权，不为了删步骤引入未经证明的身份重绑。普通网页首页登录不等于对另台机器的native授权；当前主流程明确要求使用本机浏览器。跨设备标准Device Grant不在本批新增。

## 兼容、发布与回滚

旧 Host、mobile、Web/管理员/社区/反馈及旧desktop继续原契约；新OAuth事务与旧poll/ACK/cancel相互隔离。原session/Keychain Reader/数据库不迁移。云owner先发布新增固定/auth路由，桌面owner后出新不可变build；若云未就绪，不静默降级到不稳定旧登录。可独立回滚程序或客户端，保留原业务数据/会话/钥；旧客户端严格schema的既有回滚约束仍适用。

## 验收

- [x] 标准端点/PKCE、state、redirect、错误/过期/重放、旧协议隔离测试。
- [x] native TCP callback、单次兑换、取消/迟到返回、网络未知重登及已收grant保存重试。
- [x] 原principal/device/配置/凭据提交与恢复回归，UI单入口/状态/错误及窄窗口。
- [ ] 独立安全审阅、当前SHA本地检查、owner共享CI及远端main核验。
- [ ] 云实际程序SHA、桌面签名制品SHA与版本，回滚记录，真实Air下载安装。
- [ ] 原Air登录成功，Cmd-Q退出重开状态保留，真人结果及服务端原device/principal相符。

标准依据：RFC6749 §4.1、RFC7636、RFC8252、RFC9700；客户端实现使用 oauth2 crate，OIDC上游继续 openidconnect crate。
