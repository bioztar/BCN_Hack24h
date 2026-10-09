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

    var json: [String: Any] {
        switch self {
        case .text(let t): return ["kind": "text", "text": t]
        case .dictation(let t): return ["kind": "dictation", "text": t]
        }
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
}

/// SSE payload of GET /api/case/:id/stream. Unknown `type`s decode to `.unknown` so a newer server never kills the stream.
enum RoastEvent: Decodable, Equatable {
    case officers([Persona], ticket: Int)
    case tier(Int, name: String)
    case line(RoastLine)
    case verdict(Notice)
    case awaiting(String)
    case error(String)
    case unknown

    private enum Keys: String, CodingKey { case type, officers, ticket, tier, name, notice, prompt, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "officers": self = .officers(try c.decode([Persona].self, forKey: .officers), ticket: try c.decode(Int.self, forKey: .ticket))
        case "tier": self = .tier(try c.decode(Int.self, forKey: .tier), name: try c.decode(String.self, forKey: .name))
        case "line": self = .line(try RoastLine(from: decoder))
        case "verdict": self = .verdict(try c.decode(Notice.self, forKey: .notice))
        case "awaiting": self = .awaiting(try c.decode(String.self, forKey: .prompt))
        case "error": self = .error(try c.decode(String.self, forKey: .message))
        default: self = .unknown
        }
    }
}
