<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-connect-20261101 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: MB-MOBILE-CONNECT-20261101 手机身份与空Bot目录

## Objective

MB-MOBILE-CONNECT-20261101：手机直接显示当前账号；定位空 Bot 列表并完成授权范围内连接验收。不改变现有账号/存储/权限 owner。

## Acceptance criteria

- [x] 核实权威仓库与当前主干，隔离工作树。
- [x] 当前桌面真实 UI 确认本机在线、所有 9 个 Bot 均未开放。
- [x] 手机首页及账号页显示成功登录名或完整账号标识；旧记录可恢复，退出不残留身份。
- [x] 定向策略/Rust回归、类型、lint、实际页面检查。
- [ ] 用户指定开放范围后，经原入口开启并核实手机可见/连接。
- [ ] 精确提交推送、唯一 shared CI/main owner 集成、mobile owner 新包及真机验收。

## Completed

主干基线 e11ee39b5629d6e74810b75e2155a45400d45005。用户确认手机 Bot 列表为空；真实桌面 UI 为本机 online、开放 0/9。原生 account_view 永远 displayName=null，首页无账号文字。身份修复与本地验证完成，手机连接仍待定位。

## Verification

85 policy、135 Rust library（1既有ignored）、typecheck/lint、320/390实际ExpoWeb UI通过。证据 dev-docs/mobile-connect-20261101/acceptance.md。用户授权后已通过原桌面入口开启9/9，未发送业务请求。

## Blockers and unknowns

用户已授权全部已有Bot并完成9/9开放，但用户刷新手机仍为空，连接验收未通过。云端已确认桌面目录9个active/enabled且Ready，手机实际账号/错误/版本待核。共享CI/main唯一负责人01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile/cloud唯一负责人01a12b99-7b38-78b1-831f-9c60257d386a，本会话不触发正式构建/共享CI。实际手机身份、当前包及连接尚未验。

## Next step

将精确已验证源码交原shared CI/main及mobile发布owner，同时继续依据手机账号/错误定位空列表。

## Collaboration

Primary负责UI、真实桌面诊断、集成。connection_diagnosis请求gpt-6-luna/medium：只读连接诊断后转原生名字持久化；独占runtime.rs及相关Rust fixture。运行实际模型/用量不可见。UI按现有样式，主会话承担小范围视觉及交互检查；不把模拟等同真机。
