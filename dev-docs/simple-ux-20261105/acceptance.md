# MB-SIMPLE-UX-20261105 首批验收

2026-11-06，Asia/Shanghai。用户确认四场景示意并要求逐步实现。首批 UX-01～06，以现有生产组件为基础补齐日常布局与输入操作；后续项见 PLAN.md。

## 实现与既有能力

- UX-01：Chat 默认收起右侧工作区；主动打开/关闭使用按工作区隔离的本机 UI 偏好，宽窗新页面可恢复，窄窗启动不自动遮挡聊天；显式文件定位仍走原 disclosure reducer，临时展开不写默认。偏好存储拒绝时仍可操作，不修改 config.json。
- UX-02：原 ExecutionStatusBar 单一 disclosure owner 继续负责执行/目标/任务详情，去除摘要外围框。真实异常和待验收入口、原 Goal/任务回调、Escape 和草稿焦点处理沿原逻辑。
- UX-03/04：核对卡、中断说明、查看详情和原安全核对流程已经存在，本批复用并回归，不新增“确认即完成”或重试操作；未知结果继续保留保护，失去响应后查询原权威而不重复提交。
- UX-05：工具入口收为图标与启用数量，保留文字可访问名称、提示和展开状态；自动模型显示“自动”，完整当前模型通过焦点/悬停提示及 accessible name 可读，菜单选择及锁定继续走原 owner；手动模型保留名称，权限模式常显。
- UX-06：中文组词、发送失败保留新草稿/附件、会话注释scope、历史阅读与队列编辑取消已有实现，本批只做必要回归。

## 本地证据

| 检查 | 结果 |
|---|---|
| 布局 reducer / Shell 合同 | 2 文件 28 项通过 |
| Input/IME/状态栏/恢复卡/草稿/滚动/偏好 DOM | 10 文件 173 项通过 |
| Tooltip/排队消息/更新草稿 | 3 文件 27 项通过 |
| TypeScript | tsc --noEmit 通过 |
| 修改文件 ESLint | 0 errors，0 warnings；依赖数据的 baseline-browser-mapping 提示与本改动无关 |
| 测试分类 | 483 server tests，140 integration / 6 credentialed，分类通过；并未执行真实凭据测试 |
| dependency-cruiser | 0 errors，20 warnings（现有 no-orphans 等警告，未声称零警告全仓通过） |
| Renderer 构建 | 默认及 moxbot profile 均通过，31 主题 CSS 映射及 8 主题回归通过；不是正式签名包 |

原新增工具菜单测试首次使用了错误的标题文本，失败日志保留在本地原始证据；按实际翻译修正后复测通过，未降低交互断言。

原始日志存于协作工作区 `work/MB-SIMPLE-UX-20261105/logs/`，Git 只保存精简、无业务数据的检查清单。

## 尚未完成的门禁

- 真实 renderer 视觉/键盘/宽窄页面：尝试内置浏览器返回 `Local browser use is disabled in Work settings`，不绕过设置、不开用户 Chrome。DOM 通过不代表此项通过。
- 非实现者只读源审已完成；1项P2背景透出风险已修复并复审关闭，见 review.md。
- main/共享 CI、候选版本、签名制品、日常原生安装及用户路径复验均未完成。不得称本批已发布。
- 本批不发真实模型消息、不重放原业务、不登录其他账号。真实业务写入验收不适用于纯 UI 变更；发布后仍须真实原生阅读、输入、菜单、恢复入口复验。

部署单元 desktop/macOS-arm64/updater/sharedCI/main 的唯一负责人为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`，开发不另开 PR/共享 CI、版本或构建。请求下一未冻结批，保留冻结 542.1；具体批次与版本由负责人裁决。无其他单元或迁移依赖。

## Git交接

实现提交 `ac3aa8c56da5fcd625bbdd368605ca344b15e7f0` 已保存到 `origin/codex/simple-ux-20261105`，project-sync handoff通过，工作树干净。仓库内旧同步脚本不支持save，本任务使用当前已安装git-project-sync脚本保存，未改项目技能副本。文档收尾提交不改变已验证的产品字节。远端main仍由既有owner统一集成，当前不宣称包含本任务。
