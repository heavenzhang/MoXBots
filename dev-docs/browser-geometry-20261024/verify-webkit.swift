// Isolated native WebKit probe. Never opens or controls the daily MoXBots app.
// Input: IIFE bundle of browserConstants.ts, global name BrowserGeometry.
import AppKit
import WebKit

final class GeometryProbe: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let window: NSWindow
    let helper: String
    let levels: [Double] = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
    let sizes: [NSSize] = [NSSize(width: 1440, height: 900), NSSize(width: 980, height: 720)]
    var index = 0
    var results: [[String: Any]] = []

    init(helper: String) {
        self.helper = helper
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: NSRect(origin: .zero, size: NSSize(width: 1440, height: 900)), configuration: config)
        window = NSWindow(contentRect: webView.frame, styleMask: .borderless, backing: .buffered, defer: false)
        super.init()
        window.contentView = webView
        webView.navigationDelegate = self
        // No orderFront, activation, user profile, network, credentials or input.
        webView.loadHTMLString("""
        <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}#panel{position:fixed;left:60%;right:0;top:80px;bottom:0}</style>
        <div id="panel">Synthetic browser panel</div>
        """, baseURL: nil)
    }

    func fail(_ message: String) -> Never {
        fputs(message + "\n", stderr)
        exit(1)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        step()
    }

    func step() {
        if index == levels.count * sizes.count {
            let output: [String: Any] = ["kind": "isolated-native-WKWebView", "passed": true,
                "cases": results, "signedAppAcceptance": false]
            let data = try! JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
            print(String(decoding: data, as: UTF8.self))
            exit(0)
        }
        let size = sizes[index / levels.count]
        let zoom = levels[index % levels.count]
        window.setContentSize(size)
        webView.setFrameSize(size)
        webView.pageZoom = zoom
        // Let WebKit apply native pageZoom and viewport reflow before measuring.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.measure(size: size, zoom: zoom) }
    }

    func measure(size: NSSize, zoom: Double) {
        let js = helper + """
        ;(() => {
          const r = document.getElementById('panel').getBoundingClientRect();
          const css = {x:r.x,y:r.y,width:r.width,height:r.height};
          return {css, corrected:BrowserGeometry.toUsableBrowserBounds(css,\(zoom)),
                  viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
        })()
        """
        webView.evaluateJavaScript(js) { value, error in
            if let error = error { self.fail("WebKit evaluation failed: \(error)") }
            guard var result = value as? [String: Any],
                  let css = result["css"] as? [String: Double],
                  let corrected = result["corrected"] as? [String: Double] else {
                self.fail("Missing measured bounds: \(String(describing: value))")
            }
            // Expected OS layout follows the native container: right 40%, top
            // toolbar 80 CSS px. No browser helper is used for this oracle.
            let expected: [String: Double] = ["x": size.width * 0.6, "y": 80 * zoom,
                "width": size.width * 0.4, "height": size.height - 80 * zoom]
            let error = expected.keys.map { abs(corrected[$0]! - expected[$0]!) }.max()!
            let oldError = expected.keys.map { abs(css[$0]! - expected[$0]!) }.max()!
            // WebKit rounds viewport dimensions to integral CSS px.
            if error > 2 { self.fail("Geometry mismatch zoom=\(zoom): \(result), expected \(expected)") }
            if zoom != 1 && oldError < 5 { self.fail("Old defect did not reproduce at zoom=\(zoom)") }
            result["nativeSize"] = ["width": size.width, "height": size.height]
            result["zoom"] = zoom
            result["expected"] = expected
            result["maxErrorLogicalPx"] = error
            result["oldMaxErrorLogicalPx"] = oldError
            self.results.append(result)
            self.index += 1
            self.step()
        }
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
guard CommandLine.arguments.count == 2,
      let helper = try? String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8) else {
    fputs("Usage: verify-webkit <browserConstants.iife.js>\n", stderr)
    exit(1)
}
let probe = GeometryProbe(helper: helper)
DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
    fputs("Native WebKit probe timed out\n", stderr)
    exit(1)
}
application.run()
