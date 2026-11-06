# G01-A / G01-B 验收证据

本地实现为稳定成员/目标合同和实际群配置 POST，不含成员界面、真实 Bot 消息路由或任务交接。

- 5 文件110项回归通过：新 shared Bot group9、实际 SessionStore/配置文件/请求路由10，及原任务账本、编排、签名验证相关回归。
- 保存→模块冷重载→读取通过，原项目快照、旧消息、旧任务和 delegationLaunches 保留。并发编辑只有一个提交，重复 requestId 不增加 revision；更改内容拒绝。真实文件读写均使用隔离临时目录，不读取或修改用户资料。
- 活跃/队列/unknown拒绝、Runtime切换后迟到请求拒绝、名册在提交前变化拒绝、损坏名册不当空数据、回执不暴露可变缓存引用通过。打开/配置测试未调用 sendDesktopMessage。
- 实际路由校验有效签名；普通CLI令牌、伪造成员快照和篡改正文拒绝。
- Rust1.92.0按仓库锁文件精确依赖，在隔离临时crate直接编译实际session_user_action.rs：8项测试通过。真实Rust签名→实际Node verifier通过，错误Session/正文/路径拒绝。可复现：node --import tsx scripts/verify-bot-group-native.mjs。不是完整Tauri编译或真实窗口owner验收。
- TypeScript、修改文件ESLint、测试分类通过；依赖边界0errors，保留既有20warnings。
- 初次测试的SessionData读取使用了不存在的metadata嵌套字段，以及测试Runtime枚举写错，已按实际类型修正；初次失败日志保留，不降低生产校验。

原生真实Tab→目标Session配置保存、UI交互、各Bot真实模型/工作区/权限执行、群结果、交接、主干和正式包均未据本批证明。需要G02—G07继续完成。

私有日志：WPS项目 work/MB-BOT-NAV-20261102/group-20261107。脚本产生的sourceSha/lockSha和原Rust测试日志留在该位置；没有私钥或真实凭据。
