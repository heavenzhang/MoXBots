<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/login-return-20261021 -->
<!-- git-project-sync-task:base=4206eb2ef8f8bf2f9dc211b4f13842441dead0de -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-LOGIN-RETURN-01

## Objective
原账号网页授权一次后在客户端完成登录并关闭弹窗。仅修复底部账号入口错误使用generic login的问题；复用已有pinned reauthentication，不变更云授权、原账号/设备或业务任务。

## Acceptance criteria
- [x] 查实实际源码、main、隔离worktree、当前0.5.15/build515.6及原生pending状态。
- [x] 定向复现先红后绿；已有账号只走一次pinned认证，native错误不降级新身份。
- [x] 76项DOM回归、完整TypeScript、局部ESLint，独立只读审阅无P1/P2。
- [x] 实际组件在隔离Chromium1200×800、660×400交互通过：一次pinned start、一次browser open、模拟grant后authenticated和弹窗关闭；不代表真实联调。
- [ ] 精确提交推送；唯一CI/桌面owner协调共享CI、main集成并核验远端main包含。
- [ ] 唯一桌面owner安全发布新不可变候选；真实原账号网页登录、凭据保存、authenticated及弹窗关闭。

## Completed
源代码与回归见 `dev-docs/login-return-20261021/acceptance.md`。主Agent实现并验收；一名内置审阅者只读审阅，没有生产操作。模拟、真实联调、生产、主干和发布分别记账。

## Verification
证据本地WPS项目 `work/MOXBOTS-LOGIN-RETURN-01/`：red-regression.log、focused.log、typecheck.log、lint.log、原生窗口截图、progress.md。完整Node24验证通过。独立审阅自己的npm运行被Node22 devEngine拒绝，不记为其测试通过。

## Blockers and unknowns
桌面部署单元及唯一CI/发布owner01a12bc2-907a-7702-b6dd-788225c5dfe4；云owner01a12b99-7b38-78b1-831f-9c60257d386a。开发聊天不运行共享CI重试/正式构建、替换日常App、重启业务或部署云服务。

共享CI仍未全部完成，macOS执行机尚未分配；main仍4206且未包含修复。PR175已建立，原桌面owner完成source-and-component-reviewed-integration-prepared，并用merge-tree确认与515.6修复组合无冲突。新不可变候选及原admin真实网页登录保持未验。当前客户端账号仍signInRequired。

## Next step
完成隔离组件交互，提交精确SHA并向原桌面owner发CI/集成/发布请求，继而真实原账号路径复验。用户Chrome当前标签访问授权已询问，未答复不等于授权；不读取用户浏览器、不替换为其他试用账号冒充原账号验收。
