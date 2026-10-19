<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-recovery-hardening-20261019 -->
<!-- git-project-sync-task:base=90e1d4327fd341e096a6380bad64eb36230739f2 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-MODEL-RECOVERY-001 日志驱动稳定性增强

## Objective

MOXBOTS-MODEL-RECOVERY-001 第二轮：按用户最新授权持续只读检查本机后台稳定性日志，修复有复现证据的模型瞬断/错误终态问题，保留普通 Session/Goal 的原执行历史、动作幂等和暂停/停止权威。发布仍交唯一桌面 owner 01a12bc2-907a-7702-b6dd-788225c5dfe4，不修改冻结候选、不停止活动任务。

## Acceptance criteria

- [x] 确认 canonical main、干净开发分支、现有发布状态及本机日志来源。
- [x] 对照旧客户端日志与 main 已有修复，避免重复修复 Goal busy/header timeout/read-loop。
- [x] Chat Completions 残缺/错误流不得生成成功 message_stop 或清除恢复 checkpoint。
- [x] 有终态的正常流保留 trailing usage、工具调用及无 DONE 兼容；无输出 body 失败可进入原有有限恢复。
- [x] 原恢复、暂停、停止、部分输出禁止重放；21文件378项、类型/改动 lint 与真实 SDK 隔离 counter=1 通过。
- [ ] 精确 head CI、正常 PR/main 交付及远端包含核验。
- [ ] 更新当前聊天稳定性监测接续及唯一 publisher 接收记录；源码/模拟/原生/生产分别追踪。

## Completed

已核 read-only 日志并与当前 main 已有修复去重；完成 Chat/Responses 流式完整终态校验、完整帧投递、安全错误分类、非流式无效 200 和 Stop 取消传播修复。独立审阅指出的 awaited block 取消及半帧 marker 两项均已修复并补回归。详见 `dev-docs/model-recovery/hardening-20261019.md`。

## Verification

Git observe/start/task-init 通过。最终21文件378项全部通过、tsc/改动ESLint通过；隔离真实SDK/native/MCP counter=1、denied=2、原 native history 恢复通过。模拟供应商/压缩时钟，不冒称真实Provider/签名原生通过。执行：主 Agent 负责日志、实现、集成与交付；复用 bridge_recovery 做只读代码审计，无新 worker、无外部模型、无模型/权限/配置变更；精确运行模型与用量未暴露。

## Blockers and unknowns

0.5.13 冻结 source2ff314ed 与本轮 base90e1 不同；原签名、公证 job 和所有字节由唯一 publisher 保持不可变。原生/真实 Provider 验收、正式发布和日常客户端升级未完成。正在执行的业务不得因诊断被重启或取消。

## Next step

提交源修改、正常 PR 与精确 head CI，合 main 后核远端包含，再向唯一 publisher 发送新 pin 接收请求；现有聊天 heartbeat 扩展为发布协调和有界增量日志稳定性跟进。

## Deployment request

Required，唯一桌面 publisher 01a12bc2-907a-7702-b6dd-788225c5dfe4；本轮只做源码/CI/main，提交接收请求后由 publisher 选择下一精确 pin 并重新完成签名/真实模型/原生门禁。无数据迁移/依赖/权限扩张。不能把 PR152 CI 当作后续 main 修复的 CI。
