# MB-BOT-R1-20261101 · 实现与验收

用户于 2026-11-01 明确确认：第一轮实现 Bot 身份命名、内置头像选择及各入口一致展示；群组/任务关系先做第二轮原型。

## 代码结果

- 长期身份的侧栏、创建/设置入口、能力标签改为 Bot 文案，中英文同步；协议名、配置字段、Runtime 和临时子 Agent 沿用原标识。
- 三款本地头像以 `bot:mox` / `bot:moss` / `bot:spark` 写入原 icon 字符串。新建与设置共用 WorkspaceIconGrid，原 WorkspaceIcon 身份入口统一渲染；旧图标、旧 ID 映射和 emoji 继续支持，已有选择不批量改写。
- 会话标题显示真实 displayName/name 和 Bot 标记；点击身份打开现有设置，话题标题仍独立。更名不再受目录 basename 限制。
- 右侧明确“工作区 · 名称”；选择角色头像时资源区保持文件夹标识，避免把资源环境表达为另一个 Bot。
- 图标保存沿原 Agent/Project 事务。修正默认图标的 undefined 丢失 Agent 更新问题，用空字符串显式同步重置；写入失败保留选择器并显示失败。设置选择器沿共用 Popover，支持 Escape/越界定位。

## 验证结果

- Node v24.20.0，任务独立 npm ci + postinstall；没有改动其他 worktree 的 node_modules。
- 10 个文件 / 164 项定向 unit + DOM PASS：图标兼容、头像选择、默认重置、保存失败、名称和工作区独立、Agent/Project 配置事务、83 项侧栏回归、新建 Bot、英文设置与工作区预览。
- 本地 `MYAGENTS_BUILD_PROFILE=moxbot npm run build:web` PASS（包含 license、CSS/theme 校验；非正式桌面包）。
- `npm run typecheck` PASS；变更 TS/TSX 定向 ESLint PASS。
- `npm run lint:deps`：0 errors / 18 warnings，现有 orphan 警告；`npm run test:classification` PASS。
- 内置浏览器运行 moxbot profile 的真实产品代码，新建 Bot → Mino → 共用选择器 → 青芽/小墨选中均可见。390px 选择器在视口内。没有为浏览器绕过目录选择或产品原生准入。
- 第二轮原型通过真实 DOM/截图观察：返工、回报、验收与依赖释放；交接与重开；新群人数校验、任务创建；Bot 多会话、记忆与统一身份；个人确认进入独立会话；1440/768/390 无横向溢出及深浅色。详见第二轮 README。
- 本地主 Agent 源审完成：图片为本地闭集、无新配置字段/通信入口/模型调用；保护原 ID 与路径。未安排子 Agent；独立审查交既有集成 owner。

截图：evidence/r1-actual-picker.png、r1-mobile-picker.png、r2-desktop.png、r2-light.png、r2-mobile-profile.png。均为合成数据或空浏览器开发配置，不含真实账户业务历史。

## 交付边界

实现与本地/模拟验证已完成；原生 config.json 真实重开持久化、签名安装版、生产用户路径尚未验收。浏览器开发版不等同于 /Applications/MoXBots.app。第二轮仅原型，不接实际群组开发分支，不声称完整复刻 Grok Bot。

desktop builtin client / macOS-arm64 / updater / shared CI/main 仍由 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 负责。开发分支保存后请求下一未冻结批，版本由其分配。不修改当前冻结 0.5.29/529.1 候选、日常 App 或云/Host/mobile/官网。

用户后续要求保留项目：第二轮新增独立项目入口、项目目标/成员/群组/任务/会话汇总及项目目录切换，验证同一 Bot 跨项目会话归属。多项目执行及权限未接真实代码。详见 project-relationship.md。
