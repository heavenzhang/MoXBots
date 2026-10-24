# MOXBOTS-BROWSER-GEOMETRY-20261024

The reported native browser appears over the workspace tree rather than filling
the right browser pane. Source inspection found that BrowserPanel passed
`getBoundingClientRect()` CSS pixels directly to Tauri child-WebView APIs, which
take OS logical pixels. Main-WebView native page zoom changes the relationship;
the child WebView does not inherit that zoom. This defect explains this class of
offset/size mismatch. The screenshot's exact zoom preference was not read or
changed, so its particular zoom value is not asserted.

The fix uses the existing appZoom controller's successfully applied scale for
both creation and subsequent resize. Failed/pending zoom never becomes geometry
authority. The existing frame loop observes zoom/reset without another React
render; CSS-development zoom is not multiplied twice. No display DPI multiplier
is applied: on the tested Retina WKWebView at 150%, devicePixelRatio was 3 while
the required CSS-to-OS-logical multiplier was 1.5.

## Verification

- Before the product edit, two new real-component regressions failed: create
  passed `(600,80,584,780)` rather than `(900,120,876,1170)` at 150%, and changing
  zoom without a React render failed to issue the required resize.
- Node 24.21.0, Vitest: 5 files / 57 tests passed, covering native-scale restore,
  pending/failure/reset, all nine zoom levels, create/live resize, navigation,
  exact-generation lifecycle and existing geometry/transition safety.
- `tsc --noEmit` and ESLint on all six affected TS/TSX files passed.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run build:web` passed, including
  license/theme verification and 8 theme tests. Existing chunk-size/Baseline
  advisories were retained; no dependency changes were made.
- Actual macOS WKWebView, isolated nonpersistent hidden window, no network or
  daily App access: 1440×900 and 980×720 OS-logical view sizes, each at
  75/80/90/100/110/125/150/175/200%. All 18 cases passed using a bundle of the
  actual production conversion helper. Maximum error: 0.0000611 logical px.
  At 150% in the wider window, old raw coordinates were wrong by 288 logical px;
  corrected coordinates matched the independently defined layout exactly.
- Measured results and source/probe SHA256 bindings:
  [native-webkit.json](evidence/native-webkit.json). The probe never orders a
  window front, activates an app, handles user input or accesses a user profile.

Reproduce the native check on macOS from the repository root:

```sh
node_modules/.bin/esbuild src/renderer/components/browserConstants.ts --bundle --format=iife --global-name=BrowserGeometry --outfile=/tmp/moxbots-browser-geometry.js
xcrun swiftc dev-docs/browser-geometry-20261024/verify-webkit.swift -o /tmp/moxbots-browser-geometry -framework AppKit -framework WebKit
/tmp/moxbots-browser-geometry /tmp/moxbots-browser-geometry.js
```

## Delivery and limits

Branch: `codex/browser-zoom-geometry-20261024`, base
`81ec17c013f2160646bcc6c9a5f9e74cbc9e4975`. Primary implemented, reviewed and
accepted local checks; no independent agent review, model switch, external model
call or measured token/cost claim. Scope is a small coordinate conversion fix.

This is actual native WebKit coordinate evidence plus component behavior tests,
not acceptance of a new signed MoXBots build. No real webpage/production-browser
interaction was performed in the daily App. The unique combined-CI/main and
desktop/macOS-arm64/updater owner remains
`01a12bc2-907a-7702-b6dd-788225c5dfe4`. Owner integration, shared CI, immutable
artifact/version/digest allocation, release and original-path acceptance are
pending; the existing frozen 521.2 bytes are untouched. No new PR/shared CI or
cross-chat prompt was created by this development chat. The committed task and
local release queue carry the handoff; pending is not owner acknowledgement.
