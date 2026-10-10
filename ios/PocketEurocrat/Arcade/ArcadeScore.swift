import Foundation

/// `{type:"score", game, score, rank, …}` posted by the Arcade (`?embed=1`) to `window.webkit.messageHandlers.eurocrat`.
/// Parsed leniently from the WKScriptMessage body (a dictionary of NSString/NSNumber); anything else is ignored.
struct ArcadeScore: Equatable {
    let game: String
    let score: Int
    let rank: String?

    init(game: String, score: Int, rank: String?) {
        self.game = game; self.score = score; self.rank = rank
    }

    init?(body: Any) {
        guard let dict = body as? [String: Any], dict["type"] as? String == "score" else { return nil }
        guard let score = Self.int(dict["score"]) else { return nil }
        self.score = score
        game = dict["game"] as? String ?? "whack"
        // A rank title ("Head of Unit") — or a leaderboard position when the game sends a number.
        if let title = dict["rank"] as? String, !title.isEmpty { rank = title }
        else if let pos = Self.int(dict["rank"]) { rank = "#\(pos)" }
        else { rank = dict["title"] as? String }
    }

    var gameName: String {
        switch game {
        case "whack": "Whack-a-Model"
        case "swipe": "Legal or Banned?"
        case "flappy": "Regulatory Flappy"
        case "triplicate": "In Triplicate"
        default: game
        }
    }

    var shareText: String {
        let rankPart = rank.map { " as \($0)" } ?? ""
        return "I scored \(score)\(rankPart) in \(gameName) — eurocrat.pro7ocol.com"
    }

    private static func int(_ v: Any?) -> Int? {
        if let n = v as? Int { return n }
        if let d = v as? Double, d.isFinite { return Int(d.rounded()) }
        if let n = v as? NSNumber { return n.intValue }
        if let s = v as? String { return Int(s) }
        return nil
    }
}

enum Arcade {
    /// `<RoastBaseURL>/game/?embed=1` — the arcade landing in embed mode (no site chrome, posts scores to us).
    static func url(base: URL) -> URL {
        URL(string: "game/?embed=1", relativeTo: base)?.absoluteURL ?? base
    }

    /// The arcade's own paths stay inside the web view; anything else on the site closes it, other hosts open in Safari.
    static let paths = ["/game", "/swipe", "/flappy", "/triplicate", "/api/"]

    static func isArcade(_ url: URL, base: URL) -> Bool {
        guard url.host == base.host else { return false }
        return paths.contains { url.path.hasPrefix($0) }
    }

    /// Same arcade URL with `embed=1` added if a link dropped it (nil when it is already there).
    static func embedded(_ url: URL) -> URL? {
        guard var c = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return nil }
        var items = c.queryItems ?? []
        if items.contains(where: { $0.name == "embed" && $0.value == "1" }) { return nil }
        items.removeAll { $0.name == "embed" }
        items.append(URLQueryItem(name: "embed", value: "1"))
        c.queryItems = items
        return c.url
    }
}
