# PROJECT-01 · 项目工作台验收

## 实现与事实来源

实际 ProjectSpacePage/View 增加当前工作、项目对话和成果页，资料/成员/编辑/归档/新会话入口保持原回调。projectSpaceWork 只读关联原 TaskStore、Session 冻结项目快照；有混合/缺失 Session 关联的 Task 不猜测归属。

useProjectSpaceWork 仅活动可见页面观察，30 秒刷新，单实例最多 4 个并发、50 个 Session；同实例旧批排空后开始下一批，迟到结果不串项目。Task 读取失败保留同项目缓存并提示；Session 读取失败与过期状态明确未知。超过观察上限有提示。没有新执行、持久化或通信 owner。

成果是原 Task/Goal 的明确完成记录，并非交付文件已存在或用户已验收的证明。Rust task.rs 的 is_transition_legal/archive 只允许 Done → Archived，因此归档 Task 可继续列为完成；归档 Session 不作同样推断。旧完成 Task 不遮住原会话的新执行。

## 本地证据

- 5 个文件共 25 项测试通过：投影 8、观察生命周期 4、工作区块 5、项目页面 3、原项目交互 5。
- TypeScript、修改文件 ESLint、测试分类通过；依赖边界 0 errors，既有 20 warnings。
- MYAGENTS_BUILD_PROFILE=moxbot 的 renderer Vite build 通过；不是正式桌面构建。
- scripts/verify-project-workbench.mjs：隔离 WebKit，真实产品组件和合成数据，PASS。验证当前工作优先、明确成果、打开原 Session 回调、同 Bot 跨项目隔离、部分失败与重试、390px 无横溢、主题和键盘 tabs。
- moxbot profile 最终深浅主题截图检查：当前工作清晰，说明默认折叠，窄屏成果/成员身份可读。测试数据顶部带“本地合成数据”标识，不能视为真实业务完成证据。
- 私有证据位置：WPS 项目 work/MB-BOT-NAV-20261102/project-20261107；日志与截图不进入 Git。脚本可在具备项目依赖和 WebKit 的本地执行：MYAGENTS_BUILD_PROFILE=moxbot node scripts/verify-project-workbench.mjs。

## 未证明的环节

未运行共享 CI、正式桌面构建、日常应用安装、真实账号/TaskStore/原会话业务联调或下载通道更新；远端主干包含与发布由原唯一负责人确认。GROUP-01/HANDOFF-01 尚未完成，不能把本批视为总体目标完成。

## 会话索引联动复核

原会话列表读取中/失败时不能显示无工作或无成果。新增两项反例在初次提交上失败，补齐 View → WorkSection 索引状态与原刷新回调后通过；实际 Page 联动回归另验证 loading → failed → 原 owner retry。最终共25项，类型/lint、WebKit和renderer build复跑通过。保留反事实失败日志。
