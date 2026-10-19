# MOXBOTS-BACKGROUND-CONTINUATION-20261019

本修复沿原 SessionEngine/builtin lifecycle/Goal owner 处理后台长驻 Shell。所有非 ambient 默认阻挡；不猜测描述、命令或无父任务是否安全。只有用户刚读到的精确 task/run/Query 实例可显式允许并行，缺失/变化/未知身份拒绝；可撤销，Query authority 撤销或替换后失效。不会停止或重启任务，不修改账号/模型配置或持久业务数据。

## 验证状态

- review1 的无父 Shell 一律放行反例保留为默认阻挡回归。
- review2 先补失败回归：旧实现没有可验证的精确确认身份；修复后覆盖 task 同 ID 新 run、Query 替换、进程计数重置、同 Query 重新授权、abort、确认撤销和 level 消失。
- Node v24.20.0：合并main2c2efd06后的8个定向文件295项unit/DOM/模拟SDK集成全部通过，含65项当前输入栏Stop UI回归。
- Node24 typecheck（含precheck）、本任务TypeScript/TSX ESLint通过；MoXBots Web构建通过；合并main2c2efd06后typecheck及Server bundle构建再次通过。`git diff --check`通过。
- 真实组件合成预览：通过Codex IAB（非用户Chrome）实际点击确认、撤销、服务端拒绝，1280×720检查。初次预览 root/CSS扫描配置不正确，已隔离缓存并按组件实际样式复核。DOM另覆盖晚回执、新会话加载时旧能力移除。实际UI由主Agent验证；一个只读reviewer另行审阅源码及UI状态分支，未发现可行动问题，未操作App或执行测试。见review.md，不称独立真实UI验收。
- 合成fixture不连接真实任务，不调用模型或业务API。它不证明签名原生、真实Session/Rust代理授权、真实Provider或薪资生产验收。
- Rust pure precheck回归随源码提交，完整cargo/Clippy由正常CI执行；本地不创建资源占位、不跳过校验。正式候选需唯一桌面publisher正常构建与验收。

全量CI发现并保留3个失败：纯policy放置在SessionEngine目录导致builtin owner反向依赖；adapter mock漏新facade getter。已将纯策略和原样单测移到中性src/server目录，补齐mock为真实lifecycle API，未放宽断言。4文件188项相关回归、Node24 typecheck/scopedlint/Server构建通过；只读复审未发现可行动问题。最终远端精确head全量CI仍须复核。

并发主干同步：PR157移动端catalog修复以9项CI成功、1条件skip合入main6711028c；主Agent审阅其10文件，改动在mobile目录及记录，不与桌面runtime源码重叠。已正常合并且保留双方计划，4文件188项组合回归通过；新组合精确head正常CI/main仍待验收。

组合head580e的CI单元6451通过，但已有PermissionPrompt复制反馈DOM用例偶发未观察到copied。原d3全CI通过；失败日志保留。仅测试修订：详情Promise在act中结算，复制Promise改显式控制，保留完整命令/权限断言，并验证未完成无成功反馈、成功反馈及1999/2000ms边界。26项关联DOM和定向ESLint通过，只读复审无弱化问题；具体CI调度根因未确认，不修改权限或复制产品逻辑。新精确head正常CI仍待完成。

## 接续与发布边界

任务分支记录见 `.agent-sync/tasks/codex-background-continuation-20261019-bc43f0fb.md`。PR #158：https://github.com/heavenzhang/MoXBots/pull/158。公开PR/CI和远端refs是源码交付权威；未合main时不算主干交付。源码和单测不是运行生效，当前日常包与其它冻结候选不修改。本任务不建立第二条签名/发行流程，不重启/覆盖客户端，不停止或取消现有会话。

## 合成预览

`preview.html` / `preview.tsx` / `preview.css`复用真实BackgroundTaskDialog和主题，用合成Tab API，仅用于组件验证。Vite root设本目录、隔离cacheDir，并使用既有根Vite配置。浏览器交互和截图证据保留观察目录，未提交真实运行日志、用户会话或薪资内容。
