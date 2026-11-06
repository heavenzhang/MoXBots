<!-- git-project-sync-task:source-digest=11339bd9ce38abfd38ce1fadb7492f021101afde195649243c7a563d2fb8a6f6 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=8e7bff26-0817-402a-88a6-fde9dcd2e0ab -->
<!-- git-project-sync-task:branch=codex/playwright-launch-20261106 -->
<!-- git-project-sync-task:base=14956e2fd898ba0cdb9d0be089da524c1a46c91b -->
<!-- git-project-sync-task:status=in-progress -->


# Task: 修复 Playwright 预设在安装包内启用失败

## Objective
修复内置Playwright预设启用127，稳定任务 MB-PLAYWRIGHT-20261106。

## Acceptance criteria
源码回归通过，原owner集成main，新制品原生启用与网页路径通过。见 dev-docs/playwright-launch-20261106/acceptance.md。

## Completed
已复现安装目录npm缺失.bin故障；统一启动owner对匹配的随包预设使用内置Node+CLI，保留用户参数与自定义命令。

## Verification

- Source digest: `11339bd9ce38abfd38ce1fadb7492f021101afde195649243c7a563d2fb8a6f6`; PASS: 14 targeted unit tests; tsc --noEmit; ESLint; git diff --check; installed CLI MCP handshake 22 tools and isolated headless data-page navigation

14单测通过，真实安装资源MCP握手22工具，ESLint通过；类型检查通过；独立headless浏览器data测试页标题与heading读回通过。

## Blockers and unknowns
原生开关修复需新签名制品；尚未main/CI/发布，业务账号页面未验收。

## Deployment request
Required: desktop/macOS-arm64/updater；sharedCI/main同属01a12bc2-907a-7702-b6dd-788225c5dfe4。提交本分支精确SHA与验收记录，由原owner统一集成/CI/版本/发布。无迁移或跨单元依赖。不覆盖冻结版本。

## Next step
原owner审阅并纳入下一未冻结批，验证新包原生开关及网页操作。
