import Foundation

// Types mirror docs/CONTRACT.md (packages/shared/src/index.ts). Keep field names identical.

struct Persona: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let title: String
    var stills: [String: String]?
    var model3d: String?
    var color: String
}

struct Provision: Codable, Hashable {
    let id: String
    let label: String
    let title: String
    let url: String
}

enum Submission {
    case text(String)
    case dictation(String)
    case repo(String)

    var json: [String: Any] {
        switch self {
        case .text(let t): return ["kind": "text", "text": t]
        case .dictation(let t): return ["kind": "dictation", "text": t]
        case .repo(let url): return ["kind": "repo", "repoUrl": url]
        }
    }

    /// A pasted GitHub URL is a repo pitch; anything else is text (or dictation).
    static func classify(_ input: String, dictated: Bool) -> Submission {
        let t = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: t), url.scheme?.hasPrefix("http") == true, url.host?.hasSuffix("github.com") == true { return .repo(t) }
        return dictated ? .dictation(t) : .text(t)
    }
}

struct Pair: Codable, Hashable {
    let id: String
    let officers: [String]
}

struct CaseTicket: Codable {
    let caseId: String
    let ticket: Int
    let officers: [String]
}

struct RoastLine: Decodable, Equatable {
    let id: String
    let speaker: String
    let text: String
    var provisions: [Provision] = []
    var clip: String?
    var audioUrl: String?
    var stamp: String?

    private enum CodingKeys: String, CodingKey { case id, speaker, text, provisions, clip, audioUrl, stamp }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        speaker = try c.decode(String.self, forKey: .speaker)
        text = try c.decode(String.self, forKey: .text)
        provisions = try c.decodeIfPresent([Provision].self, forKey: .provisions) ?? []
        clip = try c.decodeIfPresent(String.self, forKey: .clip)
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        stamp = try c.decodeIfPresent(String.self, forKey: .stamp)
    }

    init(id: String, speaker: String, text: String, provisions: [Provision] = [], stamp: String? = nil) {
        self.id = id; self.speaker = speaker; self.text = text
        self.provisions = provisions; self.stamp = stamp
    }
}

struct Notice: Codable, Equatable {
    struct Finding: Codable, Equatable {
        let text: String
        let provision: Provision
    }
    let serial: String
    let startup: String
    let officers: [String]
    let fineEur: Double
    let fineBasis: String
    let findings: [Finding]
    let issuedAt: String

    // v2 (NoticeV2) — all optional so a v1 server still decodes.
    var applicantId: String? = nil
    var startupName: String? = nil
    var founderName: String? = nil
    var totalEur: Double? = nil
    var totalJailMonths: Int? = nil
    var meltdown: Bool? = nil
    var tldr: [TLDR]? = nil
    var recommendations: [Recommendation]? = nil
    var reportUrl: String? = nil
    var badgeUrl: String? = nil
    var meanwhile: Meanwhile? = nil

    struct TLDR: Codable, Equatable { let law: String; let oneLine: String }
    struct Recommendation: Codable, Equatable { let text: String; var provision: Provision? = nil }
}

/// SSE payload of GET /api/case/:id/stream. Unknown `type`s decode to `.unknown` so a newer server never kills the stream.
enum RoastEvent: Decodable, Equatable {
    case officers([Persona], ticket: Int)
    case tier(Int, name: String)
    case line(RoastLine)
    case verdict(Notice)
    case audio(lineID: String, url: String)   // late TTS for an already-sent line
    case fine(Fine)                           // v2: one per cited provision; drives the meter
    case meltdown(totalEur: Double, totalJailMonths: Int)
    case analyzing(stage: String, progress: Double)
    case meanwhile(Meanwhile)                 // v2: live counter tick (~5 s) + final value right before `verdict`
    case awaiting(String)
    case error(String)
    case unknown

    private enum Keys: String, CodingKey {
        case type, officers, ticket, tier, name, notice, prompt, message, id, audioUrl, totalEur, totalJailMonths, stage, progress, meanwhile
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decodeIfPresent(String.self, forKey: .type) ?? "" {
        case "officers": self = .officers(try c.decode([Persona].self, forKey: .officers), ticket: try c.decode(Int.self, forKey: .ticket))
        case "tier": self = .tier(try c.decode(Int.self, forKey: .tier), name: try c.decode(String.self, forKey: .name))
        case "line": self = .line(try RoastLine(from: decoder))
        case "verdict": self = .verdict(try c.decode(Notice.self, forKey: .notice))
        case "fine": self = .fine(try Fine(from: decoder))
        case "meltdown":
            self = .meltdown(totalEur: try c.decode(Double.self, forKey: .totalEur),
                             totalJailMonths: try c.decode(Int.self, forKey: .totalJailMonths))
        case "analyzing":
            self = .analyzing(stage: try c.decode(String.self, forKey: .stage), progress: try c.decode(Double.self, forKey: .progress))
        case "meanwhile": self = .meanwhile(try c.decode(Meanwhile.self, forKey: .meanwhile))
        case "audio": self = .audio(lineID: try c.decode(String.self, forKey: .id), url: try c.decode(String.self, forKey: .audioUrl))
        case "awaiting": self = .awaiting(try c.decode(String.self, forKey: .prompt))
        case "error": self = .error(try c.decode(String.self, forKey: .message))
        default: self = .unknown
        }
    }
}
