import Foundation

/// A credential-free system-network preflight. Authentication remains in Rust.
final class NativeAccountLogin: NSObject, URLSessionTaskDelegate {
  private var network: URLSession?
  private var completion: ((String) -> Void)?
  private var epoch = 0

  func prepare(origin: String, completion: @escaping (String) -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard self.completion == nil else { completion(Self.failure("ACCOUNT_LOGIN_BUSY")); return }
    guard let base = URL(string: origin), base.scheme == "https", base.user == nil, base.password == nil,
      let url = URL(string: "/api/agent-network/instance", relativeTo: base) else {
      completion(Self.failure("ACCOUNT_NETWORK_UNAVAILABLE")); return
    }
    epoch += 1
    let captured = epoch
    self.completion = completion
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 30
    config.waitsForConnectivity = true
    let network = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    self.network = network
    var probe = URLRequest(url: url); probe.httpMethod = "HEAD"
    network.dataTask(with: probe) { [weak self] _, _, error in
      let code = (error as NSError?)?.code
      DispatchQueue.main.async {
        guard let self, captured == self.epoch, self.completion != nil else { return }
        if let code {
          NSLog("[mobile-login] network-preflight code=%ld", code)
          self.finish(Self.failure(code == NSURLErrorDataNotAllowed ? "ACCOUNT_NETWORK_ACCESS_DENIED" : "ACCOUNT_NETWORK_UNAVAILABLE"))
        } else { self.finish("{\"kind\":\"network-ready\"}") }
      }
    }.resume()
  }
  func close() { finish(Self.failure("ACCOUNT_LOGIN_INTERRUPTED")) }
  private func finish(_ response: String) {
    epoch += 1
    let callback = completion; completion = nil
    network?.invalidateAndCancel(); network = nil
    callback?(response)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  private static func failure(_ code: String) -> String { "{\"kind\":\"error\",\"code\":\"\(code)\"}" }
}
