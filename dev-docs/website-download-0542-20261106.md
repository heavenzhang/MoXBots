# WEB-DOWNLOAD-0542-5426

The 101 website download is updated to macOS Apple Silicon MoXBots 0.5.42/build 542.6 using the exact immutable signed and notarized updater TAR.GZ. Producer source is `34fe85d41660b361232015c54e33ef4bfffa1d57`, release main is `045b30eef4caf827249934539b6d0197674266b4`, tag is `v0.5.42`, and the archive is 302337663 bytes with SHA-256 `5e6724a0dc672f0cead5a86553e7ff9e714f1423298ab57258ec28232f9046d1`.

The original owner recorded a complete normal-TLS public GET and production signature pass at `work/release-0542-r6-20261106/owner/candidate-5426-34fe85d4/publication/external-get-gates.json`. The website task reuses that result and never repeats a large download, binary upload, build, signing, or updater switch.

Website projection: `services/website/trial-release.json` and immutable `download/releases.5c2bdfe8ab11.json` are identical. The page and 0.5.42 notes state the long-chat scroll, input/project-dialog wrap, and Playwright/Codex task recognition changes. The old 0.5.36 manifest, notes, and history remain for rollback. Windows remains preparing. The 23 deterministic website tests cover exact source/size/hash/link rendering and fail-closed behavior.

Website availability proves only the download page and artifact distribution. Host, models, phone business flows, and TestFlight have separate acceptance records.
