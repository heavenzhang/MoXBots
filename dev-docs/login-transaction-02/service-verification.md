# AgentNet login replay/ACK service verification

验证对象：`services/agentnet/src/server.rs`、`services/agentnet/src/native_password.rs`。验证使用隔离 Cargo target dir，未运行生产、浏览器、桌面 App、SSH 或共享 CI。

## 命令与结果

- `CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-service cargo test --manifest-path services/agentnet/Cargo.toml -- --test-threads=1` — exit 0；203 passed、0 failed、8 ignored，耗时 469.86s。ignored 项为需要手动浏览器、显式 fixture 或 opt-in 容器的既有测试。
- `CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-service cargo clippy --manifest-path services/agentnet/Cargo.toml --all-targets -- -D warnings` — exit 0。
- `rustfmt --edition 2024 --check services/agentnet/src/server.rs services/agentnet/src/native_password.rs` — exit 0。
- `git diff --check` — exit 0。

并行全量 `cargo test` 曾有 1 个与本次改动无关的波动失败：`mobile_notification_delivery::tests::provider_timeout_is_unknown_and_stale_auth_blocks_outbound_calls`，断言 left 0 / right 1。该测试单独重跑通过；随后串行全量测试中同一用例也通过。串行全量结果为最终验证结果。

并行全量命令为 `CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-service cargo test --manifest-path services/agentnet/Cargo.toml`，exit 101；汇总为 202 passed、1 failed、8 ignored。单独复核命令为 `CARGO_TARGET_DIR=/Users/zhangshaohua/.codex/cache/login-return-02-service cargo test --manifest-path services/agentnet/Cargo.toml mobile_notification_delivery::tests::provider_timeout_is_unknown_and_stale_auth_blocks_outbound_calls`，exit 0。

定向测试覆盖 replay poll 返回同一有效 session、错误 proof/device 拒绝、Ready 前 ACK 拒绝、重复 ACK 无害且 ACK 后不再泄露 bearer、未 ACK cancel 撤销而 ACK 后 cancel 不撤销、外部 logout 后不重放，以及旧 start response 不带新字段且 legacy poll 仍一次消费。

本记录摘录本次命令及工具返回的汇总结果；没有另存完整测试日志，因此不提供日志文件路径。
