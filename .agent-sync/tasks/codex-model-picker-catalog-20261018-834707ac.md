<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-picker-catalog-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: MODEL-PICKER-CATALOG-20261018 模型搜索筛选与目录 API 修复

## Objective

备用模型按供应商、密钥配置筛选并搜索模型名称/ID；修正已证实的模型目录 API 与协议来源错误。不删除用户保存模型，不以目录存在宣称推理可用。

## Acceptance criteria

- [x] 搜索、筛选、键盘选择、空结果、已选项保留、保存失败回归。
- [x] 模型目录 API 官方来源核实、无费用 GET 与针对性回归。
- [x] 定向lint、独立UI15项、最终DOM12项；首轮远端TypeScript/lint/unit通过。
- [ ] 最终候选完整CI与远端main。
- [ ] 由已登记唯一发布 owner 发布及真实客户端验收（本聊天不并发换包）。

## Completed

已实现搜索/供应商与密钥过滤、保留选择和原保存流程；OpenRouter内置及官方base自定义供应商账号目录、Go官方目录与三协议路径修复；旧精确默认URL升级、自定义URL保留。主 Agent 拥有 UI/集成；catalog_api 负责 API/协议，ui_acceptance 负责独立合成页面审阅。

## Verification

详见 dev-docs/model-picker-catalog-20261018/delivery.md 与 api-verification.md。DOM 28项/组合52项、API81项通过（计数重叠不相加），定向lint与classification通过。真实无费用OpenRouter200：账号468/通用471；Go自有UA200：37。独立Chromium15项通过，最终DOM12项通过；主Agent独立GET200/468并审查实际diff与截图。首轮远端TypeScript/lint/unit通过；完整CI、构建与main待完成。

## Blockers and unknowns

真实推理调用未获新增费用授权；只作无费用目录请求。桌面发布 owner 01a12bc2-907a-7702-b6dd-788225c5dfe4。

## Next step

PR116已建立，完成最终候选CI及主干交付；随后由唯一发布owner按任务记录接续桌面发行与真实验收。发送发布会话消息的用户授权已通过async提问申请，未获答复前不发送。
