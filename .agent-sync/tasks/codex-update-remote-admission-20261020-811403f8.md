<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/update-remote-admission-20261020 -->
<!-- git-project-sync-task:base=4206eb2ef8f8bf2f9dc211b4f13842441dead0de -->
<!-- git-project-sync-task:status=in-progress -->

# Task: UPDATE-20261020-01: allow safe restart with remote session tabs

## Objective

修复仅因为存在 remote-session 标签就无法安装更新的问题。用户已确认报错来自另一台运行 0.5.13 的电脑，明确指定 https://github.com/heavenzhang/MoXBots.git，并授权交给现有桌面统一打包负责人。

## Acceptance criteria

- [x] 空远程标签及仅远端正在运行的任务不阻止桌面更新，不发送远端 Stop。
- [x] 未发送文字、未提交回答、IME 和未确认/未知 operation 保留；未挂载标签也检查原有 draft/ledger。
- [x] 原 composer checkpoint 冻结/最终复核/失败释放期间拒绝新写请求。
- [x] 本地回归、类型和 scoped lint；测试证据不替代真实升级。
- [ ] 精确提交推送并由唯一桌面 owner 协调共享 CI/main 集成及签名发布。
- [ ] 真实另一台电脑 0.5.13→新版本安装、重新打开远端会话、后续空远程标签不再阻止更新。

## Completed

实现及测试见 `dev-docs/updater-resume/remote-tabs-20261020.md`。当前基线 main4206eb2e；没有更改 Rust updater/Host 执行、版本、公钥或安装器。普通更新继续接受原本机活动保护。

## Verification

本任务隔离 worktree 重跑原 checkpoint/远程页面/本地任务编辑器/useUpdater 10 文件100项通过；`tsc --noEmit`、改动文件 ESLint 通过。原本地准备另外通过依赖巡检及1440/390宽隔离 Chromium 功能检查，原始日志路径见验收文档。本机0.5.14/线上stable0.5.14只读核实，不代表另一台升级成功。

## Blockers and unknowns

部署单元为 desktop/macOSarm64/updater；唯一 CI/发布会话仍为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`，由其分配下一个未冻结版本/批次、精确 SHA、不可变 tag、制品摘要和回滚目标。本开发分支不触发共享 CI、不另行构建/发布或停止客户端。用户授权通知已执行，精确 head 待提交后补交。

该 owner 正在 PR172 合入远程共用输入框，RemoteSession.tsx 有同文件依赖，集成时必须保留 TextChatComposer 的布局/IME owner 并再次检查更新冻结。本次修复不可生硬覆盖其控件。旧0.5.13安装前拦截无法由新包反向修复；该电脑需要先保留未提交内容/检查回执，关闭本地远程标签后使用普通更新。

## Next step

核对本分支远端精确 SHA、与 PR172/main 的共同输入 owner，再由桌面 owner 只组织一次组合 CI/普通集成及下一签名包；独立保留真实双端升级验收。当前 Agent继续提供本地冲突/回归协助，不以通知成功代替发布成功。
