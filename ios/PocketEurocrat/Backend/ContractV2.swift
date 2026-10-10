import Foundation

// v2 — applicant flow, fines meter, leaderboard. Mirrors docs/CONTRACT.md "v2" / packages/shared "v2".

let meltdownEur: Double = 1_000_000_000      // MELTDOWN_EUR
let meltdownJailMonths = 1_200               // MELTDOWN_JAIL_MONTHS

struct ApplicantInput: Encodable {
    var startupName: String
    var founderName: String
    var oneLiner: String?
    var photo: String?          // data URL, image/jpeg ≤ 400 KB after downscale to 512 px
}

struct QueueTicket: Decodable, Equatable {
    let applicantId: String
    /// Secret (CONTRACT v2 amendment, 2026-10-10): returned only here; authorises POST /api/case + better-place.
    /// Kept in memory for the session only. Optional so a pre-amendment server still registers.
    var applicantToken: String? = nil
    let ticket: Int
    let position: Int
    let etaText: String
    let countdownSec: Double
}

enum BetterPlaceCause: String, CaseIterable, Codable, Identifiable {
    case climate, lgbtq, refugees, homeless
    case ukraine
    case rareDiseases = "rare-diseases"
    case genderEquality = "gender-equality"
    case animalWelfare = "animal-welfare"
    case accessibility
    case aiSafety = "ai-safety"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .climate: "Climate"
        case .lgbtq: "LGBTQ+"
        case .refugees: "Refugees"
        case .homeless: "Homelessness"
        case .ukraine: "Ukraine"
        case .rareDiseases: "Rare diseases"
        case .genderEquality: "Gender equality"
        case .animalWelfare: "Animal welfare"
        case .accessibility: "Accessibility"
        case .aiSafety: "AI safety"
        }
    }

    /// One-line subtext shown on the cause tile (same copy as the PWA).
    var desc: String {
        switch self {
        case .climate: "Jump the queue for the planet"
        case .aiSafety: "Claim your AI is aligned"
        case .refugees: "Say you help displaced people"
        case .ukraine: "Invoke solidarity, skip the line"
        case .lgbtq: "Tick the inclusion box"
        case .genderEquality: "Mention your female co-founder"
        case .homeless: "Pivot to 'social impact'"
        case .rareDiseases: "Add a medical use case, fast"
        case .animalWelfare: "Rescue a dog in your pitch deck"
        case .accessibility: "Add one alt-text, cut the queue"
        }
    }

    var emoji: String {
        switch self {
        case .climate: "🌍"
        case .lgbtq: "🏳️‍🌈"
        case .refugees: "🤝"
        case .homeless: "🏠"
        case .ukraine: "🇺🇦"
        case .rareDiseases: "🧬"
        case .genderEquality: "⚖️"
        case .animalWelfare: "🐾"
        case .accessibility: "♿️"
        case .aiSafety: "🛡️"
        }
    }
}

struct BetterPlaceResult: Decodable, Equatable {
    let position: Int
    let skipped: Int
    let cause: BetterPlaceCause
    let quip: String
}

struct Fine: Decodable, Equatable {
    let id: String
    let provision: Provision
    let amountEur: Double
    let jailMonths: Int
    let totalEur: Double
    let totalJailMonths: Int
    let caption: String
}

struct LeaderboardEntry: Codable, Identifiable, Equatable {
    let caseId: String
    let startupName: String
    var founderName: String?
    var oneLiner: String?
    var photoUrl: String?       // server-provided /api/photos/:photoId.jpg — never derived from applicantId
    let totalEur: Double
    let totalJailMonths: Int
    let meltdown: Bool
    let topLaws: [String]
    let issuedAt: String

    var id: String { caseId }
}

struct LeaderboardPage: Decodable {
    let entries: [LeaderboardEntry]
    let next: String?
}

/// GET /api/leaderboard/:caseId → `{ entry, findings }` (CONTRACT v2 amendment).
struct LeaderboardDetail: Decodable {
    let entry: LeaderboardEntry
    let findings: [Notice.Finding]
}

/// CONTRACT v2 "Meanwhile": "while you were being processed" — the global race, scaled to how long this case took.
struct Meanwhile: Codable, Equatable {
    struct Models: Codable, Equatable { let models: Int; var note: String? = nil }
    struct Regulations: Codable, Equatable { let regulations: Int; let forms: Int; var note: String? = nil }

    let elapsedSec: Double
    let china: Models
    let us: Models
    let eu: Regulations

    /// "4 min 12 s" / "45 s"
    var elapsedText: String {
        let t = max(0, Int(elapsedSec))
        return t >= 60 ? "\(t / 60) min \(t % 60) s" : "\(t) s"
    }

    /// The verdict-card paragraph (markdown bold on the three actors), same copy as CONTRACT / the server's closing line.
    var paragraph: String {
        let cn = china.models == 1 ? "1 new AI model" : "\(china.models) new AI models"
        let usModels = us.models == 1 ? "1" : "\(us.models)"
        return "While you were being processed (\(elapsedText)): **China** built \(cn)\(Self.dash(china.note)). "
            + "**The US** built \(usModels)\(us.note.map { " " + $0 } ?? ""). "
            + "**Europe** adopted \(eu.regulations) new regulations and \(eu.forms) forms you now have to fill in to start your startup\(Self.dash(eu.note))."
    }

    private static func dash(_ note: String?) -> String {
        guard let note, !note.isEmpty else { return "" }
        return " — " + note
    }

    /// Client-side stand-in while no server value exists yet (the queue: there is no case stream before the pitch).
    /// Same rates as packages/server/src/meanwhile.ts with the jitter fixed per key; the server's numbers replace it
    /// as soon as a `meanwhile` event arrives.
    static func estimate(key: String, elapsedSec: Double) -> Meanwhile {
        let t = Double(max(0, Int(elapsedSec)))
        var h: UInt32 = 2_166_136_261                         // FNV-1a → stable jitter in 0.8…1.25
        for b in key.utf8 { h = (h ^ UInt32(b)) &* 16_777_619 }
        let jitter = 0.8 + 0.45 * Double(h % 1000) / 1000
        let slot = Int(h % 97) + Int(t) / 20
        let us = Int((t / 75) * jitter)
        return Meanwhile(
            elapsedSec: t,
            china: Models(models: Int(1 + (t / 18) * jitter), note: chinaNotes[slot % chinaNotes.count]),
            us: Models(models: us, note: "and raised $\(5 + us * 12) bn"),
            eu: Regulations(regulations: Int(2 + (t / 9) * jitter), forms: Int(5 + t * 1.7 * jitter),
                            note: euNotes[(slot + 2) % euNotes.count]))
    }

    private static let chinaNotes = [
        "one of them achieved superintelligence",
        "one of them is already AI-Act compliant, out of spite",
        "one of them filed your patent, in your name, in Shenzhen",
        "all open-weights, all trained on our public consultations",
        "the smallest one now runs your former competitor",
    ]
    private static let euNotes = [
        "you need all of them to open a bank account",
        "each requires the previous one, in triplicate",
        "the forms come with a form to request the forms",
        "one of them regulates the other twenty-six",
        "none of them are available in English yet",
    ]
}

enum LeaderboardSort: String, CaseIterable, Identifiable {
    case fines, jail, recent
    var id: String { rawValue }
    var label: String { self == .fines ? "Fines" : self == .jail ? "Jail" : "Recent" }
}

enum Money {
    /// "€1.2bn", "€35M", "€480k" — compact, for the meter and the board.
    static func short(_ eur: Double) -> String {
        switch eur {
        case 1_000_000_000...: String(format: "€%.2fbn", eur / 1_000_000_000)
        case 1_000_000...: String(format: "€%.1fM", eur / 1_000_000)
        case 1_000...: String(format: "€%.0fk", eur / 1_000)
        default: String(format: "€%.0f", eur)
        }
    }

    /// 38 -> "3y 2m", 1200 -> "100y"
    static func jail(_ months: Int) -> String {
        let y = months / 12, m = months % 12
        if y == 0 { return "\(m) mo" }
        return m == 0 ? "\(y) y" : "\(y) y \(m) mo"
    }
}
