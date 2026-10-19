# Design QA — 执行轨迹交付

当前实现、验证和未验证边界见 [acceptance.md](acceptance.md)。本快照是合成 Web 原型，不能代表 native 客户端或真实服务联调。

执行轨迹位于会话内左侧，展开呈现四步连续状态。运行步骤有高亮、文字状态、`aria-current="step"` 与装饰性 piano-roll；`prefers-reduced-motion` 保留静态效果。待授权、停止及终态沿用现有会话数据。

历史 V6 布局证据见 [qa-v6/verification.md](qa-v6/verification.md) 和 [comparison.png](qa-v6/comparison.png)，它们只证明此前顶部/输入区精简与消息视口增加。该历史报告引用的 V5 完整证据在原本地交付目录保留，没有复制进本快照。

原型与 Codex 的像素一致性、原生触控、系统读屏、大字体以及真实账号、Host、Provider 路径均未验收。现有 runtime 浏览器回归有一项 BottomSheet 点击失败，不能称为全部通过。
