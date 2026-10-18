# Linux Host onboarding UI acceptance

Primary independently inspected the implementation worker's actual React components in a loopback-only Vite fixture using Codex's built-in browser on 2026-10-18. API and device rows were synthetic, explicitly named as such. This is UI acceptance, not Linux installation, OIDC, real device admission or model execution evidence.

- 390×844 command view: two steps, one copy action, explicit Ubuntu/sudo requirement, no manual install/login checkboxes. Long command scrolls inside its own code block; footer and close are reachable.
- Copy success entered waiting; before a new ready device arrived, completion and management were disabled.
- 768×1024 waiting view: bounded five-second/five-minute explanation, target selector and separate online/callable facts; document width 768 for viewport 768.
- A unique synthetic new remote Host was selected after polling. Online became ready, callable remained empty; completion and management enabled without claiming a model call.
- 1440×900 ready view: document width 1440 for viewport 1440. Actual management callback received the target (fixture root became `Manage target (synthetic)`).
- 390×844 ready view: document width 390, long target name/ID contained, body independently scrollable and sticky footer reachable. Screenshots: [narrow](screenshots/ready-390.png), [wide](screenshots/ready-1440.png).
- DOM regressions separately cover unavailable/error, failed clipboard, partial/foreign directories, existing/local/multiple targets, stale account/network/generation and late responses, timeout/retry, and catalog revision not resetting install progress. Implementation worker reported 26/26 passing plus targeted ESLint/Prettier; combined CI remains authoritative for final head.

Initial fixture missing theme attributes and API alias was corrected before visual acceptance; neither was a production component defect. The first implementation keyed Linux lifetime by catalog revision; primary found that a real Host arrival increments revision, and the worker fixed it with a regression before commit.

No installed Mac client, production service, real account or paid model was used. Temporary browser viewport override was reset after inspection.
