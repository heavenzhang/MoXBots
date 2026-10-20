# iPhone core conversation acceptance — 2026-10-21

Task MOXBOTS-IPHONE-ACCEPTANCE-20261019. Sole mobile owner: `01a12b99-7b38-78b1-831f-9c60257d386a`. Full MOBILE-002 remains open; speech is deferred.

## Installed artifact and source

The original registered physical iPhone 12 Pro Max received an in-place internal upgrade, with no uninstall, account reset or new signing key. Installed bundle `com.moxbots.mobileinternal`, version `0.1.0`, build `2`; existing team/profile/Keychain groups retained. Native and all archived App payload bytes were independently reviewed.

- Artifact source: `abc822cebb403ef438fff63558d529e33f3f95f3` (includes observed main `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`).
- IPA: 19,825,254 bytes; SHA-256 `10c01189b80abc3789fad44ba9732c69c2db68ac63bb6bd0a512292bd42b66a3`; 512 ZIP entries passed CRC.
- Embedded JS SHA-256: `1f36bd9f28b19c8c35b1a255e92d2e0355a1c52511ba48503bf9710358ac4b43` (QA disabled).
- Native input digest: `3f13255ee21d17197cfee59b33e93e06f51a4faf6d983b39ef2ec719976f0048`; device library SHA-256 `a8a3fec8611dd99cbce1f1d9c771fbbce26c9ecfb03eb0f0354f9a4e806186d6`.

This is a tested internal candidate. Main inclusion, final input equality and immutable release-tag creation remain separate gates; do not describe it as a main-delivered release yet. Preserve the signed build 1 rollback. Changed product inputs require a new build identity, not an overwritten build 2.

## Physical results

Actual native login with the existing human account passed once, supported by the authenticated UI and a new unrevoked cloud session. Its three existing peers were offline. Original 101 was ready under the separate controlled QA principal; different legitimate accounts were not merged or switched to bypass authorization.

Under the prior explicit authorization for a same-account isolated temporary Host, tests used synthetic history over the real service and encrypted Host transport:

| Path | Observed result |
| --- | --- |
| Device/Bot discovery and three session rows | PASS; exact temporary Host, no business-session writes |
| Open existing sessions | PASS; matching titles and history; no new conversation sent |
| Older history | PASS; latest30, then earlier30, then earliest30; visible boundaries61/31/1 and latest90 |
| Prepend reading position | PASS; before/after anchors61 and31 retained at the same screen position |
| Return to latest | PASS; explicit action returns to the rich last message |
| Chinese/English text, emphasis, inline/fenced code, quotation, lists | PASS on actual phone |
| Table/code horizontal gestures | PASS; content moves inside its container while surrounding prose stays fixed |
| Remote images | PASS; explicit tap loads a fixed public project PNG; a controlled404 produces failure feedback; original-link navigation returns to the same conversation |
| Tool output | PASS on the current-source temporary Host; collapsed read-only card expands into three readable lines |
| Scoped draft | PASS; unsent `123` stays in its original session, second session is empty, returning restores it |
| Background/foreground | PASS; existing conversation/draft survive Home then foreground launch, without terminating the App |
| Info sheet and return | PASS; full conversation title, Bot and device remain associated |

The first temporary Host used source `7e4bbdfaa693b3f309c7a879b32d1b386b3b52ca` and returned a raw tool-result envelope. This is not evidence that the new phone should heuristically decode arbitrary JSON. A separate temporary JS candidate built with the ordinary Host bundle options from exact `07f31b66234e682e435ea2188df51e7edb83ea87` exercised the existing mainline server unwrapping fix. Actual running `host-main.mjs` SHA-256 was `001fb853be62e254632c228950bfcfcaa86c281b4d9fcdf9af88eaed3c129bf2`; the phone then rendered the readable output. Only the temporary Node unit changed; original101 remained untouched. This temporary JS test candidate is not a distributable Host release.

No model, message send, approval, audio recording, attachment upload or notification delivery was exercised merely to validate presentation. Inline image loading is not attachment/Host-byte or artifact-preview acceptance. The original business target's earlier `TARGET_RECEIPT_INVALID` remains unproved because its peer was unavailable; controlled Host success does not close that separate issue.

## Cleanup and evidence

Confirmed via the original API/CAS and independent read-only database witnesses: temporary mount disabled, membership left, controller and temporary Host sessions revoked, dedicated temporary units stopped. The original human phone session remains active. Synthetic draft cleared. Original101's12 identity/key/config witnesses are unchanged, its original Node/network PIDs remain3502751/14604, and it remains freshly Ready. Device Hub returned to its original position with keyboard capture off. No daily Mac client action occurred.

Private evidence: project pointer `output/iphone-acceptance-20261021-build2/physical-core-acceptance.json`, `cleanup-independent-readonly-witness.json`, original screenshots, native-controller receipts and exact bundle provenance. Independent source chat reviewed the source, package and captured phone results without parallel device/runtime writes. No new subagent or external model was used for this continuation; cost/token totals are not measured here.

## CI and remaining delivery

PR174's exact `07f31b66` Test run39467789817 passed every executed non-Mac job; macOS26 and macOS15 ARM attempts never obtained a runner and were cancelled with zero steps. Cancellation is not PASS. Full parent macOS tests were not run on the personal Mac because some parent tests can reach real home identity paths.

An explicit `workflow_dispatch` Intel15 **Mac-only supplement** retains every original lifecycle command and both real iOS SDK/native checks, while asserting x86_64/Rust host and Xcode26.3/SDK26.2. Regular PR/push/default validation remains ARM and complete; Intel supplement concurrency is separate. This is an explicitly different validation environment, not ARM desktop executable/credential-reader acceptance. Product changes in this PR are mobile TS/config/dependencies only, with no desktop Rust or Swift changes. Final delivery requires the exact new-head ordinary PR gates plus the executed Mac supplement, current-main integration and remote-main verification; no force/admin, empty-run acceptance or check disabling.


## Concurrent main integration — 2026-10-21

While the original exact dac82661 ARM run39478430991 completed all nine required jobs successfully, desktop PR173 advanced main to a487b5d353780fef4b624b42dd01d7d0ad4958d3. Integrate that main normally and retain both task histories. The shared workflow keeps main's arm64/Xcode26 verification (ARM-only for the explicit Intel supplement), the full ordinary ARM gate and all lifecycle command bodies. Old run results are historical; the new combined head requires its own ordinary full CI. The extra Intel run for dac remains separately attributed, not a result for the new SHA.

Artifact sourceabc822ce mobile, native Rust closure, Cargo manifests/locks, vendor input, toolchain and root dependency inputs are byte-identical to the combined candidate; desktop renderer/server source and desktop version changed outside the iPhone build. The signed installed build2 remains an internal candidate pending current-head CI/main/input proof; never re-stamp or rebuild different bytes under build2. No new device, original101 or daily-Mac operation. Full002 original business/attachment/approval/speech/push gates remain open.
