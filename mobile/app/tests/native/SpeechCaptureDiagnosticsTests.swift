import Foundation
import Dispatch

@main
struct SpeechCaptureDiagnosticsTests {
  static func main() {
    let raw = NSError(domain: "kAFAssistantErrorDomain", code: 1101,
      userInfo: [NSLocalizedDescriptionKey: "PRIVATE_TRANSCRIPT_DO_NOT_EMIT"])
    let noInput = SpeechCaptureDiagnostics()
    precondition(noInput.failureCode(raw) == "MOBILE_SPEECH_RECOGNITION_FAILED_AF_1101_F0")
    noInput.observe(frames: 1024, signal: false)
    precondition(noInput.failureCode(raw).hasSuffix("_S0"))
    noInput.observe(frames: 1024, signal: true)
    precondition(noInput.failureCode(raw).hasSuffix("_S1"))
    precondition(!noInput.failureCode(raw).contains("PRIVATE"))

    let unknown = SpeechCaptureDiagnostics()
    unknown.observe(frames: 1024, signal: nil)
    let unsafeDomain = NSError(domain: "PRIVATE_CUSTOM_ERROR_DOMAIN", code: -1,
      userInfo: [NSUnderlyingErrorKey: raw])
    precondition(unknown.failureCode(unsafeDomain) == "MOBILE_SPEECH_RECOGNITION_FAILED_OTHER_N1_U1")
    precondition(unknown.failureCode(NSError(domain: "SFSpeechErrorDomain", code: Int.min)).count < 128)

    let concurrent = SpeechCaptureDiagnostics()
    DispatchQueue.concurrentPerform(iterations: 10000) { index in
      concurrent.observe(frames: 1024, signal: index == 5000)
      _ = concurrent.failureCode(raw)
    }
    precondition(concurrent.observation.frames == 10240000)
    precondition(concurrent.observation.signalPresent)
    precondition(SpeechCaptureDiagnostics().observation.frames == 0, "a new attempt cannot inherit prior audio counters")
    print("SpeechCaptureDiagnostics: no-input/silence/signal/unknown-format/privacy/negative-code/concurrency/attempt-isolation PASS")
  }
}
