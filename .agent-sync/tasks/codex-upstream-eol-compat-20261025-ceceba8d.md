<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/upstream-eol-compat-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=in-progress -->

# MB-UPSTREAM-FIXES-20261025 / native test Windows addendum

## Objective

在不变更冻结主候选320aa317或产品代码的前提下，修复新增原生依赖测试对Windows Cargo.lock CRLF的误判；独立补充提交由原CI/main/publisher选择组合到统一批次。目标仓库https://github.com/heavenzhang/MoXBots.git，主任务记录codex-upstream-fixes-20261025-39cb4c91.md。

## Acceptance criteria

- [x] 原Git core.autocrlf=true真实checkout会给Cargo.lock产生CRLF，原native lock断言失败；新增回归保留此状态。
- [x] 仅对读取的TOML锁元数据归一CRLF；不改变原始vendor摘要、固定版本与配对依赖约束。
- [x] 子测试runner不继承父runner内部NODE_TEST_CONTEXT，确保确实执行三项原生配对测试。
- [x] 33项配对/字节/事件脚本和相关ESLint通过。
- [ ] 原CI/main owner接收补充SHA并正常合入，原任务继续跟踪远端main。

## Completed

从实际main848e启动门通过后，FF至已交付320aa317；当前分支仅追加两个test文件和本记录/证据。原320aa远端ref保持冻结。没有产品行为、版本、资源、配置/数据变更；无新Agent/共享CI/发布动作。

## Verification

Node24，33/33 PASS；真实Git checkout-index以core.autocrlf=true输出，三套vendor精确字节保持不变，Cargo.lock确认CRLF后独立执行native fixture元数据断言。首轮红1项、单行lock normalization后绿；详见dev-docs/upstream-eol-20261025/acceptance.md。

## Blockers and unknowns

仅本地及模拟Windows行尾；不是Windows原生OS执行。产品源码与320aa相同，沿用主任务本地验收；共享CI/main由01a12bc2-907a-7702-b6dd-788225c5dfe4负责，不修改已冻结制品。

## Next step

推送本补充分支并handoff原owner，给出精确SHA和只含测试的差异；原候选320aa保留，由其选择整合，不自行触发CI或切换发布。
