# MOXBOTS-CLOUD-MIGRATION-101-20261029 — 桌面与更新入口约定

Root `01a12bc2-907a-7702-b6dd-788225c5dfe4` 保持 desktop/macOS-arm64/updater 与 shared CI/main 唯一负责人。云/官网/mobile 和 101 共享入口协调仍由 `01a12b99-7b38-78b1-831f-9c60257d386a` 负责。路径已确认；Root 在独立 codex/desktop-endpoints101-20261029 分支实施桌面地址改动。原45a冻结源、Nginx、TLS、端口及运行应用未改。

## 目标地址

| 用途 | 地址 | 约束 |
|---|---|---|
| 桌面 owned API origin | `https://101.42.11.29` | 保留 `/auth`、`/v1`、`/api/agent-network` 原协议路径；身份/issuer 迁移仍待原数据与信任方案 |
| 官网 `APP_WEBSITE_URL` | `https://101.42.11.29/moxbots/` | 必须保留结尾 `/`；不得设置为 AI4S 使用的站点根 |
| 官网下载 | `https://101.42.11.29/moxbots/download/` | 现有 settingsSections 的 `download/` 拼接及 HostOnboarding 去尾 `/` 拼接均适用 |
| MoXBots 后台 | `https://101.42.11.29/moxbots/admin` | 云/官网 owner 的受限挂载路径；Root 不写共享 `/admin` |
| 正式更新清单 | `https://101.42.11.29/updates/stable/{{target}}.json` | macOS ARM64 实际 target 为 `darwin-aarch64` |
| 不可变制品下载 | `https://101.42.11.29/updates/releases/<version>/<sha256>-MoXBots.app.tar.gz` | 使用原已验签字节，不重新签名或覆盖旧版本 |

更新入口确认使用 `/updates/`，不使用 `/moxbots/updates/`，不占用既有 AI4S `/`、`/admin`、`/download`、`/api/v1` 或 `/assets`。服务端文件根建议沿用 `/srv/moxbots/updates`，由共享入口 owner 核实实际文件系统与锁归属后决定；此文不是目录创建或 Nginx 修改回执。

更新服务须保留既有约束：清单正常 TLS、稳定通道 no-store；公开仅允许已审不可变归档路径，manifest/receipt/private build 元数据返回 404；未发布平台返回 204；归档完整 GET、精确 SHA 与生产签名及两个 Range 路径通过后再晋级。旧 manifest/tag/receipt 保留原字节；新迁移清单可以引用 101，同一版本不改原制品内容。

## 独立源码批次（已实现，待组合审阅与新候选）

- `src/shared/appProfile.ts`：MoxBot 官网地址改为上述 `/moxbots/`；上游 profile 地址保持原规则。
- `src-tauri/tauri.moxbot.conf.json`：更新 endpoint 改为 101 `/updates/stable/{{target}}.json`，生产 `pubkey` 保持原值。
- `src-tauri/src/agent_network/registry.rs`：owned-service 默认 origin 指向101；主人允许全新测试实例，新账号/设备绑定走正常登录信任流程，不迁移或重写旧 issuer 凭据。
- `scripts/moxbot-updates/release.mjs`、README、Nginx 示例：未来迁移版本的发布 origin/说明需要同步，历史发布脚本与收据保持原件，禁止运行旧硬编码 140 脚本。
- `settingsSections.ts`、`HostOnboarding.tsx`、`AgentNetwork.tsx`、`BrandSection.tsx`、`SettingsPage.tsx`、`GlobalSidebar.tsx` 是 `APP_WEBSITE_URL` 消费者；核验最终链接，不复制 AI4S 的页面路由。

冻结 `0.5.25/525.1 source45a9e22e896b4c6238132463405b0f212bc2bb52` 不变。endpoint 变更需在独立源码批次审阅并固定新候选 SHA/构建号，原 208 CI 不能冒称覆盖新地址源码。当前 208/209 CI/main 交付可继续，向旧 140 写发布与旧地址候选打包保持暂停。

## 兼容和数据缺口

已安装 0.5.24 的 updater 内置旧 IP；101 上传不会使旧 IP 请求重定向。须由协调 owner 选择可行的旧地址兼容桥接，或新签名安装包的正常 TLS 手动升级路径。不得通过改 hosts、关闭 TLS 或放宽公钥/issuer 校验掩盖断链。

`OwnedInstance.validate` 要求 issuer 与 origin 一致，`ensure_same_trust` 比较除 name 外全部字段；原 service/network IDs、根证书、JWKS、login issuer 以及按 issuer 隔离的设备凭据不能凭空重建。更新 minisign 私钥存在不代表云端账号/设备身份私钥或数据库可恢复。

101 容量、现有有效 IP-SAN 证书及 AI4S 占用为云 owner 的盘点报告，Root 未在本轮独立复核。主人最新明确“原来也都是测试的，再重新生成一套”，已核实原消息：允许新云建立新测试数据库/签名与账号/Bot绑定；不再以原数据恢复为门。旧140数据不删除，已有本地设备密钥和旧凭据不重置，不冒称原账号已迁移。TLS 证书续期与共享入口锁由 101 现有 owner 协调，本聊天未操作。

## 后续门禁

- [x] 本地 0.5.24 原归档/manifest/receipt 与公钥重新验签；盘点文件 `desktop-updater-inventory.json`。
- [x] 确认 `/updates/` 根及 `/moxbots/` 官网/下载契约。
- [ ] 云 owner 建立新测试实例并确认新 issuer/trust、101 TLS/共享入口/锁就绪；旧数据恢复已由主人明确豁免。
- [x] 独立分支实施桌面官网/下载/更新/owned默认origin；4产品profile检查与3项发布器/验签/归档测试PASS。
- [ ] 与云源审阅组合并固定新候选及精确CI；模拟结果不替代新云真实登录/更新。
- [ ] 复用同一已验签不可变制品，按 owned lock/stage/完整 GET/原字节审阅/promote/postcheck/finish 迁移并记录回滚。
- [ ] 新客户端实际登录/身份、更新及本地安装按受影响路径验证；不替原业务重放。

验证命令：`node node_modules/vitest/vitest.mjs run --project unit src/shared/appProfile.unit.test.ts`（4 PASS）；`node --test scripts/moxbot-updates/release.test.mjs`（3 PASS，临时夹具密钥，未读生产私钥）；`node scripts/check-test-classification.mjs` PASS。全量 TypeScript --noEmit 与独立 scoped ESLint --max-warnings=0 均exit0；未跑共享CI、未构建/公证/安装/上线此源码。

迁移准备的独立校验：新 publisher 严格拒绝 old140 URL。恢复原归档到新 origin 时，用原归档/签名/原公钥在新的101准备目录生成新origin清单并保留原origin原清单备份，不能把旧140 URL清单直接当新通道清单。原签名覆盖归档字节，不因下载origin改变重签归档。新包构建须核实 MOXBOTS_OWNED_SERVICE_URL 编译环境未残留old140或QA override，实际新运行实例及新登录保持单独验收。
