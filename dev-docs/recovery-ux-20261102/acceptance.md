# MB-RECOVERY-UX-20261102

用户批准中断恢复交互方案，当前交付源码与本地验证；主干、统一候选、正式制品及原会话实装验收分别追踪。

## 范围与行为

- 默认紧凑卡片展示系统检查状态，正常会话无恢复入口，不再自动展开内部记录和“0条核对记录”。
- 自动检查每次空闲修订。可核实的仅查询/明确拒绝未执行，由现有带签名的恢复入口和 Session mutation owner 串行保存依据。记录本身不是业务成功，也不会执行命令或向模型发送任务。
- 只有未知记录才留待处理；同一会话仍可交流，通过既有操作级围栏推进独立工作。无效 owner、繁忙/后台/Stop、SDK identity、摘要/CAS、持久化门禁不变。
- 原生记录存在时显示实际类型与文件 basename；原始命令、任意 description、消息正文、URL、环境变量、完整文件路径不投影。记录缺失/重复时明确无法展示，不从模型文本或用户说明推断执行事实。
- 详情为单一可滚动侧栏，窄窗占满宽度，支持 Escape、焦点圈与关闭后返回。关闭不取消自动检查，不删除或跳过底层任务。
- “补充结果或请 Bot 查询”准备未发送的原会话草稿，追加已有输入，保留 checkpoint 锁；实际结果进一步由原任务与既有工具 owner 判定。没有“我确认完成”解锁或通用“重新执行”按钮。
- 继续执行整合进状态卡，保持原组件身份，检查/展示切换不重置已接纳标记。自动检查不会将用户 Stop 转成自动续跑；已有任务自动接续仍由原 execution owner 裁决。

## 验证

- `node@24 vitest run --project dom ... --project unit ...`：9文件159项通过。覆盖自动串行结算、摘要前进、未知保留、无进展停止、丢失响应回读、SDK authority变化、busy/session/unmount/StrictMode、详情关闭、消息草稿回调、焦点、继续入口保持身份，以及原操作级/冷恢复保护。
- `node@24 vitest run --project integration src/server/openai-bridge/context-recovery.integration.test.ts`：28项通过。
- `tsc --noEmit`、变更文件ESLint `--max-warnings=0`、`scripts/check-test-classification.mjs`、`git diff --check`：通过。
- 本地 `vite build`：通过。既有大chunk提示不是正式构建/发行验收。
- Codex IAB：真实产品组件 + 合成 snapshot/回执；1280桌面与390×844，浅/深色主题，未知保留、全部eligible自动完成、详情/关闭、草稿准备通过。截图在 `evidence/`。没有真实Provider调用、原会话业务写入或日常App替换。

## To Do

- [x] 代码实现与作者整审。
- [x] 模拟回归、原保护机制和实际组件浏览器检查。
- [ ] 非实现者审阅：交现有唯一桌面owner。
- [ ] 远端main与精确候选CI：交现有唯一桌面owner。
- [ ] 不可变正式包/版本/tag/摘要/回滚目标与安全窗口安装。
- [ ] 原会话真实恢复/补充/查询及结果持久化验收。

## 部署与接续

部署单元 desktop builtin client/macOS-arm64/updater；唯一 sharedCI/main/版本/构建/部署/回滚 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`，用户当前AGENTS与主干共享计划授权。请求下一未冻结批；开发分支push不触发共享CI，PR/main由原owner协调。无其他部署单元/数据迁移/新公网端点。新增字段可选，旧前端忽略；回滚继续读取原账本并保留原防重放语义。

执行为当前主Agent串行实施与验收，没有新增执行者/模型或第二发布负责人；token与费用未测量。初次验证新增展示字段引起一处原快照断言失败，已更新准确预期；补充TypeScript/ESLint问题已修复。自查发现继续入口动态挂载问题，修复并追加回归。完整最终记录以Git源码及验证为准，截图均为合成数据。
