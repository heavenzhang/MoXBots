# MB-FORM-SCROLLBARS-20261106

普通输入框的横向滚动策略和新建项目弹窗的重复滚动已修正，本地实际组件检查通过。CI、主干集成、签名包和已安装客户端验收由既有桌面发布负责人继续处理，不能据本报告认定已上线。

## 范围与实现

- 权威仓库 `https://github.com/heavenzhang/MoXBots.git`，分支 `codex/form-scrollbars-20261106`，主干基线 `13fb88204108a3b1ad9dc1b9a72cea6e673e94f4`。
- 审计 renderer 40 个产品文件中 53 处原生 textarea（不含测试和 dev 预览）；清单见 [textarea-inventory.json](evidence/textarea-inventory.json)。覆盖项目、新建对话、聊天、设置、任务、反馈、社区、录音说明、Agent/技能/命令等输入。清单是源码覆盖证据，不代表逐一打开了 40 个真实页面。
- `index.css` 的 base layer 统一普通 textarea：`overflow-x: hidden`、`overflow-y: auto`、`white-space: pre-wrap`、`overflow-wrap: anywhere`、`min-width: 0`。空/短文本不需要滚动；长链接换行，超高草稿仍可纵向滚动。没有全局隐藏滚动条，也没有覆盖组件工具类或内联的自适应规则。
- 显式 `wrap="off"`、Monaco/CodeMirror/xterm 内部输入不受通用规则约束。单行 input 的原生编辑行为不变。
- 项目标题和底部操作区禁止压缩；独立 div 承担表单滚动，fieldset 仅负责表单分组与 busy 禁用，避免 fieldset 匿名内容盒跨浏览器滚动差异。普通 footer 不再成为额外滚动区；长版本冲突复核仍按原上限滚动，原草稿保留。
- 不涉及后端、权限、配置、持久化协议、数据迁移或其他部署单元。

## 实际布局、交互与窄窗

采用真实 `ProjectSpaceEditor`、真实主题和翻译，通过 Vite 临时入口运行；20 个合成 Bot，mock onSave/onReload，无真实账号、项目保存或模型调用。UI 质量负责人为本任务主 Agent；零子 Agent，此处为作者自验，没有独立审阅。

| 门槛 | 结果与证据 |
| --- | --- |
| 视觉 | PASS。实际查看 WebKit 1440×900、390×844 和 Chromium 520×600 截图，输入与操作区无额外横向/底部滚动轨道，窄窗占位文字正常换行。 |
| 布局 | PASS。Chromium 153.0.8010.12、WebKit 26.0 各 96 组，总 192 组；1440×900、900×600、520×600、390×844；浅/深色；100%/125%/200% 可用布局空间；空/短/长链接/80 行文本。文字、弹窗和页面宽度受约束，普通 footer 的 scrollHeight=clientHeight。 |
| 交互 | PASS。实际输入、横向滚轮不平移、长文本纵向滚动、资料添加/编辑/移除、底部取消可见、mock 保存值完整、取消、版本冲突查看与草稿保留；长冲突复核可滚动到底部并取消。 |
| 编辑器例外 | PASS。显式不换行 textarea 仍保持横向滚动；Monaco/CodeMirror/xterm 形态的内部输入保留独立规则。未宣称启动了三个完整编辑器。 |
| 聊天回归 | PASS。已有 `verify-chat-input-zoom.mjs` 使用真实 SimpleChatInput，两引擎各 60 组，共 120 组；844/520 宽、75–200% CSS zoom、空/加载/长 URL/多行/建议，输入值、垂直滚动与水平不平移通过。 |

项目的 125%/200% 检查使用缩小后的 CSS 视口模拟原生 page zoom 的可用布局空间，不是实际 WKWebView 缩放；聊天脚本使用项目既有浏览器 CSS zoom 路径。这些均不替代签名安装版验收。

- [WebKit 桌面](evidence/webkit-1440.png)、[WebKit 窄窗](evidence/webkit-390.png)、[Chromium 桌面](evidence/chromium-1440.png)、[Chromium 窄窗](evidence/chromium-390.png)。
- 完整度量：[WebKit](evidence/webkit.json)、[Chromium](evidence/chromium.json)、聊天 [WebKit](evidence/composer-webkit.json) / [Chromium](evidence/composer-chromium.json)。

## 故障证据与可复验命令

脚本 `--baseline` 从不可变主干基线读取原 `index.css` 和 `ProjectSpaceEditor.tsx`，不改当前文件。原 WebKit 常规 footer 高 51px、内容 68px，四种输入状态均多出纵向滚动；普通 textarea 的横向策略为 auto。最终基线复验因这两项各四次断言失败而按预期非零退出，见 [baseline-webkit.json](evidence/baseline-webkit.json) 和 [截图](evidence/baseline-webkit-1440.png)。这是实际组件故障复现，不声称证明了用户安装包内原横条的所有触发条件。

```sh
node scripts/verify-form-scrollbars.mjs webkit --baseline # 预期失败
node scripts/verify-form-scrollbars.mjs webkit            # 96 PASS
node scripts/verify-form-scrollbars.mjs chromium          # 96 PASS
node scripts/verify-chat-input-zoom.mjs webkit            # 60 PASS
node scripts/verify-chat-input-zoom.mjs chromium          # 60 PASS
```

Node 使用现有 `/opt/homebrew/opt/node@24/bin/node`（24.21.0），依赖复用已有 node_modules。当前 Playwright 依赖所期望的 Chromium 1212 不在本机，使用已有官方测试 headless shell 1243，通过 `MOXBOTS_FORM_TEST_BROWSER` / `MOXBOTS_ZOOM_TEST_BROWSER` 指定路径；未下载浏览器，未使用用户 Chrome 或用户会话。

## 定向代码验证

- DOM 共 10 个不同文件、59 个不同用例通过（两次调用累计 64 次，其中 ProjectSpaceInteractions 5 项重复验证结构修正）：ProjectSpacePage、ProjectSpaceInteractions、ImeInputActions、SimpleChatInput.ime、ThoughtInput、TextChatComposer、ProjectContextSection、TaskCommentTimeline、SkillDetailPanel、CommandDetailPanel。覆盖输入法、草稿/冲突、任务评论与普通设置编辑。
- TypeScript、定向 ESLint、`git diff --check` 通过。
- 默认 Web 构建和 `MYAGENTS_BUILD_PROFILE=moxbot npm run build:web` 均通过；后者产物标题已核实为 MoXBots；31 项主题 utility 映射及 8 项主题测试通过。默认构建第一次误用了未被识别的 profile 环境变量，实际是 myagents，随后用正确变量完成 MoXBots 构建；不以默认构建冒充 MoXBots。
- 脚本排错中修正了 textarea 嵌套 label 在赋值后精确文本定位不稳定的问题，并改用真实元素定位；中间超时记录不当作产品通过。产品布局修正 1 轮：发现 fieldset 滚动不可靠后将 owner 移到 div，最终双引擎通过。

## 交付与发布

- 所属单元 `desktop/macOS-arm64/updater/sharedCI/main`，唯一负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`；依据为主干共享计划和工作区 `CLAUDE.md`。版本、发布批次、制品摘要由其固定，本会话不分配版本。
- 本地 Web 构建不等于正式桌面制品；没有触发 PR/共享 CI、签名/公证、安装或重启日常客户端。
- 下一步：负责人审阅精确源码，统一 CI/main 集成，纳入下一未冻结桌面候选，签名安装后复验新建项目及设置/聊天长文本。原始用户项目和会话不需写入。
- Git 任务记录与主计划同分支保存；仓库内旧版同步工具不含 save 命令，沿现有普通 Git 提交/推送流程保存并用 handoff 核验，保留 Conventional Commits 的原因正文。

## 执行记录

选择依据：统一 CSS 和一个弹窗的轻量修复由当前主 Agent 直接完成，零子 Agent；没有模型切换或升级。主 Agent 属 Codex，具体运行型号/推理档位与 token、费用未由工具确认。 不调用外部原因：明确采用 ai-yaoren-local 纯内置模式。

集中修复避免了在 40 个文件重复加样式，双引擎验收发现并修正了 fieldset 的实际滚动差异。后续同类修复沿用通用策略和本脚本；保留原生已安装客户端的独立验收门槛。

## Root integration follow-up (2026-11-06)

既有desktop/sharedCI/main负责人独立审阅生产差异、实际组件脚本及WebKit桌面/窄窗截图后，原producer进入PR253自动Test42189796037。该轮666个unit文件通过；DOM331文件/3027用例通过，仅旧NewAgentPanel模板保存用例因拿到已移除节点而失败。NewAgentPanel组件与旧测试在producer与main字节完全相同，未将该失败归因于空间或Provider。

Root使用受控未完成save Promise验证：旧findByText实际命中编辑textarea；save完成后编辑页被移除，旧节点的toBeInTheDocument断言稳定失败。原CI日志和定向RED已私密保留。修正仅为测试结清时序：保留trimmed更新参数和详情文本/Create断言，额外断言pending草稿、禁用输入和无Create；act完成save后在waitFor中重新查询返回详情页。无生产实现、timeout、skip或断言豁免改动。

Root定向NewAgentPanel19 + 项目页2/交互5共26 DOM用例、完整TypeScript、scopedESLint及diff检查通过。浏览器布局生产文件与已审producer完全相同，不重复既有矩阵。新head仍需精确自动CI/main和后续安装版验收。原ARM运行不取消或重跑；全部原job终态后才正常FF更新同PR253。Root分支codex/form-scrollbars-integration-20261106为可接续源码记录，PR原head分支后续仅作为同SHA的FF引用；原作者物理工作区不改。冻结542.4不混入本次源码。

Root已按用户持续交付要求预留下一未冻结0.5.42/build542.5；包含上述滚动条修复、测试settlement及已主干的Playwright/Codex metadata修复。旧542.4已签名制品保持不变；新候选精确源、CI/main、签名包、101/本地安装和安全单一UI窗口复验仍分别待完成。窗口当前由jitterowner优先只读观察，不抢占草稿或业务会话。
