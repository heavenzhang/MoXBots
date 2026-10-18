# Android on-device speech readiness probe

This is a bounded diagnostic for the Android implementation at the parent task's current source checkpoint. A green instrumentation result means the probe ran and its assertions held; it does not mean speech recognition is ready or that microphone capture/transcription works.

## Device result

On 2026-10-18, AVD `emulator-5554` (`sdk_gphone64_arm64`, Android API 36) reported:

- `SpeechRecognizer.isOnDeviceRecognitionAvailable`: `true`.
- `RECORD_AUDIO`: `DENIED` in the instrumentation target app. No permission was requested or changed.
- API 33+ `checkRecognitionSupport` callback: success for the on-device recognizer and `zh-CN` request. Installed locales: `en-US`. Pending locales: none. Supported on-device locales include `cmn-Hans-CN` (Mandarin Simplified, China), which is supported but needs model installation.
- Readiness for local Chinese recognition: `unavailable` on this AVD because no Chinese on-device locale is installed or pending. The mere presence of RecognitionService implementations is not a language-model readiness signal.
- The real `NativeSpeech.start()` returned `MOBILE_SPEECH_PERMISSION_REQUIRED` exactly once; state remained `idle`; the event list remained empty, with no recording or transcript event. The permission-denied negative path passed.
- During this original read-only probe, no `startListening`, model download, microphone permission request, audio input, or online recognizer fallback was used. Later explicit setup attempts are recorded separately below.

Raw device probe output: [android-emulator-5554.txt](android-emulator-5554.txt). The Gradle JUnit report recorded one test, zero failures/errors/skips on `emulator-5554`.

## Reproduction

After the Expo-generated Android project exists (`npx expo prebuild --platform android --no-install`) and the ignored native connection library has been generated with `node mobile/scripts/build-native.mjs android`, run this single test command from the repository root:

```sh
source /tmp/moxbots-mobile-toolchain-002.zsh && mobile/app/android/gradlew -p mobile/app/android :moxbots-remote:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.moxbots.mobile.remote.NativeSpeechReadinessInstrumentedTest
```

By default, the test is read-only for readiness metadata. Its library-test manifest mirrors the production config plugin's `android.speech.RecognitionService` visibility query; the packaged instrumentation manifest was checked to contain the same query. It uses `createOnDeviceSpeechRecognizer` and `checkRecognitionSupport` with an eight-second callback bound; it never invokes `startListening`, and without the explicit setup argument it does not invoke `triggerModelDownload`. If the test application's microphone permission is already granted, the NativeSpeech negative start is skipped and recorded as `null`; the test does not revoke permissions to manufacture a negative case.

## Interpretation and next step

The current AVD can expose an on-device recognizer, but it has no installed or pending Mandarin model. Its system metadata lists `cmn-Hans-CN` as supported but not installed. The original delegated read-only probe did not attempt model installation. The later primary-owned opt-in attempts are recorded below; neither completed installation. Further verification needs the supported language model prepared through the platform speech service on a controlled device, any actual system approval completed, and a new bounded metadata probe. Actual microphone capture, acoustic recognition, transcript quality, editable-draft integration, physical-device behavior, iOS behavior, and production readiness remain unverified.

Android references: [SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer), [RecognitionSupport](https://developer.android.com/reference/android/speech/RecognitionSupport), and [RecognitionSupport.Builder](https://developer.android.com/reference/android/speech/RecognitionSupport.Builder).


## Explicit controlled-device model preparation

The developer-only runner argument below requests Android's official on-device model download for the supported Mandarin model reported by that device. The default regression command above does not download anything. This opt-in is a test-device preparation step, not a product startup side effect and not a new production speech API. It never grants microphone permission or starts listening, and asserts the microphone permission is unchanged. API34+ is required for observable download callbacks; success, scheduled, error and a60-second observation timeout are reported separately. A subsequent fresh metadata query decides readiness; a green diagnostic or a scheduled download does not establish ASR success. Any actual system approval must be handled normally, without bypassing it.

```sh
source /tmp/moxbots-mobile-toolchain-002.zsh && mobile/app/android/gradlew -p mobile/app/android :moxbots-remote:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.moxbots.mobile.remote.NativeSpeechReadinessInstrumentedTest -Pandroid.testInstrumentationRunnerArguments.moxbotsInstallSpeechLocale=zh-CN
```

The setup uses the exact Chinese model locale advertised in `supportedOnDeviceLanguages`; the application's requested locale remains `zh-CN`. Device metadata/model setup cannot prove that alias is accepted by actual recognition; real audio remains a separate gate. First attempt with the requested aliaszh-CN was actually refused witherror12, so that failure is retained rather than treated as installed. Subsequent setup uses the advertisedcmn-Hans-CN identifier. Result evidence is recorded separately from the earlier read-only probe.


Controlled AVD setup actually invoked on2026-10-18: [requested alias refused](model-setup-zhcn-refused.json) returnederror12; [advertised Mandarin model attempt](model-setup-advertised-timeout.json) received no download callback/progress in60 seconds. Fresh metadata still reported installeden-US only and no pending Mandarin model. Microphone remainedDENIED, actualNativeSpeech start remainedidle with0 events. This establishes an attempted platform request, not a completed download, successful ASR, or proof of a particular network/system-approval failure. No repeated download request is scheduled automatically; further device setup needs actual platform feedback/user presence. Original read-only evidence above remains historical for the earlier source.

After both setup attempts, the primary reran the default complete Android instrumentation suite:32 tests,0 failures/errors/skips,9 seconds. The default probe reported `modelDownloadTriggered:false`, `modelSetup:null`, installeden-US only and microphoneDENIED. It did not repeat model setup. Log: `/tmp/moxbots-mobile-speech-model-default-regression.log`.

## Changed-permission retest2026-10-18

After the independent Android test host gained the same INTERNET permission already present in the app, primary explicitly retried the existing official model setup once. Test1pass/0failure1.677s proves metadata and permission-denied closure only. Service advertisescmn-Hans-CN; downloadcallbackerror_11 with progress-1, installedChineseempty, readinessunavailable. RECORD_AUDIO remainsDENIED,0 recording/transcript events. `/tmp/moxbots-mobile-speech-internet-permission-retest.{log,xml}` and `/tmp/moxbots-mobile-speech-current-summary.json`. No unchanged retries; a physical phone/supported recognition service is still needed for actual Chinese ASR acceptance.
