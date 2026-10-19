# iOS speech failure — 2026-10-20

Task MOXBOTS-IOS-SPEECH-FAILURE-20261020; parent MOXBOTS-IPHONE-ACCEPTANCE-20261019. Source review/local tests are complete; production and real recognition acceptance are not.

## Reproduction

Actual paired Xu iPhone12ProMax, iOS27.0.1, com.moxbots.mobileinternal0.1.0/build1 from main18e13ce8. Human retained the existing account, allowed system Speech/microphone permissions, personally read a Chinese test phrase and tapped Finish twice. Both attempts produced no recognized text. Actual displayed code: MOBILE_SPEECH_RECOGNITION_FAILED. The generic banner incorrectly blamed a remote connection. No message was sent. This is sustained failure; first-permission transience alone does not explain the second attempt.

## Changes and evidence boundary

NativeSpeech now creates the recognition consumer before starting the audio engine. Stop halts the audio producer/removes its tap before calling endAudio. This hardens lifecycle ordering; neither race was demonstrated as the cause of the two device failures. On-device-only recognition and existing cancellation/generation authority remain.

Per-attempt diagnostics retain only frame count and boolean sample/signal observations. Failure codes expose a closed OS domain label, numeric NSError code and input flag: F0=no frames; S0=float samples below0.00001 threshold; S1=some above threshold; U1=frames with no float sample access. S1 does not prove intelligible speech. Unknown domains map OTHER. No audio, transcript, localizedDescription or userInfo is logged/persisted or placed in diagnostics. Existing strict code schema (uppercase/digit/underscore,128 characters) is retained. AF1101 is a synthetic unit-test input, not a device finding.

Local speech failures now have phone-specific guidance and preserve existing draft content; non-speech failures keep their original ownership. A recognition error must not be presented as a Host connectivity fault.

## Focused verification

- Swift5 NativeSpeech+helper typecheck on arm64 device and simulator iOS16.4 target with installed iOS27.1 SDK: PASS.
- Foundation-only diagnostic tests: no-input/silent/signal/unknown-format, privacy/negative code/Int.min,10,000 concurrent observations and new-attempt isolation PASS. Does not access microphone or accounts.
- JS typecheck, Expo lint and63 policy tests PASS (base61+2; layout adds separate6, combined count requires owner verification).
- Swift helper is included by the existing podspec ios/*.{h,m,mm,swift} glob. Rust native-source closure is unchanged; full app Swift/JS rebuild and source provenance are still required.

No new app is signed, installed or accepted by this record. Shared CI/native full build are the mobile batch coordinator's gates, not replaced by local typecheck.

## Delivery and real-device gate

Human explicitly chose01a12bc2-907a-7702-b6dd-788225c5dfe4 to coordinate this mobile batch. Implementation chat01a12b99 retains read-only phone evidence and may execute further build/install only after coordinator freezes source/build and delegates the execution. Do not change or relabel an already frozen artifact. Combine separately with layout branch codex/mobile-chat-layout-20261020 head1d67241bbbe171d9bfc11dc2b93a5b4c953bbcfe.

New candidate must show real Chinese recognition, editable draft, Finish/Cancel/retry/background handling and no auto-send while retaining the human login. If it still fails, collect only the safe code/input flags and fix the evidenced layer before asking for another reading. Do not infer speech acceptance from a build, simulator or policy test.

Private evidence: project pointer output/iphone-acceptance-20261019/voice-human-finished.png, voice-second-human-finished.png and voice-second-failure-code.png. The idle speech panel is closed and there is no active recording. Daily Mac and original101 remain untouched. Business screenshots, phone identifiers and credentials are not committed.
