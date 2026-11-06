<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-visual-polish-20261106 -->
<!-- git-project-sync-task:base=05ea1e2c4d06f112585012a27503adc75c184dcc -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-MOBILE-VISUAL-04 舒展手机主任务视觉层级

## Objective

MB-MOBILE-VISUAL-04：按用户“界面小里小气”反馈，调整手机继续工作、原对话、待处理和成果的字号、留白、边界与触控尺度。承接未集成 C03 精确提交 2d12f25b919c3bf9343d8c528c88716bc09bea32，保留其历史，不改业务 owner、请求/草稿/成果语义、原生协议与版本。

## Acceptance criteria

- [x] V04-1 当前页面诊断与改版前证据：390 宽合成页面，确认小字、碎片边框、任务标题弱。
- [x] V04-2 同一视觉尺度实现：首页标题30、任务20、正文17、按钮15/16；主要操作48/52，去掉重复卡片边界。
- [x] V04-3 390和320窄屏走查：首页/Bots/对话/请求/成果；无横向溢出，按钮可达，输入测量与显示一致。
- [x] V04-4 草稿/回答/成果往返、未知回执和过期审批回归；typecheck/lint/policy。
- [ ] V04-5 独立审阅、提交推送、原 shared owner CI/main 集成。
- [ ] V04-6 原 mobile owner 统一候选与真实设备验收。

## Completed

已核实权威仓库和远端main05ea1e2c；从主干初始化分支后快进承接C03。原C03分支未修改。已调整实际 React Native 页面，仅视觉层。

## Verification

Node24 typecheck/lint、125policy与diff检查通过；主审和独立IAB320/390合成路径通过，见 dev-docs/mobile-visual-04/acceptance.md 和 REVIEW.md。

## Blockers and unknowns

原CI/main owner01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile owner01a12b99-7b38-78b1-831f-9c60257d386a。C03尚未合入main，本分支保留它作为显式依赖。新签名包、真机键盘/字体缩放、VoiceOver与真实会话读取待原负责人核验；不影响本地视觉开发。无桌面/云端部署。

## Next step

交原shared owner统一CI/main集成，再由原mobile owner制作下一未冻结候选并完成真机验收。
