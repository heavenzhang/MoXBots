import XCTest
import Foundation
import Security
import CryptoKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/// Actual product owners in an isolated simulator test host; no UI automation.
final class NativeOwnersTests: XCTestCase {
  private var bundle: String!
  private var ownedDirectories: [URL] = []

  override func setUpWithError() throws {
    bundle = "com.moxbots.native-validation." + UUID().uuidString.lowercased()
  }

  override func tearDownWithError() throws {
    // Only this invocation's unique service. Never delete the application's service.
    let status = SecItemDelete([
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: bundle + ".remote.records.v1",
      kSecAttrSynchronizable as String: false,
    ] as CFDictionary)
    XCTAssertTrue(status == errSecSuccess || status == errSecItemNotFound)
    for directory in ownedDirectories {
      do { try FileManager.default.removeItem(at: directory) }
      catch { XCTFail("Owned test directory cleanup failed") }
    }
    ownedDirectories.removeAll()
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
      attributes: [.posixPermissions: 0o700])
    ownedDirectories.append(directory)
    return directory
  }

  private func attachments(_ scope: String) throws -> NativeAttachments {
    let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true)
    let hash = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
    let directory = root.appendingPathComponent("attachment-drafts-v1").appendingPathComponent(hash)
    // Refuse ownership if an unexpected collision already exists.
    XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    guard !FileManager.default.fileExists(atPath: directory.path) else {
      throw NativeFailure("TEST_NAMESPACE_COLLISION")
    }
    // Register before construction so partial initialization is cleaned up too.
    ownedDirectories.append(directory)
    return try NativeAttachments(scope: scope, bundle: bundle)
  }

  private static func projection(_ connection: NativeConnection, _ intent: [String: Any]) throws -> [String: Any] {
    let bytes = try JSONSerialization.data(withJSONObject: intent)
    let value = try connection.request(String(decoding: bytes, as: UTF8.self))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(value.utf8)) as? [String: Any])
  }

  func testKeychainIsolationPersistenceProtectionAndOversizeAtomicity() throws {
    let scope = UUID().uuidString.lowercased(), name = "synthetic-record"
    let records = SecureRecords(bundle: bundle)
    let first = Data("synthetic-".utf8) + Data(UUID().uuidString.utf8)
    try records.write(scope: scope, record: name, bytes: first)
    XCTAssertEqual(try SecureRecords(bundle: bundle).read(scope: scope, record: name), first)
    XCTAssertNil(try records.read(scope: scope + "-other", record: name))
    XCTAssertNil(try records.read(scope: scope, record: name + "-other"))
    let isolated = SecureRecords(bundle: bundle + ".other")
    XCTAssertNil(try isolated.read(scope: scope, record: name))

    let replacement = Data(repeating: 0x42, count: 256 * 1024)
    try records.write(scope: scope, record: name, bytes: replacement)
    XCTAssertThrowsError(try records.write(scope: scope, record: name,
      bytes: Data(repeating: 0x43, count: replacement.count + 1))) {
      XCTAssertEqual(($0 as? NativeFailure)?.code, "MOBILE_RECORD_TOO_LARGE")
    }
    XCTAssertEqual(try records.read(scope: scope, record: name), replacement)
    var attributes: CFTypeRef?
    let status = SecItemCopyMatching([
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: bundle + ".remote.records.v1",
      kSecAttrSynchronizable as String: false,
      kSecReturnAttributes as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ] as CFDictionary, &attributes)
    XCTAssertEqual(status, errSecSuccess)
    let values = try XCTUnwrap(attributes as? [String: Any])
    XCTAssertEqual(values[kSecAttrAccessible as String] as? String,
      kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    XCTAssertEqual(values[kSecAttrSynchronizable as String] as? Bool, false)
    try records.remove(scope: scope, record: name)
    try records.remove(scope: scope, record: name)
    XCTAssertNil(try records.read(scope: scope, record: name))
  }

  func testOriginalSwiftCAbiLoadsAndRejectsUnauthenticatedOperationsOffline() throws {
    let connection = try NativeConnection(origin: "https://" + UUID().uuidString.lowercased() + ".invalid", bundle: bundle)
    defer { connection.close() }
    let account = try Self.projection(connection, ["version": 1, "kind": "account.status"])
    XCTAssertEqual(account["kind"] as? String, "account")
    XCTAssertEqual(account["state"] as? String, "signed-out")
    XCTAssertTrue(account["principalId"] is NSNull)
    for kind in ["notification.status", "notification.open"] {
      var intent: [String: Any] = ["version": 1, "kind": kind]
      if kind == "notification.open" { intent["eventId"] = UUID().uuidString.lowercased() }
      let result = try Self.projection(connection, intent)
      XCTAssertEqual(result["kind"] as? String, "error")
      XCTAssertEqual(result["code"] as? String, "OWNED_LOGIN_REQUIRED")
    }
    XCTAssertThrowsError(try connection.request(String(repeating: "x", count: 64 * 1024 + 1))) {
      XCTAssertEqual(($0 as? NativeFailure)?.code, "MOBILE_INPUT_INVALID")
    }
    connection.close()
    connection.close()
    XCTAssertThrowsError(try connection.request("{}"))
  }

  func testOriginalImageAdmissionChunkBytesScopeAndPersistentIndex() throws {
    let sourceDirectory = try temporaryDirectory()
    let source = sourceDirectory.appendingPathComponent("synthetic.png")
    let context = try XCTUnwrap(CGContext(data: nil, width: 2, height: 2, bitsPerComponent: 8,
      bytesPerRow: 8, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    let image = try XCTUnwrap(context.makeImage())
    let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(source as CFURL,
      UTType.png.identifier as CFString, 1, nil))
    CGImageDestinationAddImage(destination, image, nil)
    XCTAssertTrue(CGImageDestinationFinalize(destination))
    let bytes = try Data(contentsOf: source)
    let scope = UUID().uuidString.lowercased()
    let owner = try attachments(scope)
    let other = try attachments(UUID().uuidString.lowercased())
    let imported = try owner.importPicked(source, image: true)
    let id = try XCTUnwrap(imported["localId"] as? String)
    XCTAssertEqual(imported["mimeType"] as? String, "image/png")
    XCTAssertEqual(imported["sizeBytes"] as? Int, bytes.count)
    XCTAssertEqual(imported["sha256"] as? String,
      SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined())
    XCTAssertEqual(try owner.readChunk(id, offset: 0).1, bytes)
    XCTAssertThrowsError(try other.readChunk(id, offset: 0)) {
      XCTAssertEqual(($0 as? NativeFailure)?.code, "MOBILE_ATTACHMENT_NOT_FOUND")
    }
    let restored = try NativeAttachments(scope: scope, bundle: bundle)
    XCTAssertEqual((try restored.list()["items"] as? [[String: Any]])?.count, 1)
    _ = try restored.remove(id)
    XCTAssertEqual((try owner.list()["items"] as? [[String: Any]])?.count, 0)
    XCTAssertThrowsError(try owner.readChunk(id, offset: 0))
    let file = sourceDirectory.appendingPathComponent("synthetic.bin")
    let fileBytes = Data((0..<(2 * 24 * 1024 + 137)).map { UInt8(truncatingIfNeeded: ($0 * 17) ^ ($0 >> 8)) })
    try fileBytes.write(to: file)
    let fileItem = try owner.importPicked(file, image: false)
    let fileId = try XCTUnwrap(fileItem["localId"] as? String)
    var assembled = Data(), lengths: [Int] = []
    while assembled.count < fileBytes.count {
      let chunk = try owner.readChunk(fileId, offset: UInt64(assembled.count)).1
      guard !chunk.isEmpty else { XCTFail("Nonterminal chunk was empty"); break }
      lengths.append(chunk.count); assembled.append(chunk)
    }
    XCTAssertEqual(lengths, [24 * 1024, 24 * 1024, 137])
    XCTAssertEqual(assembled, fileBytes)
    XCTAssertThrowsError(try owner.readChunk(fileId, offset: UInt64(fileBytes.count)))
    _ = try owner.remove(fileId)
    let invalid = sourceDirectory.appendingPathComponent("invalid.png")
    try Data("not an image".utf8).write(to: invalid)
    XCTAssertThrowsError(try owner.importPicked(invalid, image: true)) {
      XCTAssertEqual(($0 as? NativeFailure)?.code, "MOBILE_ATTACHMENT_IMAGE_INVALID")
    }
    XCTAssertEqual((try owner.list()["items"] as? [[String: Any]])?.count, 0)
  }

  func testExplicitOriginalIosLoginStartsAndCancelsWithoutAuthenticating() async throws {
    guard let origin = ProcessInfo.processInfo.environment["MOXBOTS_LIVE_LOGIN_ORIGIN"] else {
      throw XCTSkip("Explicit real-service opt-in is required")
    }
    // The production Expo owner executes these blocking calls on its serial
    // module queue. Keep TLS/Keychain work off the UI thread in this host too.
    let storageBundle = bundle
    try await withCheckedThrowingContinuation { (completion: CheckedContinuation<Void, Error>) in
      DispatchQueue(label: "com.moxbots.native-validation.live-owner").async {
        let result = Result<Void, Error> {
          XCTAssertFalse(Thread.isMainThread)
          let connection = try NativeConnection(origin: origin, bundle: storageBundle)
          defer {
            // Always attempt the original pending-login cancellation before closing.
            do { _ = try Self.projection(connection, ["version": 1, "kind": "account.logout"]) }
            catch { XCTFail("Original login cleanup failed") }
            connection.close()
          }
          let result = try Self.projection(connection, ["version": 1, "kind": "account.login.start"])
          // Never print or assert the complete secret-bearing projection.
          XCTAssertEqual(result["kind"] as? String, "login", "code=" + (result["code"] as? String ?? "none"))
          let authorization = URL(string: result["authorizationUrl"] as? String ?? "")
          XCTAssertEqual(authorization?.scheme, "https")
          XCTAssertGreaterThan((result["expiresAt"] as? NSNumber)?.doubleValue ?? 0,
            Date().timeIntervalSince1970)
          let cancelled = try Self.projection(connection, ["version": 1, "kind": "account.logout"])
          XCTAssertEqual(cancelled["state"] as? String, "signed-out")
          let final = try Self.projection(connection, ["version": 1, "kind": "account.status"])
          XCTAssertEqual(final["state"] as? String, "signed-out")
        }
        completion.resume(with: result)
      }
    }
  }
}
