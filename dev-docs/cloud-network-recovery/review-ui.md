# CLOUD-NETWORK-RECOVERY-20261018 — 独立 UI 验收

结论：最终 UI 验收通过。此前发现的 P2 详情状态文案冲突已修复并复验关闭。

在 Vite 隔离夹具中渲染实际 `AgentNetwork` / `DeviceCard` / `DeviceDetails` / `NetworkSelector` / Host 管理组件。夹具读取合成 network/device/catalog 元数据后切换快照；不访问真实网络、账号、凭据或模型，非元数据 Tauri 命令均拒绝。服务只绑定 `127.0.0.1:5198`。

- `1280×900`：登录失效说明和可用的“重新登录”入口清楚；连接超时说明正在自动重试且设备状态暂不可确认；未知 transport failure 显示普通自动重连信息。选择器紧凑状态分别显示“需要登录”“连接超时”和“连接不可用”。
- 断网期间缓存中的 online/offline/syncing 设备在卡片与详情都显示“设备状态未知（网络未连接）”，设备状态点为中性灰。Host 管理仍禁用刷新，不发起 inspect 或写入。
- **P2 修复复验通过**：断网详情不再误称“设备离线”，改为未知状态；网络恢复 ready 后，缓存的 offline 设备重新显示实际“离线”，Host 管理的离线说明保留。
- `760×760` 与 `390×844` 均无横向溢出（`scrollWidth === clientWidth`）。390 宽度下 banner 正常换行，卡片状态说明在卡片内省略；网络选择器菜单宽 242px，未超出视口。
- 控制台无页面异常。未点击会触发 Tauri 或外部授权的登录动作，也未执行远程管理操作。

## 最终证据

- [断线设备卡片，1280×900](qa/timeout-current-1280.png)
- [断线设备详情和禁用的 Host 刷新，1280×900](qa/timeout-details-final-1280x900.png)
- [恢复连接后设备确认为离线，1280×900](qa/ready-details-final-1280x900.png)
- [登录失效及重新登录入口，1280×900](qa/login-1280x900.png)
- [断线卡片，760×760](qa/timeout-760x760.png)
- [断线卡片，390×844](qa/timeout-390x844.png)

完整临时 harness、捕获脚本及未纳入报告的截图移至 `/private/tmp/moxbots-cloud-network-diagnostic-20261018/ui-qa/`。以上仅为 renderer 合成 Tauri 页面验收，不证明真实 Rust registry、登录流程、网络恢复、生产版本或原生窗口行为。QA 未改动产品源码或提交。
