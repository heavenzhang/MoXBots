import ExpoModulesCore
import Foundation
import UIKit

public final class MoxBotsRemoteModule: Module {
  private let queue = DispatchQueue(label: "com.moxbots.mobile.remote.owner", qos: .userInitiated)
  private let requestSlots = DispatchSemaphore(value: 8)
  private var connection: NativeConnection?
  private var ownerActive = true // owner queue only
  private let lifecycleLock = NSLock()
  private var destroyed = false
  private var appForeground = true
  private var backgroundObserver: NSObjectProtocol?
  private var uploads: NativeUploadScheduler? // owner queue only
  private var attachmentPicker: NativeAttachmentPicker? // main-thread owned
  private lazy var speech = NativeSpeech { [weak self] event in
    self?.sendEvent("speechChanged", event.projection)
  }

  public func definition() -> ModuleDefinition {
    Name("MoxBotsRemote")
    Events("snapshotChanged", "speechChanged", "attachmentUploadChanged")
    OnCreate { [weak self] in
      self?.backgroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil
      ) { [weak self] _ in
        guard let self else { return }
        self.lifecycleLock.lock(); self.appForeground = false; self.lifecycleLock.unlock()
        DispatchQueue.main.async { [weak self] in self?.speech.cancel() }
        self?.queue.async { [weak self] in
          self?.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_PAUSED")
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
      self.enqueue(promise) {
        do {
          let intent = (try? JSONSerialization.jsonObject(with: Data(input.utf8))) as? [String: Any]
          let kind = intent?["kind"] as? String
          if ["account.login.start", "account.login.poll", "account.logout", "connection.suspend"].contains(kind ?? "") {
            self.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_SCOPE_CHANGED")
          }
          if kind == "session", let intent {
            if let targetId = intent["targetId"] as? String, !targetId.isEmpty { self.uploads?.pauseForTarget(targetId) }
            let request = intent["request"] as? [String: Any]
            if (request?["kind"] as? String)?.localizedCaseInsensitiveContains("cancel") == true {
              self.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_SCOPE_CHANGED")
            }
          }
          let response = try self.ensureConnection().request(input)
          switch kind {
          case "targets.list":
            do {
              let scope = try self.accountScope()
              if let data = response.data(using: .utf8),
                let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let items = value["items"] as? [[String: Any]] {
                self.uploads?.validateTargets(scope: scope, items: items)
              } else { self.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_SCOPE_CHANGED") }
            } catch { self.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_SCOPE_CHANGED") }
          case "account.status":
            do { self.uploads?.pauseUnlessScope(try self.accountScope()) }
            catch { self.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_SCOPE_CHANGED") }
          default: break
          }
          promise.resolve(response)
        } catch let error as NativeFailure { promise.resolve(Self.failure(error.code)) }
        catch { promise.resolve(Self.failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnDestroy { [weak self] in
      guard let self else { return }
      self.lifecycleLock.lock(); self.destroyed = true; self.lifecycleLock.unlock()
      if let observer = self.backgroundObserver { NotificationCenter.default.removeObserver(observer) }
      DispatchQueue.main.async { self.speech.cancel(); self.attachmentPicker?.cancel(); self.attachmentPicker = nil }
      self.queue.async {
        self.ownerActive = false
        self.uploads?.pause("MOBILE_ATTACHMENT_UPLOAD_PAUSED")
        self.connection?.close(); self.connection = nil; self.uploads = nil
      }
    }
  }
  private func enqueue(_ promise: Promise, work: @escaping () -> Void) {
    guard requestSlots.wait(timeout: .now()) == .success else {
      promise.resolve(Self.failure("MOBILE_BUSY")); return
    }
    queue.async {
      defer { self.requestSlots.signal() }
      work()
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
    let isUpload = ["attachment.upload", "attachment.upload.status", "attachment.upload.cancel", "attachment.upload.pause"].contains(kind)
    let localId = intent["localId"] as? String ?? ""
    let targetId = intent["targetId"] as? String ?? ""
    let valid = (kind == "attachment.list" && intent.count == 2)
      || (kind == "attachment.pick" && intent.count == 3 && ["file", "image"].contains(intent["source"] as? String ?? ""))
      || (kind == "attachment.remove" && intent.count == 3 && (intent["localId"] as? String)?.count == 36)
      || (isUpload && intent.count == 4 && UUID(uuidString: localId)?.uuidString.lowercased() == localId
        && targetId.range(of: "^[A-Za-z0-9._:-]{1,256}$", options: .regularExpression) != nil)
    guard valid else { promise.resolve(Self.failure("MOBILE_INTENT_INVALID")); return }
    if isUpload && UIApplication.shared.applicationState != .active {
      promise.resolve(Self.failure("MOBILE_ATTACHMENT_UPLOAD_FOREGROUND_REQUIRED")); return
    }
    if isUpload {
      lifecycleLock.lock(); appForeground = true; lifecycleLock.unlock()
    }
    enqueue(promise) {
      do {
        let scope = try self.accountScope()
        if isUpload {
          let scheduler = try self.uploadScheduler(scope: scope)
          scheduler.pauseUnlessScope(scope)
          let raw = try self.ensureConnection().request("{\"version\":1,\"kind\":\"targets.list\"}")
          guard let data = raw.data(using: .utf8), let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let items = catalog["items"] as? [[String: Any]],
            let value = items.first(where: { $0["targetId"] as? String == targetId }),
            let identityKey = value["identityKey"] as? String, let agentId = value["agentId"] as? String else {
            throw NativeFailure("MOBILE_TARGET_INVALID")
          }
          let target = NativeUploadTarget(targetId: targetId, identityKey: identityKey, agentId: agentId)
          scheduler.validateTargets(scope: scope, items: items)
          scheduler.pauseForTarget(targetId)
          let projection: [String: Any]
          switch kind {
          case "attachment.upload": projection = try scheduler.start(scope: scope, target: target, localId: localId)
          case "attachment.upload.status": projection = try scheduler.status(scope: scope, target: target, localId: localId)
          case "attachment.upload.cancel": projection = try scheduler.cancel(scope: scope, target: target, localId: localId)
          default: projection = try scheduler.pause(scope: scope, target: target, localId: localId)
          }
          self.resolve(projection, promise: promise)
        }
        else if kind == "attachment.list" { self.resolve(try self.attachmentOwner(scope).list(), promise: promise) }
        else if kind == "attachment.remove", let id = intent["localId"] as? String {
          let scheduler = try self.uploadScheduler(scope: scope)
          let active = try scheduler.blocksRemoval(scope: scope, localId: id)
          guard !active else { throw NativeFailure("MOBILE_ATTACHMENT_UPLOAD_ACTIVE") }
          try scheduler.clearRemovedSource(scope: scope, localId: id)
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
  private func uploadScheduler(scope: String) throws -> NativeUploadScheduler {
    if let uploads { return uploads }
    let records = SecureRecords(bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
    let scheduler = NativeUploadScheduler(
      io: .init(
        readRecord: { try records.read(scope: $0, record: $1) },
        writeRecord: { try records.write(scope: $0, record: $1, bytes: $2) },
        removeRecord: { try records.remove(scope: $0, record: $1) },
        source: { scope, localId in
          let owner = try NativeAttachments(scope: scope, bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
          let listed = try owner.list()
          guard let items = listed["items"] as? [[String: Any]],
            let value = items.first(where: { $0["localId"] as? String == localId }),
            let name = value["name"] as? String, let mime = value["mimeType"] as? String,
            let size = value["sizeBytes"] as? Int, let sha = value["sha256"] as? String else { return nil }
          return NativeUploadSource(localId: localId, name: name, mimeType: mime, sizeBytes: size, sha256: sha)
        },
        readChunk: { scope, localId, offset in
          let (metadata, bytes) = try NativeAttachments(scope: scope, bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
            .readChunk(localId, offset: offset)
          guard let name = metadata["name"] as? String, let mime = metadata["mimeType"] as? String,
            let size = metadata["sizeBytes"] as? Int, let sha = metadata["sha256"] as? String else {
            throw NativeFailure("MOBILE_ATTACHMENT_UPLOAD_SOURCE_INVALID")
          }
          return NativeUploadChunk(source: NativeUploadSource(localId: localId, name: name, mimeType: mime,
            sizeBytes: size, sha256: sha), bytes: bytes)
        },
        request: { _, request in
          let raw = try self.ensureConnection().request(String(data: try JSONSerialization.data(withJSONObject: request), encoding: .utf8)!)
          guard let data = raw.data(using: .utf8), let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NativeFailure("MOBILE_ATTACHMENT_UPLOAD_RESPONSE_INVALID")
          }
          return value
        }),
      schedule: { [weak self] next in self?.queue.async(execute: next) },
      allowed: { [weak self] in self?.uploadAllowed() ?? false },
      onChanged: { [weak self] event in
        guard let self, self.uploadAllowed() else { return }
        self.sendEvent("attachmentUploadChanged", event)
      })
    uploads = scheduler
    return scheduler
  }
  private func uploadAllowed() -> Bool {
    lifecycleLock.lock(); defer { lifecycleLock.unlock() }
    return !destroyed && appForeground
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
