import ExpoModulesCore
import Foundation
import UIKit

public final class MoxBotsRemoteModule: Module {
  private let queue = DispatchQueue(label: "com.moxbots.mobile.remote.owner", qos: .userInitiated)
  private var connection: NativeConnection?
  private var backgroundObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("MoxBotsRemote")
    Events("snapshotChanged")
    OnCreate { [weak self] in
      self?.backgroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil
      ) { [weak self] _ in
        self?.queue.async { [weak self] in
          _ = try? self?.connection?.request("{\"version\":1,\"kind\":\"connection.suspend\"}")
        }
      }
    }
    AsyncFunction("request") { [weak self] (input: String, promise: Promise) in
      guard let self else { promise.resolve(Self.failure("MOBILE_CONNECTION_UNAVAILABLE")); return }
      self.queue.async {
        do {
          if self.connection == nil {
            // Build-owned origin only; never accept arbitrary config or credentials from JS.
            let origin = Bundle.main.object(forInfoDictionaryKey: "MoxBotsServiceOrigin") as? String
              ?? "https://140.143.183.232"
            self.connection = try NativeConnection(origin: origin,
              bundle: Bundle.main.bundleIdentifier ?? "com.moxbots.mobile.internal")
          }
          promise.resolve(try self.connection!.request(input))
        } catch let error as NativeFailure { promise.resolve(Self.failure(error.code)) }
        catch { promise.resolve(Self.failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnDestroy { [weak self] in
      guard let self else { return }
      if let observer = self.backgroundObserver { NotificationCenter.default.removeObserver(observer) }
      self.queue.async { self.connection?.close(); self.connection = nil }
    }
  }
  private static func failure(_ code: String) -> String { "{\"kind\":\"error\",\"code\":\"\(code)\"}" }
}
