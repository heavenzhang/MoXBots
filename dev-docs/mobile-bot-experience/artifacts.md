# MOBILE-BOT-IMPLEMENT-20261101 · 成果连续性

## 目标与范围

- [x] 真实源码核验：成果 descriptor、下载状态机、Desktop/Host 两条 list 路径、immutable AssetStore。
- [x] 独立文件、相同名称的不同内容分别保留；以真实 artifactId + SHA-256 展示内容标识与 Bot/会话来源。
- [x] 原 transcript 分页后接同 scope/session 的 immutable store 历史；空 transcript 仍可读取之前已捕获的真实成果。
- [x] 用户明确点击“继续修改”后回到相同会话；以原文件 ID/Hash 作为待发送草稿引用，绝不自动发送。
- [x] 保留下载、查询状态、暂停、继续、预览、分享、移除本机副本及 owner/epoch/Hash 隔离。
- [x] 文件内容/权限/分页策略测试；手机 typecheck、lint；Host cargo check。
- [ ] 主负责人集成 index.tsx 的草稿恢复、追加和提示，验收已有草稿与已满草稿（由主负责人负责）。
- [ ] Desktop cargo check/CI、真实账号与手机安装版本验证、主干交付、统一 CI/发布（由原发布负责人负责，本子任务不提交/推送/CI/部署）。

## 核实事实与后端修复

`mobile/asset-store/src/lib.rs::register_artifact` 已经复制实际文件字节至私有 store，按完整 scope/session/name/mime/size/hash 去重；同名文件内容改变会产生不同 opaque ID。Host 的 `find_owner_source` / `bind_ready_upload` 也持有校验完成的不可变文件。旧数据没有被新消息主动删除，但原 Desktop `list_from_owner` 和 Host `owner_list` 只返回当前 transcript 附件页，使之前已存储、当前 transcript 不再引用的内容无法从界面重新发现。

本次共用 `ArtifactListPosition` / `AssetStore::artifact_delivery_page`：

1. 每次请求仍先走原账户、target、session owner 的权限检查和列表解析。隐藏、归档、失效、跨工作区或 owner 读取失败不会降级为绕过权限的本机列表。
2. 原 owner 尚有后页时保留原 cursor。owner 最后一页处理并捕获实际字节后，返回同 scope/session 的 store 第一页；owner 空页同样从 store 读取。owner 最后一页的已捕获文件包含在该 store 分页中，不丢弃最后一批交付。
3. store 后续页使用 `history.v1.<canonical UUID>`，与原 transcript 的 `v1.*` 游标隔离。历史页仍执行原 owner 检查，之后只返回该 scope/session 原有 immutable descriptors。
4. 如果历史阶段与之前 owner 页有相同 ID，手机按 ID 去重；同 ID 出现不同 metadata 时拒绝覆盖。所有文件内容继续由原 Read/download/hash 路径验证。

两个适配器均接入：`src-tauri/src/agent_network/remote_assets_target.rs`、`src-tauri/headless-network/src/connector.rs`。未新增任意路径读取、对外接口、权限或存储副本系统。

## 导航与主负责人接口

`ArtifactChatReturn` 增加可选字段：

```ts
revisionDraft?: { artifact: ArtifactDescriptor; text: string }
```

`ArtifactScreen` 使用 fresh signed-in account 打开的原 owner，显式点击后保存 hint 并走 Expo Router back/replace。主负责人在现有 fresh account/catalog + exact agent/session snapshot 校验通过后处理该字段；等待原 `DraftPersistence.activate(...).ready`，将 reference 追加至原草稿，再消费 hint，不能自动调用 send。

`artifactPresentation.ts`：

- `artifactContentLabel(artifact)`：Hash 前 12 位用于短标识；展开显示完整 ID/Hash。
- `mergeArtifactPage(previous, incoming)`：保留多文件和同名不同内容；拒绝相同 ID 的 metadata 改写。
- `artifactRevisionDraft(artifact, {agentId, sessionId})`：引用 JSON-quoted 文件名、完整 ID、完整 Hash 和来源。
- `appendArtifactRevisionDraft(existing, reference, maxLength=8000)`：追加并保留原草稿；超限返回 `null`，不截断或覆盖。

## 视觉与真实性边界

已阅读 V8 `alignment.md` 并查看 `evidence/versions.png`，采用同层级简洁卡片、sage token、来源展开区和明确“继续修改”入口。全部色彩引用共享 mobileTheme。尚无真实 lineage、时间、消息 ID 或顺序字段，因此没有伪造 V1/V2、最新版本或按文件名推断历史。界面显示真实内容差异与当前 Bot/会话来源。

历史范围是该授权 scope/session 已经通过原 list 捕获的不可变文件，受既有 quota 约束；session-bound Ready 输出已从临时缓存 TTL 清理中排除。未绑定 ready/cancelled 上传仍保留原 24 小时清理、uploading 仍保留 1 小时清理，容量满明确拒绝新增，不自动淘汰交付。未被捕获且原路径被覆盖的字节无法恢复，本次不声称全量历史审计。owner 授权、非法引用、路径不一致、符号链接、权限或普通 I/O 失败继续 fail closed。仅原完整 owner 授权通过且路径已验证后，明确 ENOENT 的附件源会被跳过并推进真实附件 cursor；随后原 store 可列出已捕获历史，不做通用错误 fallback。内容重复导入保持原去重规则，不声称每次重复交付都有独立事件。

## 当前验证

- 手机 `npm run typecheck`、`npm run lint` 通过（初轮及最终回归）。
- `node --experimental-strip-types --test tests/artifact*.test.ts`：15/15，包含多文件、同名不同内容、分页去重、immutable metadata、草稿引用与账号/会话隔离。
- `cargo test --manifest-path mobile/asset-store/Cargo.toml --locked --lib`：14/14；新增测试使用真实文件字节，改变/移除原始文件、执行七天后临时缓存清理后，空 transcript 历史分页仍能读到旧字节，并拒绝跨 key-generation/session 读取；未绑定临时 ready 上传继续按 TTL 清理，包含原 scope/hash/path/quota 回归。
- `cargo check --manifest-path src-tauri/headless-network/Cargo.toml --locked`：通过，耗时 28.05s（本地首次编译依赖）。
- JS `assets.integration.test.ts`：13/13，包含已删除源、后续有效文件补页、隐藏会话拒绝、真实目录权限失败与悬空 leaf/parent symlink 均拒绝、原路径/工作区拒绝回归。
- 根项目 `/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit`：通过。
- JS 两个改动文件的 ESLint `--max-warnings=0`：通过。
- AssetStore `cargo clippy --locked --all-targets -- -D warnings`：通过。
- `git diff --check`：通过。
- Expo 58 / Router 官方说明已核对：https://docs.expo.dev/versions/v58.0.0/ ，https://docs.expo.dev/router/introduction/ 。
- 未进行真实设备/账号/原生文件预览与分享、生产操作或正式发布；主负责人安排整体界面验收与原发布负责人交接。

## 执行记录

本子任务单 Agent 执行，无额外子 Agent、无外部模型调用。收益为复用实际 immutable store 和现有原生下载状态机；token/费用未取得独立可核实读数。未触碰 index.tsx、SessionHomeScreen、Bot 配置、native.ts、共享主题或其他 Agent 文件。
