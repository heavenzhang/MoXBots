# 模型目录搜索 UI 验收

**范围：** `MODEL-PICKER-CATALOG-20261018` 的隔离渲染验收。页面调用当前 `CustomSelect` 与 `ModelFailoverSettings` 生产组件，使用 3 个合成供应商、240 个合成模型；密钥也是 fixture。没有连接真实账号，也没有真实模型推理或持久化写入。此次只做验收，没有修改产品代码。

**浏览器：** headless Chromium 153.0.8010.12，独立临时上下文；视口 1440×900、800×700，并辅助检查 390×844。页面 `http://127.0.0.1:5198/model-picker-qa.html`。项目主题为 Codex light。浏览器受宿主机高负载影响。首轮检查脚本有两处 harness 错误（搜索用例未打开菜单；密钥筛选用例未同时限制供应商），修正后重跑通过；它们不是产品缺陷。首次无障碍审查另发现选项密钥状态未进入可访问描述，主 Agent 已在 `CustomSelect` 增加 `aria-describedby` 关联；本轮更新后的完整复跑包含该修复。

**结果：** 15 项均通过，页面无 console error 或 uncaught page error。完整复跑对 240 个模型选项逐一检查 `aria-describedby`，确认密钥状态描述正确覆盖“已配置/未配置”两种状态：

- 桌面初始布局无横向溢出；搜索打开时焦点进入输入框。
- 中文模型名 `Kimi 模型`、ID 子串 `deepseek/model-7` 及多词 `openrouter model-7` 都返回预期集合。
- 切换供应商与“仅显示已配置密钥”联合筛选不会改变已保存模型选择；空结果提示正常。
- ArrowDown 聚焦首个匹配项，Enter 选择后焦点回到触发按钮；Escape 关闭并返回焦点；重新打开时搜索词清空。
- 240 项列表可在内部滚动；靠近视口底部时菜单向上翻转并保持在视口内。
- 800×700 无水平溢出且菜单留在视口内；390×844 辅助检查无水平溢出。

**代码与无障碍审查：** 搜索框有可访问名称和可见焦点样式；触发器暴露 `aria-expanded` / `aria-controls`；选项由原生按钮承载，方向键和 Enter 可用。密钥状态最初未进入选项可访问名称；主 Agent 已通过 `aria-describedby` 把后缀状态关联到各选项。本轮检查确认 240/240 选项均关联到正确状态文本。未使用真实屏幕阅读器验证语音输出。

截图均来自合成页面并已实际查看：

- `desktop-search-zh.png`：中文搜索结果及状态后缀。
- `desktop-provider-filter.png`：供应商筛选时保留原模型选择。
- `desktop-list-scrolled.png`：长列表内部滚动到底部。
- `desktop-flip.png`：视口底部的菜单向上翻转。
- `narrow-800.png`：800×700 打开菜单的布局。

可复跑脚本：[`ui-acceptance.mjs`](./ui-acceptance.mjs)。默认使用 Playwright 配置的 Chromium；若本机二进制位置不同，可通过 `MODEL_PICKER_QA_BROWSER` 指定浏览器 executable。

**限制：** 此为合成组件浏览器验收，不代表 Tauri 原生 WebView、真实账号权限/持久化、供应商调用或生产路径已通过。

## 复跑

从仓库根目录复制 `fixture/model-picker-qa.html` 到 `src/renderer/model-picker-qa.html`，复制 `fixture/model-picker-qa.tsx.txt` 到 `src/renderer/model-picker-qa.tsx`。启动 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5198 --strictPort`，再运行 `node dev-docs/model-picker-catalog-20261018/ui-acceptance.mjs`。使用仓库要求的 Node 24，验证后删除这两个临时源入口。fixture不包含真实账号或密钥，不作为产品页面发布。
