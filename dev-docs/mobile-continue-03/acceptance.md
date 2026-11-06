# MB-MOBILE-CONTINUE-03 验收与交付

## 范围与行为

按 V10 继续任务主线实现原会话内固定「对话 / 待处理 / 成果」入口。去除标题栏和会话信息里重复的成果入口。请求不再压在长聊天末尾；独立区只显示当前 generation/turn 请求，原审批刷新校验与未知操作保护保持。

对话与请求区保留挂载；原草稿、未提交回答与手动阅读位置在切换中保留。请求区以账号、设备身份、Bot、Session 隔离，卡片再以 generation/turn/request 隔离；切换其他会话不继承旧回答。成果仍沿已有 Router、身份复核及独立成果库读取。点继续修改成功带回引用后显式回对话并聚焦输入，普通成果返回保留原页；不自动发送。

## 本地验收

- Node24，mobile/app `npm run test:policy` 125/125（新增当前代际请求投影回归）；`npm run typecheck`、`npm run lint` 通过，git diff --check 通过。
- 主审在实际本分支 Expo SDK58 组件（localhost18826，EXPO_PUBLIC_MOBILE_QA=1）运行，纯合成账号/数据，无真实网络业务写入。
- 390×844 和320×740：固定入口可见，待处理直接审批/填答；草稿与回答分别保留；普通成果往返保留回答；提交后清除当前请求并可回对话。
- 长20条记录：主动上翻后对话→待处理→对话，scrollTop2035→2035，未跳回底部。
- 请求页→成果→继续修改：补修 C03-R1 后自动显示对话，输入框聚焦，原草稿与真实已列出的成果ID/SHA引用均保留；回待处理时未提交回答仍在。
- 过期审批：preflight检测代际更新，显示“尚未提交”；未越过原 handler。
- 未知消息回执：原文保留，只显示查询接收状态，发送按钮disabled。
- 显式发送新合成消息并等到聊天显示后，再读取旧成果，ID aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1 / SHA256 64个a仍可见。
- 截图与主审记录见 evidence/。`hot-refresh-invalid-draft-320.jpg`为开发热刷新重建effect owner后的无效验收现场，只留本机不纳入Git；完整冷启动重复流程通过，未按该环境现象修改生产draft owner。

## 审阅与限制

独立源码与截图视觉审阅见 INDEPENDENT-REVIEW.md；独立审阅者的 IAB 不可用，未使用用户Chrome/Brave，因此没有独立点击验收。上述实际交互由实现主审执行，不能冒充独立交互或原生验收。iOS键盘、Android返回键/原生display:none、VoiceOver及真实账号/Host/跨设备持久化待原mobile owner验证。

本轮未实现项目聚合、成果版本谱系或主Agent验收协议，不以内容hash推断版本顺序，不以执行结束代替任务验收。无依赖/原生协议/服务端变更。

## 交付

分支 codex/mobile-continue-03-20261106，基线main05ea1e2c4d06f112585012a27503adc75c184dcc。sharedCI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile版本/构建/签名/安装唯一owner01a12b99-7b38-78b1-831f-9c60257d386a。交下一未冻结mobile候选，冻结build10/tag/IPA及build9回退不变；无需desktop/cloud/website发布或数据迁移。提交、CI/main、新包及真机验收逐项等待回执，不用本地通过替代。

依据已查阅Expo58版本文档 https://docs.expo.dev/versions/v58.0.0/ 和React Native0.88 Pressable文档 https://reactnative.dev/docs/pressable ，沿现有React Native组件API，无依赖升级。
