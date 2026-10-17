# 合成登录UI验收

在仓库根目录执行 `node_modules/.bin/vite dev-docs/login-callback-qa --config vite.config.ts --host 127.0.0.1 --port 5197`，内置浏览器访问本机5197。所有onOwned回调均为内存fixture，不打开授权站点、不读凭据、不发生产请求。

index支持scenario=pending、serial-success、open-failure、expiry、cancel-late；viewport.html使用iframe的width/height和可选CSS zoom参数检查小窗口。CSS zoom2并不是OS原生缩放。

证据与限制见 ../login-callback-delivery.md 和 ../login-callback-review.md。
