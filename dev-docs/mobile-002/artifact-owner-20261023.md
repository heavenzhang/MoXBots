# Mobile artifact owner repair — 2026-10-23

Task MOXBOTS-MOBILE-ARTIFACT-OWNER-20261023. Base54f09b8d17e87702a08fcd4ccb40b0289c6a97b7. Dedicated simulator real App chat, continuation, persisted history and87B system-picker upload succeeded; viewing artifacts failed MOBILE_ARTIFACT_RESPONSE_INVALID. This is a blocker, not an accepted empty list.

## Source diagnosis and compatibility

Original headless connector emits InternalOperation::OwnerList/OwnerRead (`asset.owner.list/read`), with first-page Rust `before:None` serialized as explicit null. Node schema rejected that null; Node main lacked dispatch for both owner operation names. Legacy `assets.request` branches already implemented the correct Session owner path. The fix accepts the exact nullable cursor encoding and normalizes both spellings into that existing path. It preserves ensureOwnerWorker ownership/workspace/runtime/generation checks and the original worker path/hash/size defenses. No client response validator, cloud protocol, network binary or mobile API is relaxed/changed.

The immutable existing IPA4 and headless network remain usable candidates for compatibility recheck because only Node source changed; this statement is a source compatibility observation, not formal IPA or actual deployment acceptance.

## Local evidence

Private evidence root: project pointer `output/mobile-testflight-20261022/reviewer-demo-host/`.

- `artifact-owner-red.log`: first-page null rejected on old parser.
- `artifact-owner-main-wiring-red-r3.log`: actual built old main rejects owner-list as INVALID_REQUEST and owner-read as REMOTE_MOBILE_OWNER_REQUIRED, whereas legacy request reaches the original missing-Agent guard.
- `artifact-owner-regression-final.log`: seven files40PASS; original full Host main dispatch, Unix peer/request framing and exact read bytes, parser bounds/unknown fields, existing artifact root/session/Agent negatives, Session operation regression.
- `artifact-owner-typecheck.log`: TypeScript exit0. Changed-file eslint and test classification exit0.

## Remaining gates

Actual mTLS wire failure, scoped independent source review, exact-head CI/main, new immutable Node artifact and separately reviewed known-Session-preserving rollout, then real App list/download/preview/image. No production or external Apple review submitted by this source change. Existing supplier/current Node source54, original101 identity/config and daily Mac are untouched. Do not use the former zero-Session update helper now that the controlled Session and upload exist.
