import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var engine: Process?
    var controlPipe: Pipe?
    var closing = false
    var output = Data()
    var errorOutput = Data()
    var started = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 790), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "FakeIDM"
        window.minSize = NSSize(width: 780, height: 600)
        window.center()
        let configuration = WKWebViewConfiguration()
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        window.contentView = web
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        let process = Process()
        let resources = Bundle.main.resourceURL!
        process.executableURL = resources.appendingPathComponent("node")
        process.arguments = [resources.appendingPathComponent("app/server.mjs").path, "--parent-pipe"]
        controlPipe = Pipe()
        process.standardInput = controlPipe
        process.currentDirectoryURL = resources.appendingPathComponent("app")
        let stdout = Pipe(), stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            if chunk.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.output.append(chunk)
                if !self.started, let newline = self.output.firstIndex(of: 10),
                   let object = try? JSONSerialization.jsonObject(with: self.output.prefix(upTo: newline)) as? [String:String],
                   let address = object["url"], let url = URL(string: address) {
                    self.started = true
                    self.web.load(URLRequest(url: url))
                }
            }
        }
        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async { self?.errorOutput.append(data); if (self?.errorOutput.count ?? 0) > 8000 { self?.errorOutput.removeFirst(4000) } }
        }
        process.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if self.closing { NSApp.reply(toApplicationShouldTerminate: true) }
                else {
                    let detail = String(data: self.errorOutput, encoding: .utf8) ?? ""
                    let message = detail.contains("EADDRINUSE") ? "Cổng 17831 đang được sử dụng. Hãy đóng phiên FakeIDM khác rồi mở lại." : "Bộ tải đã dừng. Tiến độ tải được giữ lại.\n\n" + String(detail.suffix(1400))
                    self.showError(message)
                }
            }
        }
        engine = process
        do { try process.run() } catch { showError("Không khởi động được bộ tải: \(error.localizedDescription)") }
    }
    func buildMenu() {
        let bar = NSMenu()
        let root = NSMenuItem(); let menu = NSMenu(); root.submenu = menu
        menu.addItem(withTitle: "Giới thiệu FakeIDM", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Ẩn FakeIDM", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        menu.addItem(withTitle: "Thoát FakeIDM", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        bar.addItem(root)
        let edit = NSMenuItem(); edit.title = "Sửa"; let editMenu = NSMenu(title: "Sửa"); edit.submenu = editMenu
        for (title, action, key) in [("Hoàn tác","undo:","z"),("Cắt","cut:","x"),("Sao chép","copy:","c"),("Dán","paste:","v"),("Chọn tất cả","selectAll:","a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        bar.addItem(edit)
        let win = NSMenuItem(); win.title = "Cửa sổ"; let winMenu = NSMenu(title: "Cửa sổ"); win.submenu = winMenu
        winMenu.addItem(withTitle: "Thu nhỏ", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        bar.addItem(win); NSApp.windowsMenu = winMenu
        NSApp.mainMenu = bar
    }
    func showError(_ message: String) {
        let alert = NSAlert(); alert.messageText = "FakeIDM"; alert.informativeText = message; alert.addButton(withTitle: "Đóng"); alert.runModal(); NSApp.terminate(nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let process = engine, process.isRunning else { return .terminateNow }
        closing = true; process.terminate()
        return .terminateLater
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == "127.0.0.1" && url.port == 17831 { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard CommandLine.arguments.contains("--smoke-test") else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            webView.evaluateJavaScript("document.querySelector('#connection-status').textContent") { result, error in
                let success = (result as? String) == "Đã kết nối"
                print(success ? "NATIVE_UI_OK" : "NATIVE_UI_FAILED: \(String(describing: result)) \(String(describing: error))")
                NSApp.terminate(nil)
            }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = "FakeIDM"; alert.informativeText = message
        alert.addButton(withTitle: "Đồng ý"); alert.addButton(withTitle: "Hủy")
        alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) }
    }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
