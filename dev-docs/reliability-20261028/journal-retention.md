# Settled Query receipt retention

Root release review of `d22973f485e5b9bf17aeffff29db5d3c28e7ced8` reproduced a Session lifetime limit: 2048 returned successes for one action hash survived cold restore and prevented the next ordinary Query from reserving a new action, despite no unresolved result. This was an isolated journal diagnostic, not an installed-client or business-task failure.

The detailed journal remains capped at 2048. At saturation, a returned receipt from an older Query under the same Product/native Session owner can become a durable SHA-256 tool-identity tombstone. Pending, unresolved, legacy uncertainty and current-Query details remain protected. The tombstone denies reuse of that old tool identity after another cold restore; it never authorizes replay or settles a newer result. Older detailed receipt fields leave the bounded journal, while original transcripts and existing action evidence remain unchanged.

Tombstones have an independent 65536 bound and never expire. That bound, a full protected/current Query, or the existing Store 16 MiB limit refuses further protected execution with an inspection message. Starting an independent Session is not permission to replay unknown operations. This does not change per-Query admission limits, owner/Stop guards, write-ahead storage, signed task-query review, inference retry budgets or model/provider policy.

Uncompacted data keeps journal schema1. Compacted data uses owner-bound schema2. Invalid, duplicated, foreign or overlapping identities fail restoration. Journal-aware older schema1 readers reject schema2. Binaries that predate the journal extension still retain the raw unknown hashes and existing completed-action evidence; rollback does not gain new native receipt authority.

Root validation, using isolated source/dependencies and no installed application, business Session or Provider:

- 37 journal/controller tests passed: rollover and cold identity denial, pending/unknown preservation, current Query/history bounds, corruption, legacy data, exact callback ownership, Stop and persistence failure. The initial run's two new fixture assertions expected the wrong rejection order and omitted pre-arm persistence; those assertions were corrected without changing the production implementation or weakening the guards.
- One new real SessionStore test passed across two module reloads: old settled identities compact, the new pending record remains durable, reused old identities are denied and a stale result cannot settle the pending operation. Its first fixture omitted normal persisted Product Session metadata; the corrected fixture follows the existing transcript append path. Original failure logs remain in the release owner's private evidence directory.
- TypeScript, scoped ESLint, test classification and whitespace checks passed. This does not rerun or replace the author's broader matrix.

Private hash-bound controls and logs are under `work/release-0526-20261029/owner`. Source acceptance, latest-main integration, required CI, signed native acceptance, formal artifact, installation and updater publication remain distinct later gates owned by `01a12bc2-907a-7702-b6dd-788225c5dfe4`. The delivered 0.5.25 artifact is unchanged.
