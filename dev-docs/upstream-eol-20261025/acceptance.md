# MB-UPSTREAM-FIXES-20261025 / Windows test metadata addendum

原8组候选320aa3178307b6cf59f971696fc46a64df593459保持冻结，本分支只修新增测试。原有读取用LF字符串切分Cargo.lock，Windows Git autocrlf=true可输出CRLF并误报三套native依赖缺失。

新增回归在真实临时Git库中复制三套vendor来源、Cargo.toml/lock及native测试入口；checkout-index明确autocrlf=true，断言Cargo.lock确实含CRLF后，启动独立Node测试入口。原入口红1项，normalize锁元数据CRLF后33项全绿。原始vendor哈希、允许修改清单、精确依赖版本及未知字节拒绝均保持。独立runner删除继承的NODE_TEST_CONTEXT，以免父runner的内部协议吞掉子测试执行。

- Node24 native/patch/event脚本：33 PASS / 0 FAIL / 0 SKIP。
- 两个test文件ESLint：PASS。
- 产品代码、manifest、正式版本、原vendor文件：与320aa完全相同。
- 原始red/green/lint日志本目录忽略，SHA在checks.json；源branch由原CI/main owner选择纳入0.5.23，不打开共享PR/CI、不构建或发布。

此验证模拟Windows Git行尾，未声称Windows原生验收。最初以320aa为新任务起点的start被正确阻止；仅撤回自有测试patch、从实际main848e新分支通过start/task-init后，FF至320aa再继续补充，未绕过门禁或改写他人/已发布分支。
