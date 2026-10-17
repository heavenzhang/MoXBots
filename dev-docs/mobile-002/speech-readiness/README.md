# Android on-device speech readiness probe

This is a bounded diagnostic for the Android implementation at the parent task's current source checkpoint. A green instrumentation result means the probe ran and its assertions held; it does not mean speech recognition is ready or that microphone capture/transcription works.

## Device result

On 2026-10-18, AVD `emulator-5554` (`sdk_gphone64_arm64`, Android API 36) reported:

- `SpeechRecognizer.isOnDeviceRecognitionAvailable`: `true`.
- `RECORD_AUDIO`: `DENIED` in the instrumentation target app. No permission was requested or changed.
- API 33+ `checkRecognitionSupport` callback: success for the on-device recognizer and `zh-CN` request. Installed locales: `en-US`. Pending locales: none. Supported on-device locales include `cmn-Hans-CN` (Mandarin Simplified, China), which is supported but needs model installation.
- Readiness for local Chinese recognition: `unavailable` on this AVD because no Chinese on-device locale is installed or pending. The mere presence of RecognitionService implementations is not a language-model readiness signal.
- The real `NativeSpeech.start()` returned `MOBILE_SPEECH_PERMISSION_REQUIRED` exactly once; state remained `idle`; the event list remained empty, with no recording or transcript event. The permission-denied negative path passed.
- No `startListening`, model download, microphone permission request, audio input, or online recognizer fallback was used.

Raw device probe output: [android-emulator-5554.txt](android-emulator-5554.txt). The Gradle JUnit report recorded one test, zero failures/errors/skips on `emulator-5554`.

## Reproduction

After the Expo-generated Android project exists (`npx expo prebuild --platform android --no-install`) and the ignored native connection library has been generated with `node mobile/scripts/build-native.mjs android`, run this single test command from the repository root:

```sh
source /tmp/moxbots-mobile-toolchain-002.zsh && mobile/app/android/gradlew -p mobile/app/android :moxbots-remote:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.moxbots.mobile.remote.NativeSpeechReadinessInstrumentedTest
```

The test is intentionally read-only for readiness metadata. Its library-test manifest mirrors the production config plugin's `android.speech.RecognitionService` visibility query; the packaged instrumentation manifest was checked to contain the same query. It uses `createOnDeviceSpeechRecognizer` and `checkRecognitionSupport` with an eight-second callback bound; it never invokes `startListening` or `triggerModelDownload`. If the test application's microphone permission is already granted, the NativeSpeech negative start is skipped and recorded as `null`; the test does not revoke permissions to manufacture a negative case.

## Interpretation and next step

The current AVD can expose an on-device recognizer, but it has no installed or pending Mandarin model. Its system metadata lists `cmn-Hans-CN` as supported but not installed. Model installation was deliberately not attempted. The next permitted step is a separately authorized, user-visible installation of that on-device language model on a controlled device, followed by a newly bounded metadata probe. Actual microphone capture, acoustic recognition, transcript quality, editable-draft integration, physical-device behavior, iOS behavior, and production readiness remain unverified.

Android references: [SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer), [RecognitionSupport](https://developer.android.com/reference/android/speech/RecognitionSupport), and [RecognitionSupport.Builder](https://developer.android.com/reference/android/speech/RecognitionSupport.Builder).
