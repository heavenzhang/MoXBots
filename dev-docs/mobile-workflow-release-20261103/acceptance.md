# 手机第一批源码验收

基线186f88dc，沿跨端任务MB-CROSS-END-WORKFLOW-01。抽取旧95390685中mobile/app三文件并补齐status.detail实际显示。本批只改目录/操作文案，没有新执行、请求、协议、Store或版本分配。打开仍调用原onOpen。

117项policy全部通过；TypeScript/scopedESLint均退出0；diff whitespace通过。真实Expo/React Native Web产品页使用开发QA夹具，合成消息得到本轮结束后返回目录，确认可见“本轮结束不代表任务已验收；可查看成果或继续修改”。320×740和390×844 DOM宽度与scrollWidth分别相等，文本自然换行，console error为空。截图仅合成数据，不冒充真机/真实账号验收。SDK58按已安装package核对官方版本文档https://docs.expo.dev/versions/v58.0.0/，未升级依赖或新增API。

当前单Agent实现与组件走查。原sharedCI/main owner独审/CI/main、mobile owner签名新包/安装读回和物理UI待进行；不能把源码测试视为正式发布。完整V10的项目入口、跨项目Bot关系、业务审批和成果验收全链路不包含在此三文件增量。既有build8会话/成果/审批能力继续保留。

发布负责人：01a12bc2-907a-7702-b6dd-788225c5dfe4统一CI/main；01a12b99-7b38-78b1-831f-9c60257d386a分配build9并构建/签名/安装。当前Kevin iPhone16ProMax连接，沿其最近明确安装目标。无Xu替换、Mac安装或101配置修改。本地证据见evidence/checks.json与home-320.png/home-390.png；原日志按既有ignore仅本地。
