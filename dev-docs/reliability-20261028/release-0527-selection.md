# 0.5.27 / 527.2 selection

The previous 0.5.26 immutable candidate passed its exact CI, signing, notarization and archive checks, but native acceptance exposed an idle warm-Query review rejection. Its original tag and artifacts remain unchanged and it was not promoted to the 101 stable updater.

This candidate contains the complete already-merged reliability and management-correlation work from main6993 plus one recovery-review lifecycle correction: a parked warm streaming iterator may still have `processing=true`. The spawn gap remains fenced when processing has no Query. Existing root/queue/turn/background/pre-warm/MCP/fork/recovery-wait/owner, signed reconciliation, journal and Store guards are unchanged.

The regression exercises the real builtin adapter and scratch SessionStore, covers warm idle and unchanged durable ledger, and retains spawn/pre-warm/background/queue/rewind rejection. It does not claim real Provider fault-matrix or production Goal acceptance. Native review, same-artifact install and 101 existing-manifest CAS are still release gates.

The 527.1 native candidate then passed normal Provider and warm review acceptance, but a cold restored conversation still retained preWarming=true after SDK control readiness. It was not published and its artifacts remain unchanged. No v0.5.27 tag has been created for that candidate.

Build527.2 also admits cold read-only review only when control readiness and a parked message resolver belong to the current Query generation. The original pre-warm flag stays unchanged; review does not wake the generator or send the first user input. Explicit abort and termination rejection prevents a dying warm Query from gaining review authority. Replaced Query waiters cannot be inherited. SDK setup, unparked control, queued turns, background work, owner/fork boundaries, signed reconcile authority and Store/journal fences remain protected.

The real adapter regression first reproduced three failures (cold-ready rejection and two missing warm shutdown fences), with eleven negatives passing. Fourteen adapter cases plus eight Store cold cases now pass. Both signed-client cold review without sending input and a new real-Provider warm review remain required for the new immutable candidate; 527.1 warm acceptance alone is insufficient.


### R3 selection revision: await admission settlement in existing DOM regression

R2 production delta remains unchanged. Its exact CI completed actual ARM successfully, but one existing launcher rejection test inspected restored text after synchronous dispatch rather than after async false admission. The adjacent mention case had the same timing assumption. R3 gives both tests controlled admission promises, checks immediate clear, and settles rejection under React act before all original restoration assertions. 85 focused DOM cases, typecheck and scoped lint pass; no production code, waits, skips or loosened acceptance. R2 freeze and CI failure originals are retained; 527.2 has never been built. New exacthead CI and actual cold/warm signed-client paths remain required before formal local/101 completion.


### R4 selection revision: validate the native coarse invalidation contract

R3 Windows IO completed171tests but failed the watcher test's deletion event-kind assertion. A first exact-factory Mac experiment likewise observed Modify(Data(Content)) for a deleted path, preserving a portable counterexample to a mandatory Remove kind. The production callback already emits coarse invalidation for any successful batch and re-reads the directory. R4 only changes cfg(test): independent watcher/workspace per operation, required real scoped notification, exact final entry/content/existence assertions for create/rename/atomic replacement/delete. No production watcher, timeout, skip or safety policy changes. The first failure experiment is retained; updated extracted-factory Mac test and strictclippy/rustfmt pass. Actual Windows/Tauri exact-headCI and signed-client cold/warm acceptance remain required before527.2 formal release.
