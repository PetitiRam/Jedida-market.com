// Merge into ios/App/App/AppDelegate.swift after `npx cap add ios`.
// Adds: (1) validation of universal links / custom-scheme deep links before
// they reach the WebView, (2) an offline.html swap on load failure driven by
// NWPathMonitor, restoring the production URL automatically on reconnect.

import Network

private let officialHost = "jedidamarketplace.com"
private let monitor = NWPathMonitor()

func application(_ app: UIApplication, open url: URL,
                  options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    let isOfficialHost = url.host == officialHost || (url.host?.hasSuffix(".\(officialHost)") ?? false)
    let isOfficialScheme = url.scheme == "jedidamarketplace"
    guard isOfficialHost || isOfficialScheme else {
        // Unrecognized host/scheme — never forward to the WebView.
        return false
    }
    return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
}

func application(_ application: UIApplication,
                  continue userActivity: NSUserActivity,
                  restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
       let url = userActivity.webpageURL,
       url.host != officialHost && !(url.host?.hasSuffix(".\(officialHost)") ?? false) {
        return false // reject universal links pointing anywhere else
    }
    return ApplicationDelegateProxy.shared.application(application, continue: userActivity,
                                                        restorationHandler: restorationHandler)
}

// Call this from applicationDidFinishLaunching to start watching connectivity.
// `bridgeViewController.webView` is the CAPWebView instance Capacitor creates.
func startConnectivityMonitor(reloadingInto webView: WKWebView) {
    monitor.pathUpdateHandler = { path in
        DispatchQueue.main.async {
            if path.status == .satisfied {
                webView.load(URLRequest(url: URL(string: "https://jedidamarketplace.com")!))
            } else {
                if let offlinePath = Bundle.main.path(forResource: "offline", ofType: "html", inDirectory: "public") {
                    webView.loadFileURL(URL(fileURLWithPath: offlinePath), allowingReadAccessTo: URL(fileURLWithPath: offlinePath))
                }
            }
        }
    }
    monitor.start(queue: DispatchQueue(label: "jedida.network.monitor"))
}
