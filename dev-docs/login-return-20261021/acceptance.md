# MOXBOTS-LOGIN-RETURN-01

底部账号入口在已保存账号的会话失效后仍调用 generic login。Native generic flow 为临时 device 创建 PKCE 授权；领取成功后若发现已有 enrolled identity，会撤销临时会话并要求第二次浏览器授权。第一次网页登录成功因此不代表原账号在客户端完成登录。

## 修复

`OwnedAccountEntry` 有明确选中的同 issuer 保存账号时，调用已有 `startOwnedNetworkReauthentication(connectionId, registryRevision)`。Native owner 继续验证当前版本、principal、device、CA 和身份槽；没有保存账号时保留 generic 首次登录。版本未知或原生拒绝时显示失败，不降级为新建身份。不修改云授权、凭据后端或协议。

## 验证

- 新增回归先红：已保存账号必须走 pinned reauth 一次；原生拒绝不能降级 generic start。原实现两项失败。
- 修复后相关 76 项 DOM 回归通过（OwnedAccountEntry / useOwnedLoginFlow / JoinNetworkDialog / NetworkSelector）。保留取消、账号代际变化、晚到结果、首次登录及错误处理。
- 新增缺失 registry revision 时不发起登录的回归。
- Node 24.20.0 / TypeScript 全项目检查通过；两个改动文件 ESLint 通过。
- 独立只读审阅未发现 P1/P2。审阅者首次 npm 测试入口被其 Node22 的 devEngines 拒绝；主Agent用实际 Node24 完成验证，不能将审阅者测试记为通过。
- 隔离浏览器组件交互、真实原生和发布状态见任务记录；模拟结果不能代替生产验收。

## 实际故障证据与边界

2026-10-21 本机运行 `/Applications/MoXBots.app` 0.5.15/build515.6（原发布owner记录source1edf2dd5），真实窗口复现 pending。只读 AuthStore 显示原 admin 在01:28:31领取临时设备会话并同秒撤销；这一行为与上述 generic→registered-candidate→reauthorize 路径一致。未捕获用户浏览器的第二次授权完成，不能将服务端可达或测试通过称为原客户端登录成功。

当前修复尚需唯一桌面owner协调精确CI、main集成、不可变新候选和实际原账号验收。不得原地改写已发布制品、替换活动客户端或复用旧版本指代不同内容。桌面owner：01a12bc2-907a-7702-b6dd-788225c5dfe4；云owner：01a12b99-7b38-78b1-831f-9c60257d386a。此次没有云代码变更或云部署请求。

受控实测：从原账号重新登录入口→仅一次浏览器授权→原native PKCE owner领取并保存→原principal/device保持→账号authenticated→登录弹窗关闭；原连接就绪状态另外观察。保留原业务任务、配置和身份槽。
