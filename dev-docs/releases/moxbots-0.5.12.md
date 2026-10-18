# MoXBots 0.5.12 — update recovery candidate (not published)

Task: MOXBOTS-0512-UPDATE-RECOVERY-20261018. This is a preparation record; no frozen source, signed artifact or publication is implied.

Planned batch: accepted PR141 stop/admission settlement and PR138 interrupted-download recovery, plus already-main pin/network/background-log changes. All source/main/combined gates must pass before version freeze. User authorized the original source chat to arrange the next unfrozen release through the existing unified desktop publisher. Do not replace0.5.11 with different bytes.

The running0.5.9 installer gate can itself fail; a newfeed does not repair old code. Keep old-version recovery, new candidate native behavior and public distribution acceptance separate. At preparation time, the original source chat owns daily UI for a separately authorized once-only0511 upgrade; this publisher does not interfere.

| Layer | Current result |
| --- | --- |
| Source141/138 | NormalCI/main pending; not frozen |
| Version/main | Local0.5.12 metadata, sync-version3tests passed; normalCI/main pending |
| Formal package, Reader, Apple/notary/updater signature | Not started |
| Real native stop/install, busy/unknown, persistence | Not accepted |
| Public full download/promotion | Not started; existing0511 preserved |

Record final source/tag/artifact hashes, real test actor/environment and failures/rollback here after actual results. Detailed checklist and boundaries: `.agent-sync/tasks/codex-release-0512-20261018-a176f4c0.md`. Runtime/secret evidence remains in the private project pointer.
