# MOXBOT-20261027-COMPOSER 验收

当前状态：实现、本地验收和独立审阅通过。尚未合入 main，未发布或安装新客户端。

目标：移除 Composer 上方两个完整框，将执行短状态、任务计数和固定右侧待验收入口合成一条32px无外框摘要，详情按需互斥展开。现有 Session task ledger、执行准入、自动恢复、调度、权限和原有 Goal/Inspector 回调保持原 authority。

## 实现

- SessionExecutionStatus 拆为只读 presentation 与嵌入详情，ExecutionStatusBar 独占 disclosure；执行目标、原因、轮数、验收条件和证明覆盖进入详情。
- 摘要使用短状态“执行未确认”“状态待同步”；待验收入口仅打开任务详情，不创建验收、自动执行或修改账本。
- Escape 返回实际点击的入口；键盘可达；鼠标动作复用 retainFocusOnMouseDown，保留草稿与输入焦点；会话切换收起。
- 窄容器沿用左侧滚动，待验收/Goal控制固定右侧；空协作不再显示0/0。既有主题语义和字阶保留，不触碰另一聊天正在改动的 Composer 字号文件。

## 验证

| 层次 | 结果 | 证据 |
| --- | --- | --- |
| DOM | 4文件66项PASS；执行投影/旧请求隔离/恢复、统一展开/Escape/IME/会话切换/Goal/后台日志/方案确认 | SessionExecutionStatus、ExecutionStatusBar、useSessionTaskOrchestration、GoalStatusBar现有测试及新增统一展开回归 |
| 类型/定向lint | PASS | 本地 tsc --noEmit / changed-file eslint；日志在工作区 work/MOXBOT-20261027-COMPOSER/ |
| 测试分类 | PASS | 462 server tests，132 integration/6 credentialed分类核对；未运行真实凭据池 |
| 构建 | PASS | MYAGENTS_BUILD_PROFILE=moxbot npm run build:web；许可验证、31主题CSS映射及8主题测试通过 |
| 实际组件 | Chromium/WebKit共42组PASS，0页面异常 | evidence/results.json；check.mjs与preview/fixture可复现 |
| 视觉 | 主Agent与独立审阅通过；历史焦点P2修复后独立实测通过 | evidence/composer-dark-2x.png、composer-review-2x.png、两引擎4宽度明暗截图 |
| 主干/共享CI | 待既有owner统一集成 | main基线caab6ab648b434bee17930f90c4df4de87564bba |
| 签名制品/安装/生产真实路径 | 未执行，待owner下一未冻结批 | 本聊天不分配版本、不启动共享CI、不重启/替换日常App |

浏览器使用实际生产 ExecutionStatusBar / SessionExecutionDetails / ComposerSurface，Tab API和账本为本地合成：验证32px摘要/无外框、待验收可见、单详情互斥、草稿焦点、Enter/Escape、历史导航焦点、切换会话、运行/返工/暂停/未完成/完成/模型恢复/未知、长内容内滚动、Goal单次暂停继续、中英文和空状态。视口320/390/768/1440，明暗各覆盖；未证明真实Provider或已安装签名WebView路径。

夹具修正：首次引用路径错误、旧版本Playwright默认浏览器不存在，已改相对路径并复用现有独立headless缓存；空账本夹具revision0被正确拒绝为旧快照，改为同修订可接受快照后双引擎PASS。没有降低产品旧快照门禁；旧测试名称随UI更新，嵌套region按实际详情名称核对。

## 复现

使用Node24和已有node_modules：

```sh
MYAGENTS_BUILD_PROFILE=moxbot node node_modules/vite/bin/vite.js --config dev-docs/composer-status-20261027/vite.config.ts
MOXBOTS_QA_CHROMIUM=<existing-headless-shell> MOXBOTS_QA_WEBKIT=<existing-pw_run.sh> node dev-docs/composer-status-20261027/check.mjs
```

仅监听127.0.0.1:5277；环境变量可按本机现有Playwright版本调整，没有访问用户Chrome或新增公网服务。

## 交付与归属

仓库 https://github.com/heavenzhang/MoXBots.git；分支 codex/composer-status-20261027；任务 .agent-sync/tasks/codex-composer-status-20261027-6e72312b.md。部署单元 desktop/macOS-arm64/updater；combined CI/main、正式版本/构建/安装/发布沿用唯一会话01a12bc2-907a-7702-b6dd-788225c5dfe4。没有Host/mobile/cloud/API/数据迁移依赖，旧制品可回滚。最终head、远端和发布队列回执记录在工作区 result.json。

## 执行记录

主Agent实现及整体验收；新增1名非实现者 composer_ui_review 按 ai-yaoren-local 做独立有界源审和视觉复核，requested gpt-6-luna/medium，实际型号/effort未由运行时确认。独立审阅确认1个P2历史导航焦点问题：先加入回归复现RED，再修正详情切换聚焦和无历史时隐藏入口，66项/42组及非实现者定点绿测复核通过，1轮修复。升级原因：无。选择依据：同组件组由主Agent实现，独立审阅避免重复整套实现上下文。不调用外部原因：明确采用ai-yaoren-local纯内置模式。用量、费用和提速未测量。复盘：一次共享disclosure覆盖状态与任务，比只删边框更直接；后续沿用同一夹具并保持有效ledger修订值。


| 参与者 | 职责与模型依据 | 验收与修复 |
| --- | --- | --- |
| 当前主 Agent | 实现、主验、Git与交接；GPT-6家族，精确型号/effort未知 | 66 DOM、42浏览器场景、构建/类型/lint PASS；修复1个历史焦点问题 |
| /root/composer_ui_review | 有界独立源审/视觉与历史焦点复验；requested gpt-6-luna/medium，实际型号/effort未知 | 独立检查通过；1项P2经1轮修复后定点绿测关闭 |

独审详细结论见[review.md](review.md)。本轮总费用和token未由运行时提供；不推算节省。
