import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var serverProcess: Process?
    private var activePort: Int = 3000
    private var currentLanUrl: String = "http://localhost:3000"
    private var logFileHandle: FileHandle?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()
        setupWindow()
        NSApp.activate(ignoringOtherApps: true)
        bootServerAndLoad()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window?.makeKeyAndOrderFront(nil)
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServer()
    }

    // MARK: - Window & WebView Setup

    private func setupWindow() {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width = min(1440, max(1100, screenFrame.width * 0.9))
        let height = min(920, max(720, screenFrame.height * 0.9))
        let originX = screenFrame.midX - width / 2
        let originY = screenFrame.midY - height / 2

        window = NSWindow(
            contentRect: NSRect(x: originX, y: originY, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Lucky Bingo"
        window.titlebarAppearsTransparent = false
        window.minSize = NSSize(width: 960, height: 640)
        window.backgroundColor = NSColor(calibratedRed: 0.980, green: 0.969, blue: 0.949, alpha: 1.0)
        window.collectionBehavior = [.fullScreenPrimary]

        let config = WKWebViewConfiguration()
        // Allow instant natural-voice ball calling without browser autoplay friction
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: window.contentView?.bounds ?? .zero, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        // Clean warm splash screen while the local server boots (< 1s)
        let splashHTML = """
        <!doctype html>
        <html>
        <head>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0; height: 100vh; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 16px;
            background: #FAF7F2; color: #3D3A35;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          }
          .badge {
            width: 72px; height: 72px; border-radius: 22px; background: #EA580C;
            color: #fff; font-size: 40px; font-weight: 900; font-style: italic;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 12px 30px rgba(234,88,12,0.28);
          }
          .title { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; }
          .sub { font-size: 13px; font-weight: 600; color: #6B655D; }
        </style>
        </head>
        <body>
          <div class="badge">L</div>
          <div class="title">Lucky Bingo</div>
          <div class="sub">Starting local Wi-Fi hall server...</div>
        </body>
        </html>
        """
        webView.loadHTMLString(splashHTML, baseURL: nil)

        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
    }

    private func setupMenuBar() {
        let mainMenu = NSMenu()

        // App Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Lucky Bingo", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide Lucky Bingo", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Lucky Bingo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        // Edit Menu (enables Cmd+C/V/X/A inside WKWebView inputs)
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        // View Menu
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        let copyLanItem = NSMenuItem(title: "Copy Wi-Fi Join Address", action: #selector(copyLanUrl), keyEquivalent: "C")
        copyLanItem.keyEquivalentModifierMask = [.command, .shift]
        viewMenu.addItem(copyLanItem)
        viewMenu.addItem(NSMenuItem.separator())
        let fullScreenItem = NSMenuItem(title: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreenItem.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fullScreenItem)
        viewMenuItem.submenu = viewMenu

        // Window Menu
        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func showAbout() {
        let alert = NSAlert()
        alert.messageText = "Lucky Bingo — Host Edition"
        alert.informativeText = """
        100% Offline Wi-Fi LAN Bingo Hall Host App with 20 Natural Neural Voices.

        Players on the same Wi-Fi connect at:
        \(currentLanUrl)
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Copy Wi-Fi URL")
        let response = alert.runModal()
        if response == .alertSecondButtonReturn {
            copyLanUrl()
        }
    }

    @objc private func reloadPage() {
        webView?.reload()
    }

    @objc private func copyLanUrl() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(currentLanUrl, forType: .string)
    }

    // MARK: - Server Boot & Health

    private func resolveNodeExecutable() -> String? {
        let candidates = [
            "/opt/homebrew/opt/node@20/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/opt/local/bin/node"
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        // Fallback: ask login zsh for node path (e.g., nvm / fnm / volta)
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/zsh")
        task.arguments = ["-lc", "command -v node"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        if (try? task.run()) != nil {
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let out = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !out.isEmpty,
               FileManager.default.isExecutableFile(atPath: out) {
                return out
            }
        }
        return nil
    }

    private func checkHealth(port: Int, completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/health") else {
            completion(false)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 0.5
        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data = data,
                  let body = String(data: data, encoding: .utf8),
                  body.contains("\"ok\"") else {
                completion(false)
                return
            }
            completion(true)
        }.resume()
    }

    private func isPortOccupied(_ port: Int) -> Bool {
        let sock = socket(AF_INET, SOCK_STREAM, 0)
        if sock < 0 { return false }
        defer { close(sock) }
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result == 0
    }

    private func pickAvailablePort() -> Int {
        for p in 3000...3015 {
            if !isPortOccupied(p) {
                return p
            }
        }
        return 3000
    }

    private func bootServerAndLoad() {
        // If Lucky Bingo is already running on port 3000, connect directly
        checkHealth(port: 3000) { [weak self] alreadyHealthy in
            guard let self = self else { return }
            if alreadyHealthy {
                self.activePort = 3000
                DispatchQueue.main.async {
                    self.loadAppUI()
                }
                return
            }

            let port = self.pickAvailablePort()
            self.activePort = port

            DispatchQueue.global(qos: .userInitiated).async {
                self.spawnBundledServer(port: port)
            }
        }
    }

    private func spawnBundledServer(port: Int) {
        guard let nodePath = resolveNodeExecutable() else {
            DispatchQueue.main.async {
                self.showFatalError(
                    title: "Node.js Not Found",
                    message: "Lucky Bingo needs Node.js installed on this Mac to host local Wi-Fi rooms.\nInstall Node.js from nodejs.org or via Homebrew (brew install node@20)."
                )
            }
            return
        }

        guard let resourcesURL = Bundle.main.resourceURL else {
            DispatchQueue.main.async {
                self.showFatalError(title: "Corrupted App Bundle", message: "Could not locate app Resources directory.")
            }
            return
        }

        let appDir = resourcesURL.appendingPathComponent("app")
        let serverScript = appDir.appendingPathComponent("server.cjs")
        let distDir = appDir.appendingPathComponent("dist")
        let voiceCacheDir = appDir.appendingPathComponent("voice-cache")

        guard FileManager.default.fileExists(atPath: serverScript.path) else {
            DispatchQueue.main.async {
                self.showFatalError(title: "Missing Server Bundle", message: "Could not find \(serverScript.path).")
            }
            return
        }

        // Persistent user data dir for custom patterns & Hall of Fame
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dataDir = appSupport.appendingPathComponent("Lucky Bingo")
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)

        // Log file in ~/Library/Logs/LuckyBingo.log
        let logsDir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first!.appendingPathComponent("Logs")
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
        let logFileURL = logsDir.appendingPathComponent("LuckyBingo.log")
        if !FileManager.default.fileExists(atPath: logFileURL.path) {
            FileManager.default.createFile(atPath: logFileURL.path, contents: nil)
        }
        let logHandle = try? FileHandle(forWritingTo: logFileURL)
        logHandle?.truncateFile(atOffset: 0)
        self.logFileHandle = logHandle

        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [serverScript.path]
        process.currentDirectoryURL = appDir

        var env = ProcessInfo.processInfo.environment
        env["NODE_ENV"] = "production"
        env["PORT"] = "\(port)"
        env["BINGO_DIST_DIR"] = distDir.path
        env["BINGO_VOICE_CACHE_DIR"] = voiceCacheDir.path
        env["BINGO_DATA_DIR"] = dataDir.path
        process.environment = env

        if let handle = logHandle {
            process.standardOutput = handle
            process.standardError = handle
        }

        do {
            try process.run()
            self.serverProcess = process
        } catch {
            DispatchQueue.main.async {
                self.showFatalError(title: "Failed to Start Server", message: error.localizedDescription)
            }
            return
        }

        waitForServerReady(port: port, attemptsRemaining: 80)
    }

    private func waitForServerReady(port: Int, attemptsRemaining: Int) {
        if attemptsRemaining <= 0 {
            DispatchQueue.main.async {
                self.showFatalError(
                    title: "Server Timed Out",
                    message: "The local Lucky Bingo server did not respond on port \(port). Check ~/Library/Logs/LuckyBingo.log for details."
                )
            }
            return
        }

        if let proc = serverProcess, !proc.isRunning {
            DispatchQueue.main.async {
                self.showFatalError(
                    title: "Server Exited Unexpectedly",
                    message: "Lucky Bingo server exited with status \(proc.terminationStatus). Check ~/Library/Logs/LuckyBingo.log."
                )
            }
            return
        }

        checkHealth(port: port) { [weak self] healthy in
            guard let self = self else { return }
            if healthy {
                DispatchQueue.main.async {
                    self.loadAppUI()
                }
            } else {
                DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 0.15) {
                    self.waitForServerReady(port: port, attemptsRemaining: attemptsRemaining - 1)
                }
            }
        }
    }

    private func loadAppUI() {
        let localURL = URL(string: "http://localhost:\(activePort)/")!
        webView.load(URLRequest(url: localURL))
        fetchLanBanner()
    }

    private func fetchLanBanner() {
        guard let url = URL(string: "http://127.0.0.1:\(activePort)/api/lan-info") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let lanUrl = json["lanUrl"] as? String else { return }
            self.currentLanUrl = lanUrl
            let displayHost = lanUrl.replacingOccurrences(of: "http://", with: "")
            DispatchQueue.main.async {
                self.window.title = "Lucky Bingo — Wi-Fi: \(displayHost)"
            }
        }.resume()
    }

    private func stopServer() {
        guard let process = serverProcess else { return }
        if process.isRunning {
            process.terminate()
            let deadline = Date().addingTimeInterval(1.5)
            while process.isRunning && Date() < deadline {
                Thread.sleep(forTimeInterval: 0.05)
            }
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
        }
        serverProcess = nil
        try? logFileHandle?.close()
        logFileHandle = nil
    }

    private func showFatalError(title: String, message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApp.terminate(nil)
    }

    // MARK: - WKUIDelegate (keep everything in-window, never spawn blank popups)

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Lucky Bingo"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Lucky Bingo"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
