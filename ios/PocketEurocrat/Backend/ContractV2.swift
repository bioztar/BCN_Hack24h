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
    var photoUrl: String?
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

struct LeaderboardDetail: Decodable {
    let entry: LeaderboardEntry
    let findings: [Notice.Finding]
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
