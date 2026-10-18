import AuthenticationServices
import Foundation
import UIKit

/// Presentation only. The original Rust owner still owns PKCE, polling,
/// cancellation, TLS verification and Keychain persistence.
final class NativeAccountLogin: NSObject, ASWebAuthenticationPresentationContextProviding, URLSessionTaskDelegate {
  typealias Request = (String, @escaping (String) -> Void) -> Void
  private var request: Request?
  private var completion: ((String) -> Void)?
  private var authentication: ASWebAuthenticationSession?
  private var network: URLSession?
  private var timer: Timer?
  private var epoch = 0
  private var inFlight = false
  private var foreground = true
  private var foregroundAction: (() -> Void)?
  private var deadline: TimeInterval = 0
  private var window: UIWindow?

  func begin(origin: String, request: @escaping Request, completion: @escaping (String) -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard self.completion == nil else { completion(Self.failure("ACCOUNT_LOGIN_BUSY")); return }
    guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
      .filter({ $0.activationState == .foregroundActive }).flatMap(\.windows).first(where: \.isKeyWindow),
      let originURL = URL(string: origin), originURL.scheme == "https", originURL.user == nil,
      originURL.password == nil, let url = URL(string: "/api/agent-network/instance", relativeTo: originURL) else {
      completion(Self.failure("ACCOUNT_LOGIN_PRESENTATION_FAILED")); return
    }
    epoch += 1
    let captured = epoch
    self.window = window; self.request = request; self.completion = completion
    // Exercise the system networking path before raw sockets. This gives iOS
    // an opportunity to request per-app network access on a first installation.
    // No credentials, cookies, redirects or response body enter the auth owner.
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil; config.httpShouldSetCookies = false
    config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 30
    config.waitsForConnectivity = true
    let network = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    self.network = network
    var probe = URLRequest(url: url); probe.httpMethod = "HEAD"
    network.dataTask(with: probe) { [weak self] _, _, error in
      let code = (error as NSError?)?.code
      DispatchQueue.main.async {
        guard let self, captured == self.epoch, self.completion != nil else { return }
        self.network?.finishTasksAndInvalidate(); self.network = nil
        if let code {
          // Numeric Foundation error only; never log URLs or error descriptions.
          NSLog("[mobile-login] network-preflight code=%ld", code)
          self.finish(Self.failure(code == NSURLErrorDataNotAllowed ? "ACCOUNT_NETWORK_ACCESS_DENIED" : "ACCOUNT_NETWORK_UNAVAILABLE"))
          return
        }
        self.whenForeground { [weak self] in self?.startAuthorization(captured) }
      }
    }.resume()
  }

  private func whenForeground(_ action: @escaping () -> Void) {
    if foreground { action() } else { foregroundAction = action }
  }

  private func startAuthorization(_ captured: Int) {
    guard let request, captured == epoch, completion != nil else { return }
    request("{\"version\":1,\"kind\":\"account.login.start\"}") { [weak self] response in
          DispatchQueue.main.async {
            guard let self, captured == self.epoch, self.completion != nil else { return }
            if Self.parse(response)?["code"] as? String == "ACCOUNT_LOGIN_PAUSED" {
              self.whenForeground { [weak self] in self?.startAuthorization(captured) }; return
            }
            guard let value = Self.parse(response), value["kind"] as? String == "login",
              let rawURL = value["authorizationUrl"] as? String, let url = URL(string: rawURL),
              url.scheme == "https", url.user == nil, url.password == nil,
              let expires = value["expiresAt"] as? Double else { self.finish(Self.parse(response)?["kind"] as? String == "error" ? response : Self.failure("ACCOUNT_REPLY_INVALID")); return }
            // Rust has already checked this URL against the discovered login issuer.
            self.deadline = expires
            self.whenForeground { [weak self] in
              guard let self, self.completion != nil, captured == self.epoch else { return }
              guard Date().timeIntervalSince1970 < self.deadline else { self.cancelAttempt(expired: true); return }
            let authentication = ASWebAuthenticationSession(url: url, callbackURLScheme: nil) { [weak self] _, _ in
              DispatchQueue.main.async {
                guard let self, captured == self.epoch, self.completion != nil else { return }
                self.cancelAttempt()
              }
            }
            authentication.presentationContextProvider = self
            self.authentication = authentication
            guard authentication.start() else { self.cancelAttempt(presentationFailed: true); return }
            let timer = Timer(timeInterval: 2, repeats: true) { [weak self] _ in self?.poll() }
            self.timer = timer; RunLoop.main.add(timer, forMode: .common)
            self.poll()
            }
          }
        }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window ?? ASPresentationAnchor() }

  func setForeground(_ active: Bool) {
    foreground = active
    if active {
      let action = foregroundAction; foregroundAction = nil; action?(); poll()
    }
  }

  private func poll() {
    guard completion != nil, authentication != nil, foreground, !inFlight, let request else { return }
    if Date().timeIntervalSince1970 >= deadline { cancelAttempt(expired: true); return }
    inFlight = true
    let captured = epoch
    request("{\"version\":1,\"kind\":\"account.login.poll\"}") { [weak self] response in
      DispatchQueue.main.async {
        guard let self, captured == self.epoch, self.completion != nil else { return }
        self.inFlight = false
        guard let value = Self.parse(response) else { self.finish(Self.failure("ACCOUNT_REPLY_INVALID")); return }
        if value["kind"] as? String == "account", value["state"] as? String == "authenticating" { return }
        if value["kind"] as? String == "error" {
          let code = value["code"] as? String ?? "ACCOUNT_REPLY_INVALID"
          if ["OWNED_ACCOUNT_UNAVAILABLE", "ACCOUNT_LOGIN_PAUSED", "MOBILE_REQUEST_TIMEOUT"].contains(code) { return }
          self.cancelAttempt(failureCode: code); return
        }
        // Only the Rust signed-in projection proves completion, after persistence.
        if value["kind"] as? String == "account", value["state"] as? String == "signed-in" { self.finish(response) }
        else { self.cancelAttempt(failureCode: "ACCOUNT_REPLY_INVALID") }
      }
    }
  }

  private func cancelAttempt(presentationFailed: Bool = false, expired: Bool = false, failureCode: String? = nil) {
    guard completion != nil, let request else { return }
    epoch += 1 // stale polls and the programmatic sheet cancellation cannot win
    let captured = epoch
    timer?.invalidate(); timer = nil; foregroundAction = nil
    authentication?.cancel(); authentication = nil
    request("{\"version\":1,\"kind\":\"account.logout\"}") { [weak self] response in
      DispatchQueue.main.async {
        guard let self, captured == self.epoch, self.completion != nil else { return }
        let value = Self.parse(response)
        if value?["kind"] as? String == "account", value?["state"] as? String == "signed-out" {
          self.finish(presentationFailed ? Self.failure("ACCOUNT_LOGIN_PRESENTATION_FAILED") : expired ? Self.failure("OWNED_LOGIN_EXPIRED") : failureCode.map(Self.failure) ?? response)
        } else {
          // The original owner retains the pending proof for an explicit retry.
          self.finish(Self.failure("ACCOUNT_CANCEL_UNCONFIRMED"))
        }
      }
    }
  }

  func close() { finish(Self.failure("ACCOUNT_LOGIN_INTERRUPTED")) }

  private func finish(_ response: String) {
    epoch += 1
    let callback = completion; completion = nil
    timer?.invalidate(); timer = nil
    authentication?.cancel(); authentication = nil
    network?.invalidateAndCancel(); network = nil
    request = nil; window = nil; inFlight = false; foregroundAction = nil
    callback?(response)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }

  private static func parse(_ response: String) -> [String: Any]? {
    (try? JSONSerialization.jsonObject(with: Data(response.utf8))) as? [String: Any]
  }
  private static func failure(_ code: String) -> String { "{\"kind\":\"error\",\"code\":\"\(code)\"}" }
}
