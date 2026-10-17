# iOS full application build checkpoint

Exact application build source: `f6ffc3990c804070bad99b113bfa34f7c4341bd8`.
[Actual complete build39076091630](https://github.com/heavenzhang/MoXBots/actions/runs/39076091630) succeeded; job117523438364, artifact12117391203, `mobile-ios-simulator-f6ffc3990c804070bad99b113bfa34f7c4341bd8` (19683711-byte uploaded ZIP).

The remote macOS build used the real iOS device/simulator SDK and Rust targets, built the XCFramework and complete Expo/RN application with nine owned Swift sources, Pods and embedded JavaScript. The Pod source glob repair in913e excludes vendored framework headers from the generated Pod umbrella; the original MoxConnectionCore framework module remains authoritative. Earlier failed attempts are historical evidence in the plan.

Primary downloaded the artifact and inspected its archive without launching it: `CFBundleIdentifier=com.moxbots.mobileinternal`, supported platform `iPhoneSimulator`, arm64 Mach-O executable and nonempty main.jsbundle. Native simulator provenance: targetaarch64-apple-ios-sim, sourcef6 clean, sourceScopeVersion2, sourceDigest4152ed9e2549eab4f0390ad50447bdfd8ae103b54f3d3482dda2a3d0da3b948b, Rust library SHA256e49564197c53620c27234abdfa0d61979216edbdc35414d53c4e49a7575b8315.

Saved controlled build archive: `MoxBot/output/mobile-002/native-checkpoints/MoxBots-mobile-002-ios-simulator-unsigned-fbe63f89.tar.gz`; adjacent `.tar.provenance.json`. Both0600 and copied archive hash independently read back as `fbe63f89f841997378d19d44a29cb34f69a218994d3278794c1afac5f2b9d6a1`. Full build log: `/tmp/moxbots-mobile-ios-full-app-success.log`.

This is an unsigned simulator application with embedded JS. No local Apple agreement acceptance, developer account login, signing/provisioning, simulator launch, physical iPhone installation, microphone/ASR, push delivery or actual user-path acceptance is implied. It cannot be installed on an iPhone as an internal signed release. Subsequent Host-only fixes and androidTest diagnostics do not change the application source packaged here.
