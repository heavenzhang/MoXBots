# MB-BRAND-PROMPTS-20261025 验收与发布交接

## 结果与范围

普通聊天、Claude Code/Codex append、DSH 身份、浮窗、Task/Goal/Cron reminder、注册工具说明、图片理解 helper、语音工具描述和 CLI 详细帮助/错误文案、跨会话通知与 DSH 工具输出读取现有 `APP_DISPLAY_NAME`。根 `CLAUDE.md` 同步 MoXBots 身份，AGENTS.md symlink 保留。

外部 CLI 显式阅读指南和记忆规则模板同步本产品称呼。内置 Markdown 帮助沿既有 `prepare-moxbot-bundles.mjs` 适配，不修改上游模板原件；补齐宠物 Skill 的 YAML 元数据与 Python 生成提示词。仅处理应用自有资源；许可、Cuse、环境变量、header、Skill 名称、协议标签、兼容目录与用户正文保持。

无第二套品牌配置或最终回复替换；profile 仍由 `src/shared/appProfile.ts` 拥有，upstream 构建保留其原产品名。没有恢复保护、权限、业务/配置数据或网络接口修改。

## 本地验证

基线远端 main：`c5fd489b56d2eb2f19923d9dddc5cb6097cd439f`。Node 24，隔离工作树；未触发共享 CI。

| 检查 | 结果与边界 |
| --- | --- |
| Vitest：system-prompt-brand、system-prompt、system-prompt-cli-tools、systemReminder、cron-reminder、cli-tools-registry、vision、myagents CLI及Admin/help、Session通知、external admission、DSH工具、标题、Browser Host和workspace identity | 17 文件 / 554 项通过，含44项 MoXBots 回归、28个 Runtime/场景组合和7个 DSH 场景；原默认profile测试也通过 |
| Node test：prepare-moxbot-bundles + cli-bundle-contract | 9 项通过；覆盖云反馈、命令/协议/许可保留、确定性清单、来源symlink拒绝和宠物生成提示词 |
| TypeScript、修改TS的ESLint、dependency-cruiser、测试分类、agent-docs | 通过；新增测试亦通过独立ESLint |
| 实际 MoXBots profile 的 server/CLI bundle | 本地构建通过，不是签名App或发布制品 |
| 实际 profile 编译后执行的纯提示词probe | 普通身份、DSH、Cron均为MoXBots；moxbot/.moxbot、原Skill标识和用户含上游名称的正文保持 |
| 实际CLI bundle `--help` | `moxbot — MoXBots local external CLI`，无旧产品称呼 |
| 实际资源preparation | 153文件/53个适配文件；helper、docs、CLI Skill、宠物YAML/Python逐一检查无旧品牌 |
| `git diff --check` | 通过 |

本地 `MoxBot/CLAUDE.md` 两处产品文案已修正；修改前副本、SHA-256、日志和 `local-build-proof.json` 保存于工作区 `work/MB-BRAND-PROMPTS-20261025/`。备份不属于生效上下文，不提交机器专用副本。

## 发布请求与剩余验收

- 仓库 `https://github.com/heavenzhang/MoXBots.git`；分支 `codex/brand-prompts-20261025`；精确提交SHA在正式交接中提供。
- 单元 desktop/macOS/updater。combined CI/main、版本、签名、安装与验证继续由 `01a12bc2-907a-7702-b6dd-788225c5dfe4`（MoxBots桌面端统一打包负责人）唯一负责；本分支不触发共享CI，不改冻结包或日常App。
- 请求下一未冻结桌面修复批次。无数据库迁移、协议切换或业务重放；无云/Host/mobile部署请求。Host若后续采用共用server，由原Host owner独立选择。
- 回滚沿原owner的已核验旧制品，不回滚用户数据或历史消息。正式版本/tag、摘要与批次由原owner提供。
- 发布后核对安装包与源码；用新普通会话和DSH新Query/thread查看实际送往模型的身份，确认称呼MoXBots；Task/Goal/CLI各选必要入口复核。不重放截图原业务操作。
- 已有历史正文与固化上下文不重写，按原Runtime新Query/replacement生命周期生效。本地检查不证明旧会话更新、只读解除或真实Provider验收。

当前源码与本地检查完成；远端工作分支、共享CI、main、签名制品、安装、真实Provider分别以各自证据确认。

## 执行记录

当前主Agent会话 `01a17383-d8ec-7d91-9a6f-64a684ac665c` 单人实现、审查和本地验收，零子Agent。选择依据：静态文案改动可由现有矩阵确定性验证；升级原因：无升级；不调用外部原因：采用ai-yaoren-local纯内置模式，无需额外模型。精确模型/推理档位及用量费用未获运行时确认，不估算节省。复盘：继续统一读取既有profile并验证实际编译输出，避免仅检查源码字符串。
