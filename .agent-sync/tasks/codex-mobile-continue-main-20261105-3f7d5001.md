<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-continue-main-20261105 -->
<!-- git-project-sync-task:base=39b3447659dd92e71f9bb86bf12f2326bb3e5fcd -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-MOBILE-CONTINUE-02 Root main integration

## Objective

原手机单元继续工作入口与0.3.0-rc.1/build10元数据同当前AUTH源码组合。原mobile owner准备源b8c912d0基于main39b34476，Root协调唯一sharedCI/main。保留原会话、审批、防未知重放、成果和草稿持久路径，手机发布由原owner01a12b99。

## Acceptance criteria

- [x] CONT01 原45d474c6/ea1ea05c功能与owner准备b8c912d0整目录mobile字节闭合核。
- [x] CONT02 currentAUTH显式同意按钮/原键盘收起/Ready poll和原生续期源保留。
- [x] CONT03 组合本地124policy/type/fullExpo lint通过。
- [ ] CONT04 合入当前chat-style最终main并保留双方记录，单次最终PR/精确CI。
- [ ] CONT05 freshmain/受测树准入后正常合入及远端/主干CI核实。
- [ ] CONT06 原mobile owner正式不可变build10/云兼容顺序/真实手机与账号业务验收。

## Completed

已读原acceptance与独立320/390合成组件审阅。原始producer/owner候选均保留。Root隔离main39b34476合入mobile owner b8c912d0，生产自动合并，原授权按钮和native/service source保持。旧ea+39b只plan冲突；其整mobile树a8640c13与b8c912d0严格相同，不宣称45/ea Git祖先。手机version0.3.0-rc.1/iOS0.3.0build10/Android10沿原owner预留。

## Verification

Node24组合124policy、tsc、完整Expo lint、whitespace通过。wholemobileclosure、build10 tag只读检索无相关占用，旧通用v0.3.0属早期desktop，绝不覆盖。原截图和假数据只证明合成UI路径，原developer可在新组合后复核。

## Blockers and unknowns

Kevin设备不可用，原生键盘/VoiceOver/真实Host权限与生产验收由原owner继续。当前桌面PR249运行，先收其终态与main再固定手机最终源。固定39b云服务已单独交原owner，手机待最终主干，不从旧ea覆盖AUTH。Root无正式手机或desktop构建/安装动作。

## Next step

PR249 main完成后同步实际main到本隔离分支，核mobile字节/登录授权/plan闭合，再唯一最终PR/CI/main。
