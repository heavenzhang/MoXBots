# First desktop execution intent correction

Signed build521.1 first input on a newly registered QA Agent returned executionAdmission.error=INTENT_UNCONFIRMED; no execution ledger was created. The input was sent once and then normally stopped. Native SDK CWD matched the controlled workspace. No failed input or unknown business operation was replayed.

The semantic utility checked SessionMetadata.modelMode strictly against auto, although the product policy and regular routing admission define absent modelMode as auto. On a fresh Session without an effective provider/model yet, that strict branch returns no classifier before the later normal routing step. Reuse normalizeModelMode at the utility owner. Preserve explicit manual mode, tool-free transport, timeout and abort handling, verified human input, ledger and Stop fences.

A regression through the actual builtin adapter and classifySessionExecutionIntent fails only for absent mode before the change, and passes absent/explicit-auto/manual controls afterward. No SDK query or Product message is created by this utility test. Synthetic transport evidence does not substitute for corrected signed-client first-input acceptance.

Root remains the sole shared CI/main and desktop/macOSarm64/updater publisher. The old521.1 bytes remain immutable. If source/CI succeeds, the correction uses a new521.2 candidate; no unrelated queued features or deployment units join this correction. Installation and stable-channel delivery remain pending actual evidence.

Validation: 260 affected integration/unit checks pass; TypeScript noEmit and scoped ESLint pass. Native corrected package, local installation and stable promotion remain pending.
