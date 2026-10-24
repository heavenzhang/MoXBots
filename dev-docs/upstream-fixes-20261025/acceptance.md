# MB-UPSTREAM-FIXES-20261025

## 范围与基线

用户明确授权适配八组修复、保留 MoXBots 导航/模型管理/恢复机制，完成测试并交付远端 main，再交既有负责人统一发布。目标 `https://github.com/heavenzhang/MoXBots.git`，基线 `848e333455c7045534bf51a951a19b6945c6aa1a`；上游固定 `9d7f3710da46188e53bfe32ad8390a8343fc13ea`。本分支为 `codex/upstream-fixes-20261025`，主 Agent 为集成/验收负责人。

| 组 | 实现与验证入口 | 当前结果 |
| --- | --- | --- |
| 输入恢复 | exact Query SDK activity、Stop quarantine；builtin transcript / query-activity / MCP observer | 原 main 复现 ambient、Stop 两项失败；适配后三项回归通过，原 durable recovery Stop wrapper 保留 |
| 新对话隔离 | Rust lifecycle + SessionEngine mutation + TabProvider projection | Node/DOM及组合Rust通过；端口/可见性窄依赖已修复，source与lease回归通过 |
| Renderer/SSE恢复 | main_renderer、Tab persistence、history-free live snapshot | Node/DOM/CLI与非实现者组合审阅通过；真实WebContent/Provider交既有发布负责人组织 |
| 原生退出与事件 | 配对 vendor/JS 依赖 | 作者原生退出6/6、真实WKWebView九个压力检查点资源归零；上游原始vendor字节/许可保留 |
| 滚动定位 | Virtuoso取消/小数几何 | 主 Agent集成树Chromium1243、WebKit完整通过，独立依赖/DOM复核通过 |
| Runtime选择/DSH退役 | runtime_identity、process-host | DSH单测、合成外部Runtime集成及Rust runtime identity矩阵通过 |
| 自定义记忆兼容 | memory_rules、managed Task prompt、bundled Skill | 脚本/renderer/Skill及Rust parity/Task回归通过；Rust/TS内置Skill快照62 |
| 渠道重新启用 | locked config候选enabled校验 | Rust新增平台矩阵、重复启停与拒绝不落盘回归通过 |

## 冲突与必要依赖

- 保留冷启动空 Launcher、原更新草稿入口和失败阅读 Tab 重试；不套用上游删除失败 Tab 的策略。导航/模型维护界面不重设计。
- `withUpdateAdmission` 仍包裹新 transition。恢复 ledger、Stop 持久化、原任务身份/预算和已接纳输入权限保持原 owner；不因应用更流畅而重放不确定操作。
- `de3f2b67` 的离线权限编辑依赖未引入的 access/blacklist 子系统，未纳入；其新对话/当前 generation 修复已适配。
- Router端口/lease投影补入 `3c16fc83` 的窄依赖，保留本 fork 更严格的 Tab+Agent 准入。
- 新 vendor 需要 Windows 精确字节 checkout。补入 `b51e7245` / `ac080470` 的属性、先全量验证再修复已知 CRLF 的逻辑和 Git checkout 回归，并扩展精确换行属性到三套 vendor；不接受未知源码差异、不改共享缓存。
- 内置Skill内容变化必须由既有版本门收敛；已装61的正常目录会跳过复制，因此同步Rust/TS快照62。正式App版本及Runtime选择仍维持基线，后续由发布负责人分配。

## 组合验证

- `combined-behavior.log`：23文件，**1387 PASS / 0 FAIL / 0 SKIP**。包含 builtin/external合成集成、App/TabProvider/Companion、CLI、SSE、SessionEngine、scroll、exact Query、MCP/DSH、Skill。
- `combined-typecheck-final.log`：TypeScript通过；`combined-lint.log`：全量ESLint通过（只有现有浏览器兼容数据年龄提示）。
- `combined-dependencies.log`：0错误、18项既有 no-orphans 警告；无抑制。
- `combined-classification.log`：460 server tests分类通过。
- `combined-web-build.log`：Web生产配置构建及license/theme校验通过；这是静态构建，未生成正式App制品或发布。
- `combined-build-scripts-bounded.log`：全量43文件、344 PASS / 0 FAIL / 14平台专属SKIP（共358项），test-concurrency=2、断言不变。此前默认并发有两项子进程超时，失败日志保留；未改计时阈值或断言。配对框架及三套vendor真实Git autocrlf checkout定向33/33通过。
- `combined-browser-chromium.log`：root集成树真实生产 MessageList/Markdown/controller/CSS，隔离Chromium1243全部滚动检查通过。证据临时目录 `myagents-scroll-verification-IGJ9q5`。
- 原生作者证据：`../upstream-native-20261025/{acceptance.md,native-evidence.json,source-invariants.json}`。主 Agent核查原ExitRequested handler、原updater/process-tree owner未被替换。
- `combined-browser-webkit.log`：root组合树完整WebKit通过，证据 `myagents-scroll-verification-WxuYba`；主 Agent已查看Chromium最终页面，生产组件状态行与正文无重叠，几何由脚本逐项断言。
- Rust：固定1.92、offline/locked、jobs=2组合test编译通过；直接运行该二进制所发现的相关用例134 PASS / 1既有Cuse手动验收忽略，再补不重叠77项Sidecar回归全部通过，共 **211 PASS / 0 FAIL / 1 IGNORED**。`rust-selection.json` / `rust-sidecar-selection.json`保留精确选择和编译源码；Clippy项目redlines通过。
- 完整 `cargo fmt -- --check` 发现199处既有风格差异，包含本任务未修改的build.rs；项目CI未把全仓格式列为门禁。本任务不改写无关源码或原始vendor。新增/移植Rust已由rustfmt解析，类型、行为、Clippy和非vendor差异检查通过。
- 非作者审阅：`review-transitions.md`，独立395项Node/DOM通过，无阻断发现；scroll有独立67项DOM/7项依赖补丁复跑；输入恢复有独立exact Query/Stop静态审阅。

原始命令日志在本目录忽略的 `evidence/`；小型结果与日志摘要在 `checks.json`，保留机制的Git对象核对在 `compatibility-proof.json`。作者各测试池存在重叠，只按该组合结果报告，不累计作者全部次数。当前本地验收完成，精确候选的共享CI、远端main核验和负责人正式接收仍待进行。

## 失败证据与边界

输入修复前两条回归确实失败，首轮补丁末尾的合并标记解析错误另存，不冒充业务红测。首次组合Rust编译暴露可见性和Router参数遗漏，必须修复后复核；中间一次重试因待提交index阻止补丁应用，未作为修复验证。

作者滚动首次加载共享旧包导致所有权检查失败，改为工作树私有依赖后复绿。Chromium早先两次footer缩小超时缺少当时几何证据，原因未归属；保留失败并加入超时采样。root当前组合完整Chromium已通过；最终WebKit结果另记，不把一次重跑成功说成历史原因查清。

Rust单测编译使用官方CI同类惰性占位资源；CLIProxy从已有签名副本复制并由原build gate校验。没有构建/执行产品App，不用占位资源生成发行制品。无真实账号、业务记录或用户记忆写入；无日常App退出/重启、Host切换或公网变更。原生fixture与合成SDK不替代真实Provider、已安装App或真实业务验收。

## 交付和发布单元

桌面/macOS/updater及combined CI/main负责人：`01a12bc2-907a-7702-b6dd-788225c5dfe4`。Host软件负责人：`01a12b99-7b38-78b1-831f-9c60257d386a`。已分别预登记，Host明确确认仅下一未冻结批无候选登记。后续须发送精确候选/base/tree、所含组及排除项、验证/失败/审阅和main/CI回执；既有冻结App/IPA/Host不变。主干、制品、正式发布和真实路径分开跟踪。

执行为一个主Agent及三个隔离内置worker，模型/effort为请求值：原生和切换sol/high、滚动/记忆luna/medium。没有外部模型调用或模型升级；三线并行减少了顺序移植等待，编译槽串行避免争用。实际token与金额未知，不估算节省比例。
