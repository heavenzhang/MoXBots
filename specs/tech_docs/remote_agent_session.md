# Direct remote Agent conversations

The independent `remote-session` Tab opens a same-account Agent through the
existing owned encrypted management channel. It never acquires a local Session
Sidecar, forwards local Provider credentials, mounts a remote workspace or uses
an `@` invocation. Its messages and execution remain owned by the target's
original SessionEngine and SessionStore.

## Contract and authority

`session.remote` is an owned Host-management extension. Its strict requests are
capabilities, list, get, start, send, receipt, respond and stop. TypeScript source
is `src/shared/remoteSession.ts`; the Rust codec, owned schema and shared fixtures
are in `src-tauri/host-management-protocol/`. The fixed Agenthub protocol archive
is unchanged. Older targets reject the method and the Tab reports unsupported.

The existing authenticated channel binds service, environment, principal,
network, device and key generation. The inspected target scope becomes mandatory
after capabilities. Controller/target channel roles are explicit. Desktop
targets accept only this Session extension, not Host configuration methods.
Every request revalidates the local registered Agent, project visibility,
archive state and workspace association, matching the authenticated target
network-precheck. `AgentConfig.enabled` controls Proactive Agent automation and
does not authorize explicit same-account remote Session access; remote reads,
manual messages and artifacts remain available when proactive mode is off.
Network/mount authorization is still enforced by the authenticated Rust channel.
Neither remote access nor this policy enables proactive jobs or changes config.
Callers cannot provide a path, runtime configuration,
credentials or another caller identity. Private Host Bot Sessions are excluded
by their persistent `hostBotBinding` birth marker and existing delegation owner.

The internal desktop routes require the existing internal CLI credential.
`/api/remote-session/prepare` is Global-only: it freezes the original owned birth
snapshot, writes an invisible prepared Session, then calls the original V2
`publishSessionForHandoff` flush/close barrier. Rust starts the exact Session
Sidecar from that persisted runtime identity. Only the original engine's
beforeDispatch prepared CAS makes the new Session visible. Existing Sessions
retain their own snapshots. Host uses its original supervisor and supports only
its compatible builtin runtime; it can release an idle worker but never replaces
a running/waiting worker implicitly.

## Admission and recovery

Mutation UUIDs are durable before effects. The local receipt ledger stores only
request digests, bounded receipt metadata and owner liveness, never prompts,
answers or credentials. Reusing an ID with different intent fails. Completed
IDs cannot execute again; uncertain IDs are queried without replay. A receipt
not found is not proof of non-execution. Each file is private and at most 4 KiB;
the aggregate ledger admits at most 10,000 records and refuses new IDs when full.
It does not expire unknown deduplication records. Failed temporary writes clean
only their own candidate, preserving the previous durable receipt.

The processing observation lease is refreshed by the original process
incarnation every 3 seconds. Dead owners, expired preparation or a lease stale
for 12 seconds become unconfirmed; PID existence alone is insufficient. The
desktop prepared handoff expires after 60 seconds without adoption. These
observation deadlines never authorize replay or mean the operation was stopped.

Admission refusals preserve a bounded category rather than raw adapter errors.
The desktop and mobile Session owners distinguish enqueue from dispatch,
project known Provider/model, permission, workspace, queue, cancellation and
prepared-birth failures to safe codes, and record only phase/code plus original
operation/Agent/Session IDs in target-side logs. Prompts, answers, raw error text,
paths and credentials are excluded from this projection and its logs. Unknown
refusals remain explicit refusals. No category permits an automatic retry,
Provider substitution, permission change or Session replacement. The viewer
retains the draft and describes target-side configuration failures separately
from transport/read failures; old generic admission codes remain supported.
Detailed categories require an updated target; a viewer update cannot recover
a cause discarded by an older target or repair its configuration.

HTTP returns processing without waiting for a turn. A new Session is bound only
after actual dispatch acceptance. An existing send with a real queueId may be
acknowledged at original queue acceptance so approval of an earlier turn remains
reachable. Acceptance is not completion. Rust retains an independent admission
owner until receipt/queue evidence permits transfer to original
BackgroundCompletion; closing a Tab or encrypted channel cannot cancel it.
Host reserves control slots so pending sends cannot consume approval/stop capacity.

Only pending remote permission, plan and question requests appear. Responses
match process generation, turn and request ID. Permissions are allow-once or
deny. Truncated, secret or unprojected native review requests cannot be approved;
the target's original UI must handle them. Stop matches the exact active turn.

The Renderer persists only scoped operation ID/kind/status before sending.
Storage failure or corruption disables new writes rather than guessing success.
Tab close/restart preserves unknown IDs; explicit account boundaries remove
their scope. Cold network hydration keeps a locked Tab until account identity
can be verified. Draft text and answers are not persisted by this feature.

## Observation and UI

Opened Tabs synchronize bounded complete snapshots: about 1.5 seconds after the
previous request finishes in the visible foreground, and about 5 seconds in the
background. Focus/visibility return, activation, explicit refresh and connection
recovery wake observation immediately; wakeups during a read coalesce into one
subsequent read. Restored remote Tabs mount immediately so their observation does
not depend on first activation. This is not token streaming.

`remoteSessionRequest` serializes this feature's requests per connection ID,
matching the Rust actor's single management slot. Receipts and explicit operations
precede queued snapshot reads without interrupting an active request. Queued
requests revalidate identity, auth generation, readiness, target scope and abort
before invoke. Cancelling observation never retries a mutation or issues Stop.
Other management clients retain their original owner and may still report busy.

The global sidebar projects App's existing remote Tabs above local workspaces,
including the existing collapsed-sidebar resource flyout. It submits focus/close
intents to App, never owns a second remote history store or execution lifecycle.
Same-identity duplicates prefer the current auth generation, then the active Tab,
without reordering other identities. Unverified identity hides private labels;
principal/network mismatch removes that account's rows. Current-generation
observations update title, execution state and a separate unread marker. Only
visible message/interaction changes mark a background view unread; metadata and
execution-state-only changes do not. Foreground visibility clears unread.

Observation status and the last successful sync time are distinct from remote
execution status. A failed read or disconnected network retains the current
in-memory content and draft, disables unavailable actions and exposes retry or
the existing network page. A resumed connection rereads the original Session;
it never replays an unconfirmed operation. Titles, messages and transient sidebar
observations remain outside the existing durable remote-Tab codec; restored
source labels use identifiers until current metadata is available. A page contains at most
30 messages and the Session result body is at most 48 KiB, leaving envelope room
under the existing 64 KiB transport limit. Oversized or unreadable projections
fail explicitly. Native thinking and raw tool inputs are not message projections.
Tool output reuses the shared local SDK text parser **before** splitting it
into canonical plain-text fragments; the controller never decodes those fragments
again (a JSON file can itself contain `content` or `stdout`). Existing bounds
remain 16,000 UTF-16 code units of text, 2,000 per tool fragment and ten tools per
wire row. These are fragment limits, not whole-message truncation limits: the
original Session read projection retains every visible text/tool block in source
order, emits continuation rows with stable source-derived IDs, and uses the
existing `get`/`before` pagination to reach all fragments. Each row also fits a
24 KiB serialized UTF-8 budget so a single long Chinese result cannot exceed the
48 KiB page by itself. Surrogate pairs are not split; prose prefers paragraph
boundaries. Continuations of one tool use individually numbered rows rather than
inflating a phase's completed-call count. Very long Markdown constructs spanning
a fragment boundary retain all text but may render as separate Markdown sections.

Remote result groups and their bounded plain-text bodies start expanded, retain
explicit user folds through ordinary snapshot updates, and show tool identity
beside the result label. Local conversation defaults remain with the normal
renderer. Raw tool input, native thinking, local file actions, attachments and
executable metadata remain outside this projection. There are no new wire fields,
request kinds or execution authority. The target needs the updated read projection
to supply previously clipped content; a viewer alone cannot recover output
already discarded by an older target. Older target truncation notices remain
supported; source and installed dual-device acceptance are separate gates.

The renderer shares the normal conversation pipeline: `RemoteConversation` projects
immutable remote messages into `MessageList → Message → BlockGroup → ProcessRow →
ToolUse`; `useChatScrollModel` and `useChatScrollController` own the same geometry,
virtualization and reading/follow intent for both views. A successful fresh history
prepend captures its anchor immediately before the data commit. The shared
`preserveAnchorAfterPrepend` maintains that anchor across later row measurements,
then releases it on user scrolling/navigation, disclosure, session change, deleted
anchor or presentation suspension. Empty/duplicate remote pages advance the
cursor without registering a false prepend. Session/generation keys isolate
remote geometry. Unchanged parsed snapshot rows retain identity so polling keeps
user disclosure state.

`ConversationContentContext` marks remote observation content throughout the
shared renderer. Canonical tool summaries bypass local file/result/protocol parsers;
local file galleries, widgets, export, retry/fork/rewind and local interaction cards
are unavailable. Permission/plan/question replies stay with the existing remote
interaction/receipt owner. Missing timestamps stay unknown. The shared
`ComposerSurface` primitives, autosize hook and shortcut/IME handler serve the normal
`SimpleChatInput` and remote text-only composer; remote drafts clear only after the
remote operation receipt is accepted. The text-only adapter does not initialize a
local Provider, workspace file service or Session runtime. Transport-specific
status/history and interaction slots do not confer local Session authority.

Remote Markdown disables local files, attachment/image loads and active preview
actions. Latest history lists replace their baseline; explicitly loaded older
list pages are marked cached and are cleared by manual refresh.

Component simulation and loopback owner tests do not prove real encrypted
dual-device use, Provider execution or an installed signed client. Their evidence
and the outstanding release gates are recorded in the task and
`dev-docs/remote-session/`.
