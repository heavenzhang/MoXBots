# 0.5.27 / 527.1 selection

The previous 0.5.26 immutable candidate passed its exact CI, signing, notarization and archive checks, but native acceptance exposed an idle warm-Query review rejection. Its original tag and artifacts remain unchanged and it was not promoted to the 101 stable updater.

This candidate contains the complete already-merged reliability and management-correlation work from main6993 plus one recovery-review lifecycle correction: a parked warm streaming iterator may still have `processing=true`. The spawn gap remains fenced when processing has no Query. Existing root/queue/turn/background/pre-warm/MCP/fork/recovery-wait/owner, signed reconciliation, journal and Store guards are unchanged.

The regression exercises the real builtin adapter and scratch SessionStore, covers warm idle and unchanged durable ledger, and retains spawn/pre-warm/background/queue/rewind rejection. It does not claim real Provider fault-matrix or production Goal acceptance. Native review, same-artifact install and 101 existing-manifest CAS are still release gates.
