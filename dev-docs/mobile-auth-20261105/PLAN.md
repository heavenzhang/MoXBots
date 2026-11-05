# MB-MOBILE-AUTH-20261105

| ID | 状态 | 范围/完成标准 | 依赖/下一步 |
| --- | --- | --- | --- |
| AUTH-01 | [x] | 核实仓库/main/工作区/原部署owner | main065f2b6c8，独立工作树 |
| AUTH-02 | [x] | 原生候选持久化、6小时续期检查、冷恢复、撤销 | 原生账号/同设备proof；不更改旧account格式 |
| AUTH-03 | [x] | 服务native30天窗口及兼容迁移，旧Web/Host隔离 | 仅内部verified native marker选择 |
| AUTH-04 | [ ] | 同意并登录源码已完成；320/390实际页面待验 | 内置浏览器禁用，Chrome授权未回复；主Agent UI owner |
| AUTH-05 | [ ] | 故障注入、撤销、迁移、类型/lint；独立安全评审 | 先回归后提交 |
| AUTH-06 | [ ] | task协议/远端分支/原owner集成main回执 | 不独立触发共享CI |
| AUTH-07 | [ ] | cloud兼容部署→mobile新包→真实账号/重开复验 | 原owner；Kevin当前不可用 |

执行：主Agent负责mobile/connection、UI、集成、整体接受；mobile_auth_service负责services/agentnet独立文件；mobile_auth_review只读评审。两worker请求gpt-6.1-sol/high，依据是会话轮换和撤销风险。实际费用/Token本机未暴露。无外部模型调用。

部署单元：cloud 与 mobile 独立发布，原owner01a12b99保留；sharedCI/main01a12bc2保留。服务新增可空TTL列且保持旧策略兼容，先cloud后mobile；回退保留原account JSON/旧IPA与旧binary/DB备份，不能覆盖tag或包。
