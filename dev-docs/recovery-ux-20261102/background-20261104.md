# MB-RECOVERY-UX-20261102 后台处理与必要提示

用户明确将“核对操作结果”改为后台处理，只有当前任务确实被阻断且需要人提供信息时提示。本次不是删除保护记录或放开未知操作重放。

## 可观察行为

1. 旧的6条未知记录如果不阻断当前执行，顶部、底部均不出现核对提醒。后台检查中、成功和无法检查均不单独向用户报待办。
2. 当前任务必须处于已结束的暂停/未完成状态、原因精确为TOOL_OUTCOME_UNKNOWN，并有当前执行证据中的pending mutating调用与原生toolUseId准确对应，且原owner已无法继续自动核查，才显示信息请求。运行/Stop/已完成/尚未结束/其他调用/活跃委派不作提示。
3. 提示说明操作、已知文件名、准确绑定任务及后续步骤、已有检查结果和按操作类型给出的处理办法；原命令/原始参数不复制到横幅，可沿原Chat scrollToTool定位原工具。具体对象缺失时如实说明。
4. 信息入口保留原持久补充和延后；查询只准备草稿。保存补充、关闭或延后均不认定成功、不解除未知保护。
5. 本次没有新调度器/数据库/模型调用授权。检查随原会话空闲revision和已有输入准入触发；原一次性只读核查沿既有执行owner，Stop、次数限制和资源保留有效。

## 验证

Node24，本地unit80、DOM55、integration118（253项）通过。tsc、scopedlint通过；分类、npm run build:web（license、theme CSS、8项theme测试）通过。现有708项与0.5.41安装证据属于上一版，本轮不混用。

实际IAB访问本分支dev/recovery-review-preview.html，真实生产组件、合成本地snapshot/输运：Blocked/Historical/All eligible切换；历史/处理完成无提示；阻断操作、影响、办法可见；补充保存后仍保留保护；查询只生成草稿；查看原操作准确传递tool ID；390px可读、详情单滚动、Escape返回焦点。截图和完整日志在协作目录work/MB-RECOVERY-UX-20261102/background-20261104。此处未证明实际Chat历史定位、原生持久化或真实业务结果；交原发布owner在新包上核验。

## 交付边界

分支codex/recovery-background-20261104；基线065f2b6c8fb2aff58e774000909990b531ff8eb8。desktop/macOS-arm64/updater/sharedCI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4；正式版本、批次和制品由其分配。代码、本地验证、远端主干、新包和真实验收分开记录。
