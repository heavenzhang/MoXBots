<!-- git-project-sync-task:source-digest=d5b2219a24abf078d240dbb64e079d9ac0ee736f734b07a51cbd30779e90d209 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=fad661ad-f4bc-41a3-ae69-52437adf1c4a -->
<!-- git-project-sync-task:branch=codex/mobile-auth-20261105 -->
<!-- git-project-sync-task:base=065f2b6c8fb2aff58e774000909990b531ff8eb8 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-MOBILE-AUTH-20261105 手机长期登录与安全续期

## Objective

手机端持久登录、安全续期与一次登录操作；沿现有原生账号/Keychain与AuthStore，不保存密码，不重放业务。原生密码登录采用30天滑动窗口，Web/Host保持既有策略。

## Acceptance criteria

- 凭据轮换先安全存储候选并读回，响应丢失、崩溃和旧凭据过期后可恢复已提交候选；撤销/过期不复活。
- 原生会话窗口与旧Web/Host隔离；退出撤销候选及旧令牌。
- 登录授权合并到明确的同意并登录操作，无额外勾选或人工中间确认。
- 代码、定向/集成回归、实际页面、main、各单元发布及真机验收分别记录。

## Completed

- AUTH-01~04源码已实施：原生安全轮换/冷恢复/撤销、内部30天策略、一次明确登录操作。独立安全评审提出的4项P1/P2已修；本地原生栈溢出修正为在serialized request边界heap box大型future。完整进度见dev-docs/mobile-auth-20261105/PLAN.md。

## Verification

- Source digest: `d5b2219a24abf078d240dbb64e079d9ac0ee736f734b07a51cbd30779e90d209`; native155 PASS; policy117 PASS; service217 PASS and primary native25 PASS; headless226 PASS; auth fullchain1 PASS 69.20s; original text fullchain1 PASS 12.32s; typecheck/lint/strict clippy PASS; actual browser UI and physical/production gates pending

- Source digest: `ced0423f7346b9e152b66f393c97c756b1beab27d1fc9a0ec6dbd77f12570ada`; mobile native 155 passed/1 existing ignored; policy117 pass; service217 passed/8 ignored; headless226 passed/2 ignored; typecheck/lint and service Clippy pass; full signed candidate recovery/expiry/logout fixture final run pending; browser/native production acceptance not performed

- mobile原生155通过/1既有ignored；mobile policy117通过；服务217通过/8既有ignored；Headless226通过/2既有ignored。typecheck与全mobile lint通过；service strict Clippy通过；完整本地证明链mobile-renewal 1 PASS/69.20s，text 1 PASS/12.32s；实际页面/main/生产仍未验。最终Clippy见acceptance.md。
- 独立静态安全评审最终未发现P1/P2；不是UI或生产验收。

## Blockers and unknowns

- Kevin iPhone当前不可用。内置浏览器被Work设置禁用，Chrome独立会话授权已问、未获回复，实际登录页面/320/390交互未验。真实Dex隔离集成需可用Docker daemon，当前本地daemon不存在。上述门禁保持开放。共享CI/main与cloud/mobile沿原负责人，不争抢候选。

## Deployment request

- Required: cloud AuthStore/native-password service 与 mobile iOS/Android，需要先兼容服务端、后手机包。
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence and dependencies: dev-docs/mobile-auth-20261105/{PLAN,acceptance}.md；旧account JSON格式保留，新续期记录独立；服务新增可空TTL列，旧包/服务能读取原字段，已签包不覆盖。
- Status: source committed/pushed; final evidence update pending exact-head verification and owner handoff. main/cloud/mobile/native gates remain open.
- Owners: sharedCI/main 01a12bc2-907a-7702-b6dd-788225c5dfe4；cloud/mobile 01a12b99-7b38-78b1-831f-9c60257d386a；本会话开发集成与验收，不接管部署。

## Next step

- 原sharedCI/main owner核对最终远端SHA并接收，按既有流程完成CI/main；页面及真机条件满足后由原cloud/mobile owner先服务后手机验收发布。
