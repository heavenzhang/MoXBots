import Foundation

/// Per-attempt counters only: never retain audio, transcript, error descriptions or userInfo.
/// The audio tap writes while Speech callbacks read; keep the critical section small.
final class SpeechCaptureDiagnostics: @unchecked Sendable {
  private let lock = NSLock()
  private var frames: UInt64 = 0
  private var sawSamples = false
  private var sawSignal = false

  func observe(frames count: UInt32, signal: Bool?) {
    lock.lock()
    frames += UInt64(count)
    sawSamples = sawSamples || signal != nil
    sawSignal = sawSignal || signal == true
    lock.unlock()
  }

  var observation: (frames: UInt64, samplesAvailable: Bool, signalPresent: Bool) {
    lock.lock()
    defer { lock.unlock() }
    return (frames, sawSamples, sawSignal)
  }

  func failureCode(_ error: Error) -> String {
    let os = error as NSError
    // Only closed domain labels and numeric codes cross to the app. In particular,
    // never surface localizedDescription / userInfo (may contain recognized words).
    let family: String
    switch os.domain {
    case "kAFAssistantErrorDomain": family = "AF"
    case "kLSRErrorDomain": family = "LSR"
    case "SFSpeechErrorDomain": family = "SF"
    case "AVFoundationErrorDomain": family = "AV"
    case NSOSStatusErrorDomain: family = "OS"
    default: family = "OTHER"
    }
    let number = String(os.code).replacingOccurrences(of: "-", with: "N")
    let audio = observation
    let input = audio.frames == 0 ? "F0" : audio.signalPresent ? "S1" : audio.samplesAvailable ? "S0" : "U1"
    return "MOBILE_SPEECH_RECOGNITION_FAILED_\(family)_\(number)_\(input)"
  }
}
