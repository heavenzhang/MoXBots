# MoXBots0.5.17 — standard OAuth sign-in

Preparing build517.1, not built/installed/published. Completed0.5.16/build516.8 remains local/stable rollback. Existing sole desktop publisher owns version/combinedCI/main/artifact/rollout; cloud auth owner deploys additive compatibility first.

The patch uses authorization code + S256 PKCE and a prebound random local callback, a single browser action for fixed-service sign-in, and original account/device/credential commit authority. Identity-inspection retry reuses the received token; ambiguous code exchange requires new authorization. Existing Host/mobile/Web auth remains compatible. No credential clearing, identity reset or business replay.

Source/loopback evidence dev-docs/login-oauth-standard/acceptance.md. Required original Air result: actual new-build browser authorization preserving principal/device, normal Cmd-Q/reopen and persistent login. Existing old-session Ready does not prove the new flow. Source/main/tag/artifact digests, exactCI, cloudcompatibility, local and Air results must be recorded separately; this document is not production acceptance.
