import ExpoModulesCore
import Foundation
import UIKit

public final class MoxBotsRemoteModule: Module {
  private let queue = DispatchQueue(label: "com.moxbots.mobile.remote.owner", qos: .userInitiated)
  private var connection: NativeConnection?
  private var backgroundObserver: NSObjectProtocol?
  private lazy var speech = NativeSpeech { [weak self] event in
    self?.sendEvent("speechChanged", event.projection)
  }

  public func definition() -> ModuleDefinition {
    Name("MoxBotsRemote")
    Events("snapshotChanged", "speechChanged")
    OnCreate { [weak self] in
      self?.backgroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil
      ) { [weak self] _ in
        DispatchQueue.main.async { [weak self] in self?.speech.cancel() }
        self?.queue.async { [weak self] in
          _ = try? self?.connection?.request("{\"version\":1,\"kind\":\"connection.suspend\"}")
        }
      }
    }
    AsyncFunction("request") { [weak self] (input: String, promise: Promise) in
      guard let self else { promise.resolve(Self.failure("MOBILE_CONNECTION_UNAVAILABLE")); return }
      if let bytes = input.data(using: .utf8), bytes.count <= 64 * 1024,
        let intent = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
        let kind = intent["kind"] as? String, kind.hasPrefix("speech.") {
        guard intent.count == 2, intent["version"] as? Int == 1 else {
          promise.resolve(Self.failure("MOBILE_INTENT_INVALID")); return
        }
        DispatchQueue.main.async { self.handleSpeech(kind, promise: promise) }
        return
      }
      self.queue.async {
        do {
          if self.connection == nil {
            let origin = Bundle.main.object(forInfoDictionaryKey: "MoxBotsServiceOrigin") as? String
              ?? "https://140.143.183.232"
            self.connection = try NativeConnection(origin: origin,
              bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
          }
          guard let connection = self.connection else { throw NativeFailure("MOBILE_CONNECTION_UNAVAILABLE") }
          promise.resolve(try connection.request(input))
        } catch let error as NativeFailure { promise.resolve(Self.failure(error.code)) }
        catch { promise.resolve(Self.failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnDestroy { [weak self] in
      guard let self else { return }
      if let observer = self.backgroundObserver { NotificationCenter.default.removeObserver(observer) }
      DispatchQueue.main.async { self.speech.cancel() }
      self.queue.async { self.connection?.close(); self.connection = nil }
    }
  }
  private func handleSpeech(_ kind: String, promise: Promise) {
    if kind == "speech.start", UIApplication.shared.applicationState != .active {
      promise.resolve(Self.failure("MOBILE_SPEECH_FOREGROUND_REQUIRED")); return
    }
    let settle: (Result<Void, NativeSpeech.Failure>) -> Void = { [weak self] result in
      switch result {
      case .success:
        guard let self, let data = try? JSONSerialization.data(withJSONObject: self.speech.current.projection),
          let text = String(data: data, encoding: .utf8) else {
          promise.resolve(Self.failure("MOBILE_SPEECH_RESPONSE_INVALID")); return
        }
        promise.resolve(text)
      case .failure(let error): promise.resolve(Self.failure(error.code))
      }
    }
    switch kind {
    case "speech.start": speech.start(completion: settle)
    case "speech.stop": speech.stop(completion: settle)
    case "speech.cancel": speech.cancel(); settle(.success(()))
    default: promise.resolve(Self.failure("MOBILE_INTENT_UNSUPPORTED"))
    }
  }
  private static func failure(_ code: String) -> String { "{\"kind\":\"error\",\"code\":\"\(code)\"}" }
}
