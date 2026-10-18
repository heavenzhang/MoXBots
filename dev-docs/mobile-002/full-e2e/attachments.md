# Actual encrypted attachment continuation

Task MOXBOTS-MOBILE-002 / mobile-full-e2e-002. Test-only owned increment after normal dependency merge of accepted root `959d632e`; no production, dependency/lock, frozen protocol or exposure-default changes.

## Reproduce

```sh
node scripts/verify-mobile-full-host-e2e.mjs --assets
```

Node24 and the original installed SDK/native executable are required. Optional approved cache variables and the three original locked test-binary build order are unchanged from [acceptance](acceptance.md). Default invocation still selects text; assets is explicit. The same 130s inner / 150s outer deadline remains.

## Observed result

`/tmp/moxbots-full-e2e-assets-blocking.log`: actual ignored test passed once, 13.36s, exit 0. After the original default-disabled mount and explicit synthetic-user revision-checked grant, original Rust MobileConnection started the original Host Session and obtained its receipt/terminal. It then used original assets capabilities/begin/chunk/status/finish through retained WSS, signed binding and inner TLS:

| Input | Bytes | Chunks (maximum 24,576 bytes) | SHA-256 |
| --- | ---: | ---: | --- |
| fixture.txt | 40 | 1 | a4655a06160a240466fdd4c63bdf211481b08224db7ced1cc08f97ecf8fd6906 |
| valid PNG 128×128 | 49,363 | 3 | 78504374129072e505499bdd9881ef50eb538906afdcd3c156fcd032168d533d |

The same original Session accepted `mobile.send` using only the real resulting asset IDs. Original worker/native SDK called the controlled local supplier a second time; its actual request contained the file reference and image/png block with the exact PNG size/hash. Original materialized files matched both original inputs byte-for-byte. Original terminal completed. Native journal rejected repeated intent with MOBILE_RECEIPT_REQUIRED; explicit read-only receipt equaled the accepted receipt. Final original persisted Session count 1, supplier calls 2. Node creates only source input fixtures and observes original output; it never stages/uploads assets or injects a Session/receipt/terminal.

## Retained failures and adapter boundary

The first assets attempt exposed the test SecureStore adapter's unimplemented remove_record, not a product failure. The adapter now stores a tagged present arbitrary-byte record or authenticated CAS tombstone through original EncryptedIdentityStore. Empty bytes remain present; IdentityStore key methods remain original. Exact actual test `runtime::full_host_e2e_test::fixture_encrypted_store_preserves_binary_empty_delete_and_rewrite` passed (1 test, 0.10s); it verifies missing, binary write/read, empty overwrite, remove/readNone, rewrite, scope isolation. This is logical record deletion, not physical key deletion or OS logout acceptance.

Two debug test-main attachment attempts overflowed their default stack (`/tmp/moxbots-full-e2e-assets-second.log`, `...-boxed.log`). Boxing the phase alone did not solve the large combined test poll frame. A Tokio spawned async task was correctly rejected at compile time because original request futures are not Send; no unsafe Send/Sync was added. The fixture now moves the same original Send owner and retained sockets to existing `spawn_blocking`, then uses the same runtime Handle.block_on on a boxed attachment helper. There is no new runtime, OS-stack setting, timeout increase, second Session executor or protocol change. RUST_MIN_STACK was unset. Actual macOS test main and successful default blocking worker both measured 2,109,440-byte stacks. Constructed original request future 26,576 bytes; inner 26,408; attachment phase 80,216. Main poll approximate remaining stack 1,033,751 bytes, worker before send 1,418,807. These measurements support debug combined-poll stack accumulation; they do not establish Native C ABI or phone small-stack safety.

The runner now performs exact recorded descendant cleanup after nonzero/signal exits as well as deadlines, first requesting original Node shutdown. Actual PID/PGID/birth records are verified before signals; no broad process cleanup occurs. Independent post-exit birth/listener checks found no remaining owned processes or listeners: assets green 8 PID / ports65279,65278; boxed abort 9 PID / ports62793,62792; prior abort 8 PID / ports61434,61433. Private roots/logs remain owner-only for diagnosis.

## Current unresolved regression

One subsequent default-text invocation failed, without retry, after the original start receipt was accepted: MOBILE_CHANNEL_CLOSED during later read-only session/receipt work, around the 30s window (`/tmp/moxbots-full-e2e-assets-default-regression.log`). No existing log exposed a more precise source code. An IPC publisher/request mutex scheduling interaction is an unconfirmed hypothesis; root owns diagnosis and any production repair. Its 9 recorded PID births were independently absent and ports50299,50298 had no listeners afterward. Therefore this increment does not claim the default regression or overall reliability gate passed.

Dedicated full fixture tsc/noEmit, targeted ESLint, mobile locked tests strict clippy, own-file rustfmt and diff-check passed. Crate-wide fmt remains red only at pre-existing shared src-tauri/src/agent_network/identity.rs formatting, which this package does not edit.

## Open acceptance

Root independent review/integration and the default-text regression are pending. A later optional C ABI controlled 512KiB call-thread probe is planned separately, not part of this package. Real Keychain/Keystore, actual phone uploader/picker/preview, iOS/Android native stack, physical deletion/logout, fresh authorization recovery, push/background notifications, speech and production service-user separation remain open. Synthetic SSO issuance, encrypted test store and controlled loopback supplier do not stand in for those gates. Requested model/runtime billing is not measured by this package.

## Primary integration and scheduling repair

Primary integrated owned035bc1e as ed44ca1b and independently passed assets13.43s before the scheduling repair: one persisted original Session, two supplier calls, exact materialized file/image and supplier PNG hashes, eight recorded PID births absent and service port52790 closed. This does not negate the retained default-text red above.

Source review established a deterministic starvation window: the outer socket select stopped polling notification_source while its selected socket branch awaited the same ManagementIpc mutex. A source read holding that mutex could therefore stop making progress, including its own2s timeout, until the ordinary request's30s lock wait expired. The reported red's exact lock stage was not logged; Host/worker/SDK remained alive until failure cleanup, so that incident is consistent with the defect but not complete causal proof.

The original connection now polls the complete socket/tick future alongside the original notification source. Both futures remain scoped to the same connection/epoch and are dropped together; no detached task, transport, authority, deadline or protocol change. Two single-thread deterministic regressions force source-lock ownership followed by a waiting request and verify progress, then verify connection completion releases a source-held lock. Both passed. Independent worker source review accepted the repair and fixture boundaries.

Primary post-repair default text11.07s and explicit assets13.12s passed. Original headless suite193 passed/2 explicit fixtures ignored, and the existing Clippy disallowed-method/macro redlines passed with two unchanged argument-count warnings. An initial locally typed Clippy command used unrelated unwrap/expect/panic lints across pre-existing tests and failed; it was corrected to the repository's actual gate, without code suppression. Bounded results and exact post-exit PID/port checks are in attachment-primary-evidence.json. CI now exercises both modes in the existing Linux full-chain step. Exact959 Linux full-chain job117536225034 already passed default text10.60s; current-source CI remains pending.

The original debug combined test future overflow is limited by the fixture phase separation described above; Native C ABI small-stack safety is still a separate open gate. Moving the same owner to spawn_blocking does not make its JoinHandle forcibly cancellable: the external150s runner and exact process cleanup remain necessary on nonzero/signal/timeout exits. Physical Keychain deletion, phone pickers/preview, APNs/FCM and speech are not accepted by these tests.
