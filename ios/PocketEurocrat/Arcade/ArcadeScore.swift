import Foundation

/// `{type:"score", game, score, rank, …}` posted by the Arcade (`?embed=1`) to `window.webkit.messageHandlers.eurocrat`.
/// Parsed leniently from the WKScriptMessage body (a dictionary of NSString/NSNumber); anything else is ignored.
struct ArcadeScore: Equatable {
    let game: String
    let score: Int
    let rank: String?
    /// Whack-a-Model extras: models banned / Mistral stamped by mistake.
    var hits: Int = 0
    var mistralHits: Int = 0

    init(game: String, score: Int, rank: String?) {
        self.game = game; self.score = score; self.rank = rank
    }

    init?(body: Any) {
        guard let dict = body as? [String: Any], dict["type"] as? String == "score" else { return nil }
        guard let score = Self.int(dict["score"]) else { return nil }
        self.score = score
        game = dict["game"] as? String ?? "whack"
        hits = max(0, Self.int(dict["hits"]) ?? 0)
        mistralHits = max(0, Self.int(dict["mistralHits"]) ?? 0)
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

    /// Whack-a-Model alone, embedded (played while a repo is audited).
    static func whackURL(base: URL) -> URL {
        URL(string: "game/whack/?embed=1", relativeTo: base)?.absoluteURL ?? base
    }

    /// "While we audited your repo you banned 12 American/Chinese models — and stamped Mistral ×1. The only one we had."
    static func whackLine(banned: Int, mistral: Int) -> String {
        let base = "While we audited your repo you banned \(banned) American/Chinese model\(banned == 1 ? "" : "s")"
        return mistral > 0 ? "\(base) — and stamped Mistral ×\(mistral). The only one we had." : "\(base)."
    }

    /// The real compliance analyzer, prefilled with the pitch.
    static func wardenURL(pitch: String) -> URL {
        let idea = String(pitch.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1500))
        var c = URLComponents(string: "https://warden.pro7ocol.com/analyze/")!
        if !idea.isEmpty { c.queryItems = [URLQueryItem(name: "idea", value: idea)] }
        return c.url!
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
