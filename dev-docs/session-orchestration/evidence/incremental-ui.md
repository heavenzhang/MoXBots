# MB-ORCH-20261022-01 — independent component UI verification

Scope: implementation-preview at http://127.0.0.1:4352/, independent headless Chromium for Testing 1243. Production SessionTaskOrchestrationProvider, ProcessRow association, SessionTaskResults and Composer; simulated Agent execution/chat handling and Inspector shell. No complete Chat/native/Provider acceptance is claimed.

## Result

132 assertions: **132 pass, 0 failures** across 1280/390/320 × light/dark. Zero page errors, business/API/Provider calls, external requests or blocked requests.

Passed in every width/theme:
- Current tool associations; Composer remains inside viewport, no horizontal overflow, original Wrench control retained.
- Rework appends existing draft, preserves image attachment, focuses Composer and does not mutate task phase.
- Before/after switch preserves draft and attachment; queued edit refuses to overwrite an occupied Composer.
- Review request only enters simulated review and remains 1/4. Advancing the simulated main acceptance displays 4/4. Rework scene/new activation preserves accepted work and displays 2/4.
- Original approval is reachable with the native chat wheel, both deny/allow visible and actual center hit-test succeeds. Allowing the tool does not mark the task accepted.
- Simulated Inspector shell opens through current result action and closes on Escape. This does not prove native Inspector focus return or execution history.

The original six fixture automatic approval tail failures are closed by the fixture-only scroll-to-scrollHeight tail correction. The unchanged independent script now reports actual center hit-test **true in all six width/theme combinations**, without its fallback native wheel. Original allow/deny actions are visible above the queue/Composer with a draft and attachment retained. Narrow light/dark screenshots were independently viewed again.

Previous failures remain in `independent-ui-tail-v1.json/log` and `independent-report-tail-v1.md`; the original 320px occlusion/scroll-recovery diagnostic screenshots and JSON remain. The earlier wrapper-height oracle and incorrect supplemental menu-name oracle remain excluded from product acceptance.

## Evidence

- `independent-ui.mjs`, `independent-ui.json`, `independent-ui.log`: unchanged-scope final rerun, 132/132 pass.
- `independent-{1280,390,320}-{light,dark}-{returned,review,accepted,approval,rework}.png`: six-matrix screenshots; approval screenshots now show the automatically aligned reachable state (no fallback wheel needed).
- `independent-approval-diagnostic.json`, `independent-320-approval-diagnostic.png`, `independent-320-approval-after-scroll.png`: initial occlusion and native-scroll recovery.
- `independent-ui-oracle-v1.json/log`: rejected supplemental menu test (wrong narrow-layout accessible-name/menu-content assumptions), retained for traceability; not product failure evidence.

No product source changes, shared CI, builds, App or real Provider operations were performed. Full Chat ingress, signed-human/native proof, A/B/A transport races, real Inspector focus/history and long-session performance require their own integration/native evidence.
