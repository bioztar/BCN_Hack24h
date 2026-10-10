import SwiftUI
import UIKit
import WebKit

/// "Play" entry: a prominent button that opens the Eurocrat Arcade full screen.
struct PlayArcadeButton: View {
    var title = "Play the Eurocrat Arcade"
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            Label(title, systemImage: "gamecontroller.fill")
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity).padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(ArcadeView.euYellow)
        .foregroundStyle(.black)
        .controlSize(.large)
        .fullScreenCover(isPresented: $open) { ArcadeView() }
    }
}

/// Full-screen Arcade: WKWebView on `<RoastBaseURL>/game/?embed=1`. Scores posted to the `eurocrat` message handler
/// buzz (success, or error for a negative score) and offer a native share. Unreachable / HTTP error → the
/// "pending approval by the Council" screen with Retry.
struct ArcadeView: View {
    static let euBlue = Color(red: 0, green: 0.2, blue: 0.6)          // #003399
    static let euYellow = Color(red: 1, green: 0.84, blue: 0.09)      // #ffd617

    var base: URL = BackendFactory.baseURL()
    /// false when hosted in the Play tab (nothing to dismiss to).
    var closable = true
    @State private var failed = false
    @State private var loading = true
    @State private var attempt = 0
    @State private var score: ArcadeScore?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Self.euBlue.ignoresSafeArea()

            if failed {
                pending
            } else {
                ArcadeWebView(url: Arcade.url(base: base), base: base,
                              onLoaded: { loading = false },
                              onFailed: { loading = false; failed = true },
                              onScore: received,
                              onLeave: { if closable { dismiss() } })
                    .id(attempt)   // Retry = a fresh web view
                if loading { ProgressView().tint(.white).controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity) }
            }

            if closable { closeButton }
        }
        .overlay(alignment: .bottom) { if let score { scoreBanner(score) } }
        .animation(.spring(duration: 0.3), value: score)
    }

    private var closeButton: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark")
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(.black.opacity(0.45), in: Circle())
        }
        .padding(.trailing, 12).padding(.top, 4)
        .accessibilityLabel("Close the Arcade")
    }

    private func received(_ s: ArcadeScore) {
        UINotificationFeedbackGenerator().notificationOccurred(s.score < 0 ? .error : .success)
        score = s
    }

    private func scoreBanner(_ s: ArcadeScore) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(s.gameName).font(.caption.weight(.bold)).foregroundStyle(.secondary)
                Text("\(s.score)" + (s.rank.map { " · \($0)" } ?? "")).font(.headline.monospacedDigit())
            }
            Spacer(minLength: 8)
            ShareLink(item: s.shareText) { Label("Share", systemImage: "square.and.arrow.up") }
                .buttonStyle(.borderedProminent).tint(Self.euBlue)
            Button { score = nil } label: { Image(systemName: "xmark.circle.fill").font(.title2) }
                .foregroundStyle(.secondary)
                .accessibilityLabel("Dismiss score")
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 12).padding(.bottom, 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var pending: some View {
        VStack(spacing: 16) {
            Text("⏳").font(.system(size: 64))
            Text("The game is pending approval by the Council")
                .font(.system(.title2, design: .serif, weight: .bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Self.euYellow)
            Text("Your request to have fun has been forwarded to the competent Directorate-General. Please try again.")
                .font(.callout).multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.85))
            Button {
                failed = false
                loading = true
                attempt += 1
            } label: {
                Label("Retry", systemImage: "arrow.clockwise").fontWeight(.semibold).padding(.horizontal, 12)
            }
            .buttonStyle(.borderedProminent).tint(Self.euYellow).foregroundStyle(.black).controlSize(.large)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The web view itself: inline media, no bounce/zoom, `eurocrat` script message handler, HTTP-error detection.
struct ArcadeWebView: UIViewRepresentable {
    let url: URL
    let base: URL
    var onLoaded: () -> Void
    var onFailed: () -> Void
    var onScore: (ArcadeScore) -> Void
    var onLeave: () -> Void

    static let handlerName = "eurocrat"

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let content = WKUserContentController()
        content.add(WeakMessageHandler(context.coordinator), name: Self.handlerName)
        // Belt and braces against pinch / double-tap zoom even if the page's viewport allows it.
        content.addUserScript(WKUserScript(source: Self.noZoomJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController = content

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .clear
        web.allowsBackForwardNavigationGestures = false
        web.allowsLinkPreview = false
        let scroll = web.scrollView
        scroll.bounces = false
        scroll.alwaysBounceVertical = false
        scroll.alwaysBounceHorizontal = false
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 1
        scroll.pinchGestureRecognizer?.isEnabled = false
        scroll.contentInsetAdjustmentBehavior = .never   // SwiftUI keeps us inside the safe area
        scroll.delegate = context.coordinator

        var req = URLRequest(url: url)
        req.timeoutInterval = 15
        web.load(req)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) { context.coordinator.parent = self }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.stopLoading()
        web.configuration.userContentController.removeScriptMessageHandler(forName: handlerName)
    }

    private static let noZoomJS = """
    (function(){var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}
    m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';})();
    """

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
        var parent: ArcadeWebView
        init(_ parent: ArcadeWebView) { self.parent = parent }

        // MARK: score messages

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == ArcadeWebView.handlerName, let score = ArcadeScore(body: message.body) else { return }
            parent.onScore(score)
        }

        // MARK: navigation

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { return decisionHandler(.cancel) }
            guard action.targetFrame?.isMainFrame ?? true else { return decisionHandler(.allow) }   // iframes: page's business
            if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return decisionHandler(.allow) }
            if Arcade.isArcade(url, base: parent.base) {
                if action.targetFrame == nil {   // target=_blank inside the arcade: keep it here
                    webView.load(URLRequest(url: Arcade.embedded(url) ?? url))
                    return decisionHandler(.cancel)
                }
                if let fixed = Arcade.embedded(url) {   // a link dropped ?embed=1 — keep the site chrome hidden
                    webView.load(URLRequest(url: fixed))
                    return decisionHandler(.cancel)
                }
                return decisionHandler(.allow)
            }
            if url.host == parent.base.host {   // "back to the roast" etc.: the native app is the roast
                parent.onLeave()
                return decisionHandler(.cancel)
            }
            if action.navigationType == .linkActivated || action.targetFrame == nil, ["http", "https", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)   // EUR-Lex, warden.pro7ocol.com/analyze …
            }
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            if response.isForMainFrame, let http = response.response as? HTTPURLResponse, http.statusCode >= 400 {
                decisionHandler(.cancel)
                parent.onFailed()
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { parent.onLoaded() }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if Self.isCancel(error) { return }
            parent.onFailed()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if Self.isCancel(error) { return }
            parent.onFailed()
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

        /// `window.open` from the page: same rules as a target=_blank link.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if Arcade.isArcade(url, base: parent.base) { webView.load(URLRequest(url: Arcade.embedded(url) ?? url)) }
                else if url.host != parent.base.host { UIApplication.shared.open(url) }
            }
            return nil
        }

        /// Our own redirects (`load` + `.cancel`) and policy cancels surface as these; they are not failures.
        private static func isCancel(_ error: Error) -> Bool {
            let e = error as NSError
            if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return true }
            return e.domain == "WebKitErrorDomain" && e.code == 102   // frame load interrupted by policy change
        }

        // MARK: no zoom

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }
    }
}

/// WKUserContentController retains its handlers; this breaks the web view ↔ coordinator cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
