<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/login-transaction-02 -->
<!-- git-project-sync-task:base=9c01aa370e607e7fd0404f4a3062f8ebed316fbe -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-LOGIN-RETURN-02

## Objective
可靠完成原账号的浏览器授权→native领取→凭据保存→状态发布。用户要求重构不稳定机制；设计和兼容边界见dev-docs/login-transaction-02/design.md。

## Acceptance criteria
- [x] 匹配Air原设备会话创建后33秒撤销；确认native consuming错误出口与UI轮询生命周期问题。
- [x] 服务端可重取结果/ACK兼容扩展，断网重试只有一条session。
- [x] 原生明确阶段、独立driver、staged恢复及不可撤销的提交完成回执。
- [x] 相关确定性回归及独立审阅；UI为真实阶段投影。
- [ ] 精确SHA推送和两单元owner协调CI/main/发布，远端main核验。
- [ ] Air原设备具体build/日志核查及真实单次登录、持久化、界面关闭与设备Ready。

## Completed
独立只读诊断与源码改造完成；root审服务端，非实现者审native并关闭publication race疑点。UI120/120、TypeScript和定向ESLint通过；1280/390浏览器本地合成页面无溢出/页面异常，重试原attempt成功。native check及67/67定向状态/loopback测试通过；service全套串行203PASS/8SKIP、Clippy/fmt通过。尚未证明Air具体原生错误。没有操作Air、重置凭据或变更生产服务。

## Verification
本地证据WPS项目work/MOXBOTS-LOGIN-RETURN-02；不得将模拟/native单机/CI替代Air验收。

## Blockers and unknowns
Air没有当前可用SSH连接；用户已回复两条只读命令没有任何输出，不能据此确认构建号或错误。生产云和桌面发布均由原唯一owner协调，不能并发接管。

## Next step
冻结精确源码和最终测试结果，提交推送后交既有owner统一CI/主干/云端先行发布；Air需在实际新构建验证，不能把旧版本问题当作已消除。
