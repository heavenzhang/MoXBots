# MoxBots 手机端 · V6 可点击原型

MOXBOTS-MOBILE-001 是独立的本地合成 Web 原型。当前快照将执行轨迹改为会话内左侧窄轨迹：没有常驻功能条，展开后呈现连续步骤、当前步骤高亮、右侧状态文字和 CSS piano-roll 动画；减少动态效果时显示静态条形。

手机框外可切换 iPhone（393×852）和 Pixel 10（427×952）。顶部是紧凑会话导航，底部是一行输入区；模型和建议在“＋”菜单，成果从顶部打开。授权、停止、排队与成果保持原型现有轮次身份语义。

## 本地运行

在本目录使用 Node 24：

```sh
npm ci --ignore-scripts
npm run check:runtime
npm run dev -- --host 127.0.0.1 --port 4387 --strictPort
```

打开 http://127.0.0.1:4387/ ，进入“接口联调”并展开执行步骤可查看运行态。“产品周报”用于待授权流程，“部署日志排查”用于拒绝流程。停止、过期与另一端已处理状态可通过对应会话及个人中心的演示入口查看。

```sh
npm run build
npm run test:sites
npm run test:runtime
```

最后一条命令需要 Playwright Chromium。交付时系统 Chrome 的既有运行时回归为 7/8：BottomSheet 遮罩点击超时仍未解决，详见 [acceptance.md](acceptance.md)。构建有单个 JS chunk 超过 500 kB 的提示。

## 源码与证据

- 应用：`src/Prototype.tsx`、`ExecutionTrace.tsx`、`prototype.css` 及相邻应用模块。
- 移动模拟运行时：`src/mobile/`、`public/assets/`；28 个保护文件由 `mobile-runtime.lock.json` 校验，未修改锁以绕过检查。
- 当前交付与限制：[acceptance.md](acceptance.md)。
- 历史 V6 空间调整：[qa-v6/verification.md](qa-v6/verification.md)、[前后对照](qa-v6/comparison.png)。这些是此前布局证据，不是当前 piano-roll 的截图。
- 更早的完整 V3–V5 证据保留在原交付工作区，未纳入此精简源码快照。

## 范围

数据在页面内存中，刷新恢复示例。附件不上传服务器；PDF 是 HTML 分页示意，保存仅登记示例状态。语音没有访问麦克风或识别服务，模型和授权均为演示。没有真实账号、Provider、Host、业务写入、原生设备或生产验收。

本快照位于产品仓库 `dev-docs/prototypes/moxbots-mobile-001/`，供设计复现；产品原生客户端源码位于 `mobile/app/`，本任务不修改该客户端。构建不会自动部署，未发布公网或替换日常桌面客户端。
