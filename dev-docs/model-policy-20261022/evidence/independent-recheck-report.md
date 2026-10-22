# 修复复验 a13083257

修复提交b9035fb6合入本地a13083257；同一隔离合成夹具。无产品源码修改。

- UI-01通过：模型文字点击可选，checkbox容器≥32px，390宽名称与复选框关联清楚，无页面横溢。
- UI-02原缺陷通过：对话框有role=dialog/aria-modal及标题；打开首焦点取消，Shift+Tab/Tab在取消与确认间圈定；Escape关闭归焦触发按钮。
- 慢保存通过：900ms保存期间两按钮disabled，Enter/Escape不重复提交/关闭；拦截合成Storage.setItem计数为1。
- 新增UI-03（P1）未通过：对话框首焦点为取消时按Enter，实际保存暂停（qa-provider-a/qa-fast-1.enabled=false），不是取消。全局Enter快捷键仍无条件确认。应修复modal模式下Enter尊重当前聚焦按钮的原生行为。

新增证据：recheck-results.json、recheck.mjs、policy-1440-fixed.png、policy-390-fixed.png、modal-fixed.png、recheck-failure-3.png。本轮不是整体通过；UI-03仍需修复复验。

初次复验8931无监听，记录连接失败后由验收者启动已有serve.mjs（session12924）继续；没有修改root源码或夹具。合成主题默认棕色是继承现有默认token，不作为绿色回归。
