# MB-PLAYWRIGHT-20261106

目标：修复工具页 Playwright 点击启用出现 code 127，保留用户参数与自定义 npm 命令。

## 根因与复现
2026-11-06 已安装 0.5.42；原生工具页点击后显示“预热异常退出 (code 127)”。本机 unified 日志 15:28:04 可复核对应 warmup127。安装 Resources/node_modules/@playwright/mcp 为0.0.68，包含cli.js但无.bin/playwright-mcp。该目录执行预设 npx --help 返回127与 command not found；/tmp 相同命令返回0。

## 修复
统一 stdio launch owner 对精确匹配的内置Playwright预设，核实随包版本、CLI、Node存在后直接用内置Node运行cli.js，不依赖npm .bin或工作目录。自定义包、npm选项、版本不匹配、资源缺失保留原解析。配置预热与各Runtime投影共用此owner。不修改已安装签名包、账号或持久配置。

## 验收与To Do
- [x] 原生页面复现；安装目录与独立目录对照
- [x] 单测14项通过（macOS/Windows无.bin、参数保留、版本不匹配、自定义路径及既有连接回归）
- [x] 安装包实际CLI MCP初始化与tools/list通过：22工具，含browser_navigate
- [x] ESLint与diff检查通过
- [x] 最终类型检查通过
- [ ] 原owner统一审阅、CI、main集成及远端包含核验
- [ ] 新制品签名发布与原生开关、实际网页操作复验

真实CLI握手不等同于原生开关修复已安装；已用安装包CLI在独立headless浏览器打开data测试页并读回标题与heading；未访问用户登录浏览器或业务账号。源码没有新增浏览器权限或跨单元依赖、迁移。仅桌面需要发布。main/sharedCI/macOS-arm64/updater唯一owner仍01a12bc2-907a-7702-b6dd-788225c5dfe4；版本与新批次由其分配，不覆盖冻结542.3，回滚使用原签名制品。

执行：当前Agent单独实现及自审；未启动子Agent，未声称独立审查，费用未知。
