# MB-MOBILE-CONNECT-20261101 — original mobile owner release 7

Mobile/cloud owner `01a12b99-7b38-78b1-831f-9c60257d386a` resumes the accepted source handoff `bad2f934ed2a4f292ed22ad8bd50c09703cc4673` from main `e11ee39b5629d6e74810b75e2155a45400d45005`. Shared CI/main remains with `01a12bc2-907a-7702-b6dd-788225c5dfe4`. This batch reserves a fresh iOS `0.1.0 / build 7`; original build 6 remains immutable. No daily Mac client, original101 identity/configuration, business message, new public port or cloud database change belongs to this lane.

## Candidate contents

- Original author's identity UI and secure optional login-name profile. Existing SavedAccount record format, credentials and device identity are unchanged; profile failure cannot prevent authentication. Missing names remain identifiable by the full existing principal.
- Fix About: application name was incorrectly presented as the build identifier. It now reads installed native application version, build version and application name from the already installed expo-application module. Web preview explicitly reports unavailable native build data instead of claiming a packaged build.
- iOS buildNumber advances from 6 to 7. No Android artifact or desktop version is allocated here.

Expo58 installed types and [versioned Application documentation](https://docs.expo.dev/versions/v58.0.0/sdk/application/) were checked. `nativeApplicationVersion`/`nativeBuildVersion` come from the installed native bundle; `Constants.expoConfig.version` alone cannot identify its internal build number. No dependency or native account intent is added.

## Evidence and open diagnosis

- [x] Original owner independently reran mobile policy85, typecheck and Expo lint: all pass.
- [x] Original owner independently reran complete mobile connection library:135 pass,0 failed,1 existing opt-in ignored; isolated Cargo target, offline dependencies, two jobs.
- [x] Exact source inspection: build6's directory code already separates unavailable/stale peers. A409 for another device is insufficient evidence of this phone's failure.
- [x] NormalTLS public instance returns200; unauthenticated device directory returns401 as required. The generic root `/health` is not the routed production endpoint and its404 is not evidence of a failed cloud service.
- [x] Read-only cloud metadata confirms desktop Ready with9 enabled current catalog entries. It does not prove the user's phone receives or renders them. Shared library appVersion0.5.2 in cloud metadata is not the installed mobile CFBundleVersion6.
- [x] Human confirmed Kevin's iPhone16ProMax as the install target. Device tool currently reports it unavailable; the paired Xu phone is not substituted.
- [ ] Exact Root sharedCI/main/remote containment and security review.
- [ ] Freeze source, native+JS build, signing, immutable artifact inspection and verified target installation.
- [ ] Actual phone account/refresh error, Bot list, original-session reads and safe attachment paths. Actual empty-list root cause and connection acceptance remain open.

Desktop Bot permission switches were operated by the prior source owner under explicit human authorization; this chat preserves them. Current mobile presence can change on background/suspend, so historical Ready is not reported as continuously Ready. Do not clear identities, reset accounts, restart the user's Mac, broaden permissions or send business traffic to hide missing evidence.

## Delivery discipline

This source request is a single additive intake after bad2f934; no new PR or shared-CI trigger is executed by the mobile owner. Root chooses exact combined candidate and coordinates existing in-flight work. Once that head is frozen, later package/install/CI receipts stay private to avoid documentation-only pushes cancelling a running exact-head workflow. Candidate/package/local simulation, physical installation, production connection and TestFlight delivery are distinct gates. Private status lives at project output `output/mobile-connect-20261101/`.
