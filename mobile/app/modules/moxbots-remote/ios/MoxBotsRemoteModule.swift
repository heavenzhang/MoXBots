import ExpoModulesCore
import Foundation
import UIKit

public final class MoxBotsRemoteModule: Module {
  private let queue = DispatchQueue(label: "com.moxbots.mobile.remote.owner", qos: .userInitiated)
  private var connection: NativeConnection?
  private var ownerActive = true // owner queue only
  private var backgroundObserver: NSObjectProtocol?
  private var attachmentPicker: NativeAttachmentPicker? // main-thread owned
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
      if let bytes = input.data(using: .utf8), bytes.count <= 64 * 1024,
        let intent = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
        let kind = intent["kind"] as? String, kind.hasPrefix("attachment.") {
        self.handleAttachmentIntent(intent, promise: promise); return
      }
      self.queue.async {
        do {
          promise.resolve(try self.ensureConnection().request(input))
        } catch let error as NativeFailure { promise.resolve(Self.failure(error.code)) }
        catch { promise.resolve(Self.failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnDestroy { [weak self] in
      guard let self else { return }
      if let observer = self.backgroundObserver { NotificationCenter.default.removeObserver(observer) }
      DispatchQueue.main.async { self.speech.cancel(); self.attachmentPicker?.cancel(); self.attachmentPicker = nil }
      self.queue.async { self.ownerActive = false; self.connection?.close(); self.connection = nil }
    }
  }
  private func ensureConnection() throws -> NativeConnection {
    guard ownerActive else { throw NativeFailure("MOBILE_CONNECTION_UNAVAILABLE") }
    if connection == nil {
      connection = try NativeConnection(
        origin: Bundle.main.object(forInfoDictionaryKey: "MoxBotsServiceOrigin") as? String ?? "https://140.143.183.232",
        bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
    }
    guard let connection else { throw NativeFailure("MOBILE_CONNECTION_UNAVAILABLE") }
    return connection
  }
  private func accountScope() throws -> String {
    let raw = try ensureConnection().request("{\"version\":1,\"kind\":\"account.status\"}")
    guard let data = raw.data(using: .utf8),
      let account = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      account["kind"] as? String == "account", account["state"] as? String == "signed-in",
      let principal = account["principalId"] as? String, !principal.isEmpty, principal.utf8.count <= 256 else {
      throw NativeFailure("MOBILE_AUTHORIZATION_REQUIRED")
    }
    return (Bundle.main.object(forInfoDictionaryKey: "MoxBotsServiceOrigin") as? String ?? "https://140.143.183.232") + "\u{0}" + principal
  }
  private func attachmentOwner(_ scope: String) throws -> NativeAttachments {
    try NativeAttachments(scope: scope, bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
  }
  private func resolve(_ value: [String: Any], promise: Promise) {
    guard let bytes = try? JSONSerialization.data(withJSONObject: value), let text = String(data: bytes, encoding: .utf8) else {
      promise.resolve(Self.failure("MOBILE_ATTACHMENT_RESPONSE_INVALID")); return
    }
    promise.resolve(text)
  }
  private func handleAttachmentIntent(_ intent: [String: Any], promise: Promise) {
    guard intent["version"] as? Int == 1, let kind = intent["kind"] as? String else {
      promise.resolve(Self.failure("MOBILE_INTENT_INVALID")); return
    }
    let valid = (kind == "attachment.list" && intent.count == 2)
      || (kind == "attachment.pick" && intent.count == 3 && ["file", "image"].contains(intent["source"] as? String ?? ""))
      || (kind == "attachment.remove" && intent.count == 3 && (intent["localId"] as? String)?.count == 36)
    guard valid else { promise.resolve(Self.failure("MOBILE_INTENT_INVALID")); return }
    queue.async {
      do {
        let scope = try self.accountScope()
        if kind == "attachment.list" { self.resolve(try self.attachmentOwner(scope).list(), promise: promise) }
        else if kind == "attachment.remove", let id = intent["localId"] as? String {
          self.resolve(try self.attachmentOwner(scope).remove(id), promise: promise)
        } else {
          DispatchQueue.main.async {
            guard self.attachmentPicker == nil else { promise.resolve(Self.failure("MOBILE_ATTACHMENT_PICKER_BUSY")); return }
            self.attachmentPicker = NativeAttachmentPicker(importer: { [weak self] url, image, name in
              guard let self else { throw NativeFailure("MOBILE_ATTACHMENT_CANCELLED") }
              return try self.queue.sync {
                guard try self.accountScope() == scope else { throw NativeFailure("MOBILE_ACCOUNT_CHANGED") }
                let files = try self.attachmentOwner(scope)
                let picked = try files.importPicked(url, image: image, suggestedName: name)
                guard try self.accountScope() == scope else {
                  if let id = picked["localId"] as? String { _ = try? files.remove(id) }
                  throw NativeFailure("MOBILE_ACCOUNT_CHANGED")
                }
                return picked
              }
            }, completion: { result in
              self.attachmentPicker = nil
              switch result {
              case .success(let value): self.resolve(value, promise: promise)
              case .failure(let error): promise.resolve(Self.failure((error as? NativeFailure)?.code ?? "MOBILE_ATTACHMENT_UNAVAILABLE"))
              }
            })
            self.attachmentPicker?.present(image: intent["source"] as? String == "image")
          }
        }
      } catch let error as NativeFailure { promise.resolve(Self.failure(error.code)) }
      catch { promise.resolve(Self.failure("MOBILE_ATTACHMENT_UNAVAILABLE")) }
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
