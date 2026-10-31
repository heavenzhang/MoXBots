# MB-MOBILE-CONNECT-20261101

## Scope and findings

User reported invisible mobile login identity and an empty Bot list. Current main baseline e11ee39b5629d6e74810b75e2155a45400d45005. Native mobile account_view always returned displayName=null; home exposed only an account icon. Desktop actual UI initially reported local device online, 0/9 Agents enabled. User explicitly authorized all existing authorized Bots; primary switched all nine through the original UI and verified 9/9. User refreshed phone and still reported empty: connectivity acceptance remains FAILED/open, not solved by enabling alone.

Read-only cloud metadata subsequently confirmed the same desktop Ready, matching catalog/connection epochs, 9 active+enabled entries and 6 archived+disabled entries. A mobile device for the same principal is Ready. This does not identify the user's currently viewed installation or prove its UI receives/displays the directory. Desktop logs included HTTP409 on other device directories; no evidence justifies treating all 409s as the root cause. No credentials copied, no service/DB mutation, no business message sent.

## Implemented

- Home shows current account name or full principal identifier, with an account-settings action.
- Account card uses the same identity fallback; a named account also shows its principal identifier for cross-device comparison.
- Only successful native password login persists the used login name. Supplemental secure profile is bound to device+principal within the original issuer scope. Missing/invalid/unavailable profile degrades to identifier; authentication does not depend on optional profile storage.
- Existing SavedAccount wire is unchanged, so old binaries still read the credential record. Browser logins/old records without names stay explicitly identifiable by principal; no invented profile name.
- Empty directory instructions name the actual desktop switch and distinguish sign-in from Bot enablement.

## Verification

- Mobile policy tests: 85 passed; typecheck and Expo lint exit0.
- Rust mobile connection full library tests: 135 passed, 0 failed, 1 existing opt-in ignored. Primary ran CARGO_TARGET_DIR=/tmp/moxbots-mobile-connect-target-20261101 cargo test --manifest-path mobile/connection/Cargo.toml --lib.
- Root reviewed subagent diff and corrected initial account-record extension because old strict deserialization would break rollback. Final schema retained; auxiliary profile binding/failure tests passed.
- Actual Expo Web product pages with clearly marked synthetic fixture: localhost:8094; 390x844 and 320x740. Home name, old-account full identifier with natural wrap, account-settings navigation, account card, empty state and confirmed sign-out to login all exercised. No horizontal overflow at 320px. These are UI/fixture results, not phone integration.
- Runtime file rustfmt and git diff --check passed. Full cargo fmt check exposes unrelated pre-existing shared identity.rs formatting; not changed.

## Delivery and remaining gates

Mobile unit requires a new immutable native+JS artifact by existing mobile owner 01a12b99-7b38-78b1-831f-9c60257d386a. Shared CI/main remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. No mobile version allocation, shared CI, PR, signing, install or deployment performed here. Existing desktop runtime permission settings changed only as explicitly authorized; desktop source not modified.

Open: actual phone account prefix/error/current artifact, empty-list cause and repair, source integration, mobile release, actual phone UI and connection. No completion claim for either installed identity UI or mobile connection.

## Collaboration

Primary: UI implementation, actual desktop operation, cloud read-only evidence, integration/review/testing. connection_diagnosis: requested gpt-6-luna/medium; native identity implementation, one repair for rollback compatibility. catalog_diagnosis: requested gpt-6-luna/medium, read-only readiness/publish trace. Actual backend model usage/cost unknown. Parallel native work helped while primary inspected the live issue; initial wider file search was inefficient. Future diagnosis should inspect installed UI and exact deployment state before exploring repository history.
