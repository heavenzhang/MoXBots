# MoxBots 0.5.9

0.5.9 is built from the accepted changes merged to `main` after the 0.5.8 source freeze. It includes:

- Project board status grouping and conversion of idle Sessions into Tasks.
- Resizable sidebar and detail panels.
- Production Session-route handling for next-step suggestions.
- Context-recovery improvements: effective context budgeting, recoverable compaction failures, durable action receipts and protection against replaying completed business actions after interruption or restart.
- Continuous watch remains opt-in for local delivery. Requests that ask the current network return protocol to carry continuous events are rejected with `CONTINUOUS_NETWORK_WATCH_UNAVAILABLE`; the protocol currently supports the existing single-turn network settlement path.

This release note describes code included in the signed package. It does not claim that every product path has been exercised against a real external Host, Provider or the daily installed client. The daily client is not installed, quit or restarted as part of publication. After stable publication, compatible clients can check and download in the background; applying the update remains subject to the client's normal idle and user-confirmed restart gates.

## Release provenance

- Canonical repository: `https://github.com/heavenzhang/MoXBots.git`
- Frozen source: tag `v0.5.9` at commit `9f93b3304ee6f06434d8d09754d3e59d4d676d0d`, contained in remote `main` at `54456225412e892a6ad15704cdf6dc4acffce8e1`.
- Published macOS arm64 updater archive: [MoXBots 0.5.9](https://140.143.183.232/updates/releases/0.5.9/9a23e0b1cd59135b079bcf58082cde85cce814f948f5d9e2e9d8c76ed7d2189c-MoXBots.app.tar.gz), 343,650,367 bytes, SHA-256 `9a23e0b1cd59135b079bcf58082cde85cce814f948f5d9e2e9d8c76ed7d2189c`. The Developer ID-signed app passed strict signature verification, Apple notarization and Gatekeeper assessment; the updater signature and archive identity were verified before publication.
- Current stable feed: [darwin-aarch64.json](https://140.143.183.232/updates/stable/darwin-aarch64.json), SHA-256 `38c2443567b6ab4167797066ae56b6c751aed3e7bba9afe9cf3139909950c014`. The 2026-10-18 read-only recheck passed normal TLS, HTTP 200 with `no-store`, and a 1 KiB range request. The complete archive GET, size/hash and signature had passed in the original publication acceptance; that full download was not repeated during the read-only recheck.
- Rollback target: the previously published 0.5.8 archive and stable manifest remain retained by the updater publication process.
