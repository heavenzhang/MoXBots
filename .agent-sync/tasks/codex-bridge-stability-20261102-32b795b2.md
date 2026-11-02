<!-- git-project-sync-task:source-digest=b455fb61d49f3247050534e026aac1c084b328ac8e96832891e11fbdd08fbc91 -->
<!-- git-project-sync-task:id=180ea629-4a65-4474-b45f-433a207211aa -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/bridge-stability-20261102 -->
<!-- git-project-sync-task:base=20abf33282945c45f26fd8733e3fa709a433c804 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-BRIDGE-STABILITY-20261102

## Objective
修复桥接流取消、代理池生命周期和原生 Anthropic 无恢复包装的流闲置保护；不改重放权限、账本、供应商配置或正式版本。

## Acceptance criteria
- [x] Chat/Responses 通过持有锁的 reader 取消，底层源收到一次取消。
- [x] 代理池最多保留 8 个配置，LRU 淘汰以 graceful close 排空旧请求。
- [x] 原生转发复用 ModelBodyReader 的 5 分钟闲置预算，心跳/畸形事件不续期；保持原始响应字节和协议错误归属。
- [x] 桥接全模块定向回归、类型检查、lint 和分类检查。
- [ ] 远端主干包含成果，共享 CI 由现有 owner 协调。
- [ ] 交接现有 owner 统一发布，安装/真实供应商验收另行记录。

## Completed
实现和回归测试就绪；100 次配置轮换验证缓存有界；真实 loopback 验证退休连接继续完成响应、静默/心跳超时、持续进展、取消。

## Verification

- Source digest: `b455fb61d49f3247050534e026aac1c084b328ac8e96832891e11fbdd08fbc91`; Node 24: 39 bridge suites / 774 tests passed; tsc --noEmit, targeted ESLint, test:classification and git diff --check passed. Real loopback idle/cancel/eviction tests; no provider calls.

Node 24，vitest run src/server/openai-bridge：39 files / 774 tests PASS。定向 ESLint、tsc --noEmit、test:classification 与 diff --check 完成后随提交报告。
首轮失败发现观察器误分类畸形响应，已修复并通过原 context-recovery 回归。没有真实供应商调用、长期内存浸泡或生产写入。

## Blockers and unknowns
部署单元 desktop builtin client，唯一 CI/main/build/release owner 01a12bc2-907a-7702-b6dd-788225c5dfe4。用户要求测试后合主干并交其统一发布，已发送协调请求。无数据迁移、无新增接口依赖；由 owner 分配下一未冻结版本，回滚沿用其原制品。
缓存上限针对可复用池；已退休的活跃流允许排空，不强制切断。未声称解决供应商 HTTP 502。

## Next step
现有 owner 对精确提交运行共享 CI、合入并核对 main，再按既有批次构建发布；复验三协议取消、代理切换、长流和真实模型路径。
