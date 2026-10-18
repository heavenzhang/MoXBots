import UIKit

// A separate simulator-only app identity for native XCTest, never the daily app.
@main
final class NativeValidationHost: UIResponder, UIApplicationDelegate {}

final class ValidationSceneDelegate: NSObject, UIWindowSceneDelegate {
  var window: UIWindow?
}
