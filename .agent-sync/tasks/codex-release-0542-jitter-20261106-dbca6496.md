<!-- git-project-sync-task:source-digest=27458ff5481302d7a87749480925ce65d2ac3b0cea97c2e79200b6041e227d66 -->
<!-- git-project-sync-task:id=164ff0e6-1c92-4b19-be50-3816d782c91b -->
<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0542-jitter-20261106 -->
<!-- git-project-sync-task:base=66f76d734c1bdf026b3708d5ece9ed925a50a37e -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: 修复虚拟列表未测量追底抖动并统一桌面发布

## Objective

MB-CHAT-JITTER-20261106：修复未测量追底越过Virtuoso size tree及Footer margin漏算导致的长历史持续往返，交付main、下一未冻结542.6和同制品本地/101真实验收。明确包含已main的滚动条producerbacd/source0d/main66f、Playwright及Codex metadata修复。

## Acceptance criteria

- [x] Root静态源审、旧motion反事实RED/新实现GREEN和相称回归通过。
- [ ] 精确sourceCI/main/新542.6签名制品与原Kevin110%冷打开≥30秒、阅读/回底/展开/切回；草稿/失败发送/未知操作不动。
- [ ] 项目/设置/聊天滚动、Playwright及新Codex长turn同包验收、同制品101发布与摘要。

## Completed

- producerC3/implementation062/remote clean/sourceDigeste411与main66f祖先已核；从main66f clean task-init PASS后整支FF接收，原author工作区不改。
- Root完整审阅2产品delta、motion完整owner/observer cleanup、测量投影patch、任务Footer真实fixture与作者证据；不新增follow意图/写scrollTop或模型权限。

## Verification

- 作者WebKit/Chromium完整+新增回归、原生WK110反事实、68DOM/type/lint均为作者证据；Root独立WebKit旧motion稳定FAIL/当前GREEN；合并94DOM、type/lint通过。预留542.6，只改buildmetadata；不冒已安装修复。

## Blockers and unknowns

- 唯一desktop/sharedCI/mainowner01a12bc2；最终范围固定542.6，精确commit/remote后freeze；后续独立功能下一批。542.5首次流水线90999只收实际结果，不重复build/sign/Apple。日常仍542.2，jitterowner已交回窗口，实际维护仍须fresh检查和一致backup，不发旧业务或取消任务。

## Next step

- 收3version/4doc和diff后保存精确Rootsource/handoff，唯一PR自动exactCI/main；新542.6同制品原生+101，不能停在PR或包。
