# 0.5.26 / 526.1 source selection

Deployment owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4`, desktop/macOS-arm64/updater and shared CI/main. Task `MB-RELIABILITY-20261028-DEPLOY-01` follows the completed 0.5.25 delivery; this source record is not an installed or published result.

The combined branch includes the five reliability phases through `d22973f485e5b9bf17aeffff29db5d3c28e7ced8`, Root retention fix `4f328433f177a5ffcbf3f122a8729800b706de34`, and delivered main `9d07411342d9b8549cc016790d2da96d3bef90b7` through a normal merge. Root's production delta review and exact input hashes are in the private release owner records. The separate retention note explains its capacity, compatibility and evidence limits.

Accepted task `MB-CLOUD101-MANAGEMENT-MATCHING-20261029` contributes only the four Rust files changed by `f99f4591e823f033815e586d0b01c6460941fcc9`, applied as `b96e5a933`. The parent bytes of each existing file matched this combined source; the added negative test path was absent in both parents. The cloud/mobile branch, subsequent documents and phone device outputs are not included. This preserves strict RemoteMobile/RemoteAssets reply correlation in the headless/desktop management controller; physical iPhone acceptance is separate.

The pre-existing eight-argument headless management handler failed full strict Clippy on both original parent and child. Root grouped its captured connection authority into a context passed by both existing call paths. `cargo clippy --locked --offline --all-targets --manifest-path src-tauri/headless-network/Cargo.toml -- -D warnings` now passed on the combined source, with no lint allowance or weakened gate. Rustfmt normalized the connector layout. Original failed author logs and the new successful control are preserved separately.

The author protocol31, headless225 plus two ignored cases and mobile core42 logs remain exact-source author evidence. Root has not repeated those matrices merely to relabel them. Required combined-source CI will validate this new selection. Root's retention unit/Store checks do not substitute for signed native, real Provider, Linux QA controller, phone or production business acceptance.

Version allocation is 0.5.26/build526.1. Source freeze, required CI/main admission, immutable signed artifact and tag, local maintenance/install, real affected paths and 101 existing-stable CAS publication must each have their own exact-source receipt. Original 0.5.25 and rollback artifacts remain immutable; no GitHub binary release or server Nginx/TLS change is part of this batch.
