<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/crash-stability-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-CRASH-20261020

## Objective

解释近期频繁退出并修复采样证实的工作区监听资源压力。保持任务、会话、模型配置和用户文件；不从本聊天重启或替换日常客户端。

## Acceptance criteria

- [x] 核实真实安装版本、主进程路径、退出时间及系统退出状态。
- [x] NoCache替代工作区递归inode缓存，保留粗粒度刷新和应用内精确move。
- [x] 原生嵌套create、rename、atomic replace、delete回归；隔离资源对照。
- [ ] 全crate定向测试、CI与最新main合并后复核。
- [ ] 远端main包含修复。
- [ ] 唯一桌面publisher生成签名包并在安全窗口安装；实际工作区与会话验收。

## Completed

实现及证据说明见 `dev-docs/crash-stability-20261020.md`。权威记录仓库为既有绑定的 https://github.com/heavenzhang/MoXBots.git；origin fetch/push与配置一致。
本地worktree基于上述base创建。observe/task-init是在开始编辑之后调用，因此start/clean-baseline gate没有通过，不伪报通过；任务元数据按相同schema明确记录，提交前人工核实base祖先、exclusive branch和diff。

## Verification

- `rustfmt --edition 2021 --check src-tauri/src/workspace_files/watcher.rs` 与 `git diff --check` 通过。
- 源码抽取的实际constructor+新回归以Rust1.92.0链接实际notify0.6缓存依赖，macOS真实文件事件通过。
- 隔离40,000文件夹具，NoCache注册1.757ms/最大RSS7,487,488字节；默认398.713ms/27,492,352字节。不是生产节省测量。
- whole-crate首次编译到链接，缺Xcode Swift compatibility库搜索路径；正在使用本机SDK正确LIBRARY_PATH重试。没有改产品链接配置。
- 原客户端PID26622持续运行；原生窗口、public read-only两项Session state可访问。当前二进制不含修复。

## Blockers and unknowns

正式桌面构建和安装仍归既有唯一publisher。本聊天已向用户请求跨聊天发送修复的明确授权；未获答复前只提交本地release intake，不发消息。最近三次退出码0与安装时段相关，不能据此断定所有报告的退出均由安装引起。搜索长transcript回放成本也存在，但本patch不改变其语义。

## Next step

完成whole-crate定向验证、push与PR/CI，然后同步最新main审查合并并验证远端包含；用精确SHA和待验收项交唯一桌面publisher。
