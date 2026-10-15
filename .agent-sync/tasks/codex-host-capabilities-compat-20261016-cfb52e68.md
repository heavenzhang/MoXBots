<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-capabilities-compat-20261016 -->
<!-- git-project-sync-task:base=c225acd830513eb50736f75718f559a9ebda17bc -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-HOST-INSTALL-82-20261016: bounded Host capability compatibility

## Objective and scope

The user requested installation, browser-authorized owned-network enrollment, and then reuse of the current desktop main Agent's model on their new Linux Host so it can execute tasks. This branch fixes a discovered blocker: the Host advertises 13 methods while deployed v1 codecs accept at most 12. The desktop therefore falls back to the legacy Kimi form.

Retain the existing v1 codec, permissions, private IPC and all callable operations. Omit only the redundant baseline host.snapshot advertisement; extension clients use host.inspect, and legacy clients can still call host.snapshot. Preserve remote-session support and modern generic provider operations within the existing bound. No desktop restart, client replacement, cloud-service deployment, protocol widening or secret values in Git.

## Acceptance criteria

- [x] Identify 13-versus-12 regression in actual Host capabilities and codec.
- [x] Keep advertisement within deployed v1 bound and retain callable baseline.
- [x] Actual bundled Host/Unix IPC regression verifies modern capabilities, bound and legacy snapshot; relevant controller regression passes.
- [x] Source review, six CI checks, PR72 merge; remote main fb4ae29b3db4dd436c17d41786e61061eaa2f8d3 contains fix source98e347eb.
- [x] Build source-pinned Host package; back up target state and encrypted credentials consistently, preserve identity/units; controlled target update and rollback path.
- [x] Desktop generic configuration reads actual target; current source provider/model reused through encrypted credential owner.
- [x] Explicit execution permission, one registered Agent in the bounded default workspace, auto defaults, no proactive jobs; restart preserves identity, config/projects and encrypted credential bytes.
- [ ] Successful real minimal model/tool task: blocked by target-server connectivity to the configured supplier.

## Completed

The real desktop source-import and encrypted-credential writes completed through original owners. Desktop readback shows RC-Codex-Official / gpt-6.1-sol, OpenAI Responses, saved key, execution allowed and registered Agent enabled. Host source update preserved existing units, identity and encrypted master credential. The controlled model task was admitted but upstream connections failed with 502 retries; it was stopped/released without producing the controlled file. No successful model task is claimed.

## Verification and evidence

Private installation and execution records remain under MoxBot/work/host-install-82-20261016/. They must contain no raw credentials or authorization URLs. Current desktop source is default-workspace Mino, RC-Codex-Official / gpt-6.1-sol; no assumptions about unrelated Agent settings. Installation, network ready, desktop configuration, model execution and main delivery are separate gates.

## Blockers and unknowns

The target cannot connect to the current supplier endpoint. Different DNS paths return inconsistent answers, and TLS connections using independently resolved addresses are reset. No certificate verification was weakened and no alternate supplier was selected. The user was asked for an existing proxy/configuration location or an authorized supplier alternative endpoint. Supplier billing/usage is unknown; successful test tasks: zero. Remote task execution through the desktop catalog has not been accepted.

## Next step

Continue from the private README and model-configuration-receipt.json under MoxBot/work/host-install-82-20261016/ when the user provides a reachable egress path or alternative supplier endpoint. Preserve original desktop settings and immutable Host profile identity; verify one bounded real task before claiming execution readiness. Source fix is delivered on main; this branch carries the continuing operational handoff only.

Validation: original Node24 IPC/controller 16/16; after synchronizing latest main, Host/IPC/desktop configuration regressions40/40. CI38776895322 six jobs passed; actual main merge tree equals the locally tested merged tree. The installed Host-relevant source/dependencies have no diff against main.
