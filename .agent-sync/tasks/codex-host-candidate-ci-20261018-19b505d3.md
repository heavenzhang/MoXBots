<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-candidate-ci-20261018 -->
<!-- git-project-sync-task:base=96010acb710dfa864ddad979fe1d0b6dc49df69a -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Prepare isolated Linux Host acceptance candidate artifact workflow

## Objective

Add a manually dispatched, source-pinned CI workflow that creates a non-public Linux Host acceptance candidate from one clean full commit SHA. It emits a closed three-file candidate artifact and a separate two-file AgentNet service artifact; it does not publish a public release or dispatch the workflow.

## Acceptance criteria

- A manual workflow accepts only a full 40-character commit and verifies the checkout is exact and clean.
- The moxbot-test Host archive, Linux x86_64 network connector, and AgentNet service are built from that source checkout.
- Existing release preparation and consumer validation pass before candidate bytes are staged under RUNNER_TEMP.
- Candidate artifact contains exactly bootstrap.py, bundle.tar.gz, and canonical candidate-meta.json; service artifact contains exactly the service ELF and source-commit.txt.
- Offline tests reject dirty/mismatched source, modified package bytes, invalid service ELF, and unsafe output locations.
- No workflow run, release, server, or production action is performed in this task.

## Completed

- Added `.github/workflows/host-candidate.yml` with only a manual full-SHA input, clean source checkout, Node 24.20.0, Rust 1.92.0, Host build, connector/service release builds, existing prepare-release consumer, and candidate staging.
- Added `scripts/host/prepare-acceptance-candidate.py` to verify source, prepared release receipt, exact Host consumer contract, Linux ELF service, output containment, and closed artifact payloads. It prints a bounded producer receipt for root-side pinning; it contains no publicOrigin.
- Added six offline tests in `scripts/host/prepare-acceptance-candidate.test.py`.

## Verification

- `python3 -m py_compile scripts/host/prepare-acceptance-candidate.py scripts/host/prepare-acceptance-candidate.test.py` — passed.
- `python3 scripts/host/prepare-acceptance-candidate.test.py` — 6 tests passed.
- `git diff --check` — passed.
- Workflow was not dispatched; CI build artifacts and Linux acceptance remain pending a later authorized run.

## Blockers and unknowns

- Record unresolved ownership, environment, authorization, or validation gaps.

## Next step

Review the four-file diff, then merge this isolated branch through the repository’s normal review/CI path. After merge, dispatch only with the exact intended full source SHA, freeze both GitHub artifact IDs and producer receipt digests, and hand those pins to the separate acceptance harness owner. Do not interpret the candidate as public publication or production acceptance.
