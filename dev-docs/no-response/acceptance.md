# MOXBOTS-NO-RESPONSE-20261020 验收

## 原因与修复

native loader 可以在 generator 已提交新 root、向 stdin yield 后才零轮次拒绝加载推导锚点。原恢复路径将同一个 source item 重新排队，但保留了只适用于准入前旧 interrupted turn 的 guard，旧 guard 因新 root 出现而拒绝。现仅在同步准入提交时释放 guard；未接纳输入的校验、取消、双击防重、显式回溯边界不变。

旧桌面退出后仍存在 PPID=1 的 Sidecar，而新桌面另有同 Session owner。新增的 Unix parent 观察只对 Rust 显式注入的桌面 launch identity 生效，父进程被重归属后进入原 shutdown 路径，作为 Rust exact-tree cleanup 无法执行时的兜底。实际 OS 父子关系不接受复用 PID；Windows 沿用原 Job containment。现有旧实例不被此源码自动修改/终止。

## 验证

- [x] 先红后绿：SDK 消费显式继续输入后拒绝 inferred anchor，旧版无回答；修复后一个可见 root、一次回答，旧 continuation 重复请求仍 rejected。
- [x] 同一恢复窗口 Stop 取消再次 dispatch，SDK 只收到被零轮次拒绝的第一次输入。
- [x] 父进程存活/重归属/重复回调/主动dispose/非法 identity 的10项 unit。
- [x] 实际 Unix 父子进程夹具：SIGKILL 父进程，子进程观测重归属并退出；没有使用用户进程。
- [x] continuation admission / rewind anchor / parent 相关43项 unit。
- [x] TypeScript、改动 ESLint、server bundle。
- [x] 完整相关 integration 140/140；builtin/turn queue unit 199/199；Rust 整 crate 编译后启动参数测试4/4。
- [ ] 主干交付及精确main CI。
- [ ] 签名客户端安装、实际会话恢复和生产业务验收。

原始私有诊断与本机验证日志放在交付工作区 output/no-response-20261020；Git 不保存用户 transcript/凭据/业务结果。此处只记录合成夹具行为。版本、签名、候选制品和安装由既定唯一 publisher 负责。仅开发预检查制品不用于正式发布。
