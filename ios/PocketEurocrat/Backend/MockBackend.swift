import Foundation

/// Fixture backend: runs the whole v2 flow (register → queue → better-place → case with fines/meltdown →
/// verdict → leaderboard) with no server. Pitch flavours: any text containing "meltdown" or a GitHub URL ends
/// in a meltdown; a URL also streams `analyzing` progress first.
struct MockBackend: RoastBackend {
    var lineDelay: Duration = .milliseconds(900)
    /// "Skip to verdict": the fixture stream stops pacing itself (the live server streams as fast as it generates).
    nonisolated(unsafe) static var fastForward = false

    /// Case state shared across struct copies (pitch flavour, applicant, live leaderboard).
    private final class Store: @unchecked Sendable {
        let lock = NSLock()
        var cases: [String: (pitch: Submission, applicantId: String?, officers: [String])] = [:]
        var appealed: Set<String> = []
        var applicants: [String: ApplicantInput] = [:]
        var tokens: [String: String] = [:]
        var board: [LeaderboardEntry] = MockBackend.seedBoard
        var listeners: [UUID: AsyncThrowingStream<LeaderboardEntry, Error>.Continuation] = [:]
    }
    private static let store = Store()

    func personas() async throws -> [Persona] { Roster.officers }
    func pairs() async throws -> [Pair] { Roster.pairs }

    func createCase(_ submission: Submission, officers: [String], applicantId: String?, applicantToken: String?, express: Bool) async throws -> CaseTicket {
        if let applicantId {
            guard Self.store.lock.withLock({ Self.store.tokens[applicantId] }) != nil else {
                throw LiveBackend.ServerError(status: 404, message: "unknown applicant")   // like a wiped server
            }
            try Self.authorise(applicantId, applicantToken)
        }
        let id = "mock-\(officers.joined(separator: "+"))-\(UUID().uuidString.prefix(6))"
        Self.store.lock.withLock { Self.store.cases[id] = (submission, applicantId, officers) }
        return CaseTicket(caseId: id, ticket: 4812, officers: officers, mode: express ? "express" : nil)
    }

    /// One appeal per case; the stream afterwards is a short tier-5 round and a new verdict.
    func appeal(caseID: String, applicantToken: String?, text: String?) async throws {
        try await Task.sleep(for: .milliseconds(300))
        let applicantId = Self.store.lock.withLock { Self.store.cases[caseID]?.applicantId }
        if let applicantId { try Self.authorise(applicantId, applicantToken) }
        let fresh = Self.store.lock.withLock { Self.store.appealed.insert(caseID).inserted }
        if !fresh { throw LiveBackend.ServerError(status: 409, message: "the appeal has been lodged and, naturally, rejected") }
    }

    func reply(caseID: String, text: String) async throws {}
    func transcribe(audio: Data, contentType: String) async throws -> String {
        "We use AI to match dogs with remote jobs. Pre-seed, no revenue, no lawyer."
    }
    func resolve(_ path: String) -> URL? { URL(string: path) }

    // MARK: v2

    func register(_ input: ApplicantInput) async throws -> QueueTicket {
        try await Task.sleep(for: .milliseconds(400))
        let id = "app-\(UUID().uuidString.prefix(8))"
        let token = UUID().uuidString + UUID().uuidString
        Self.store.lock.withLock { Self.store.applicants[id] = input; Self.store.tokens[id] = token }
        return QueueTicket(applicantId: id, applicantToken: token, ticket: Int.random(in: 10_000...99_999), position: 2_417_906,
                           etaText: "Estimated decision: Q3 2031", countdownSec: 35)
    }

    func betterPlace(applicantId: String, applicantToken: String?, cause: BetterPlaceCause) async throws -> BetterPlaceResult {
        try Self.authorise(applicantId, applicantToken)
        try await Task.sleep(for: .milliseconds(500))
        return BetterPlaceResult(position: 1, skipped: 2_417_905, cause: cause,
                                 quip: "\(cause.label)! Noted, filed, and used to skip 2,417,905 less virtuous applicants.")
    }

    func leaderboard(sort: LeaderboardSort, limit: Int) async throws -> [LeaderboardEntry] {
        let all = Self.store.lock.withLock { Self.store.board }
        let sorted: [LeaderboardEntry]
        switch sort {
        case .fines: sorted = all.sorted { $0.totalEur > $1.totalEur }
        case .jail: sorted = all.sorted { $0.totalJailMonths > $1.totalJailMonths }
        case .recent: sorted = all.sorted { $0.issuedAt > $1.issuedAt }
        }
        return Array(sorted.prefix(limit))
    }

    func leaderboardStream() -> AsyncThrowingStream<LeaderboardEntry, Error> {
        AsyncThrowingStream { cont in
            let id = UUID()
            Self.store.lock.withLock { Self.store.listeners[id] = cont }
            cont.onTermination = { _ in _ = Self.store.lock.withLock { Self.store.listeners.removeValue(forKey: id) } }
        }
    }

    /// Same rule as the server: the applicant's token or 403.
    private static func authorise(_ applicantId: String, _ token: String?) throws {
        guard let token, store.lock.withLock({ store.tokens[applicantId] }) == token else {
            throw LiveBackend.ServerError(status: 403, message: "applicant token mismatch")
        }
    }

    func leaderboardDetail(caseID: String) async throws -> LeaderboardDetail {
        guard let entry = Self.store.lock.withLock({ Self.store.board.first { $0.caseId == caseID } }) else {
            throw URLError(.fileDoesNotExist)
        }
        return LeaderboardDetail(entry: entry, findings: Self.findings)
    }

    // MARK: roast

    private static let aiAct = Provision(id: "ai-act-6", label: "AI Act Art. 6(3)", title: "Derogation from high-risk", url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj")
    private static let gdpr = Provision(id: "gdpr-33", label: "GDPR Art. 33", title: "Notification of a personal data breach", url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj")
    private static let nis2 = Provision(id: "nis2-21", label: "NIS2 Art. 21", title: "Cybersecurity risk-management measures", url: "https://eur-lex.europa.eu/eli/dir/2022/2555/oj")
    private static let findings: [Notice.Finding] = [
        .init(text: "Undocumented Article 6(3) derogation.", provision: aiAct),
        .init(text: "No breach-notification process; no breach noticed either.", provision: gdpr),
    ]

    func stream(caseID: String) -> AsyncThrowingStream<RoastEvent, Error> {
        let ids = Self.store.lock.withLock { Self.store.cases[caseID]?.officers } ?? Roster.pairs[0].officers
        let (a, b) = (ids.first ?? "formblatt", ids.last ?? "annexe")
        let state = Self.store.lock.withLock { Self.store.cases[caseID] }
        var isRepo = false, wantsMeltdown = false
        if let sub = state?.pitch {
            switch sub.base {
            case .repo: isRepo = true; wantsMeltdown = true
            case .text(let t), .dictation(let t): wantsMeltdown = t.lowercased().contains("meltdown")
            case .turnover: break
            }
        }
        let applicant = state?.applicantId.flatMap { id in Self.store.lock.withLock { Self.store.applicants[id] } }
        let startup = applicant?.startupName ?? "DogJobs.ai"

        // Fine ladder: (amount, jail months). The big last one crosses the €1bn meltdown threshold when asked.
        let amounts: [(Double, Int)] = [(35_000_000, 0), (7_500_000, 0), (20_000_000, 36), (10_000_000, 0), (15_000_000, 60),
                                        wantsMeltdown ? (1_100_000_000, 1_200) : (42_000_000, 12)]
        var script: [RoastEvent] = []
        if isRepo {
            for (i, stage) in ["Cloning repository…", "Counting LLM SDKs…", "Reading your .env (tracked, naturally)…", "Judging your README…"].enumerated() {
                script.append(.analyzing(stage: stage, progress: Double(i + 1) / 4))
            }
        }
        // Meanwhile: as if the founder had queued ~40 s; one tick per tier, final value right before the verdict.
        let final = Meanwhile.estimate(key: caseID, elapsedSec: 72)
        script.append(.tier(1, name: "Pre-consultation"))
        script.append(.meanwhile(Meanwhile.estimate(key: caseID, elapsedSec: 41)))
        script.append(.line(RoastLine(id: "m1", speaker: a, text: "Is it an AI system? Article 3, point 1. Varying levels of autonomy. Your pitch has one level. It is called 'next slide'.")))
        var total = 0.0, jail = 0
        func fine(_ i: Int, _ p: Provision, _ caption: String) {
            total += amounts[i].0; jail += amounts[i].1
            script.append(.fine(Fine(id: "f\(i)", provision: p, amountEur: amounts[i].0, jailMonths: amounts[i].1,
                                     totalEur: total, totalJailMonths: jail, caption: caption)))
        }
        fine(0, Self.aiAct, "Next slide: not a level of autonomy.")
        script.append(.line(RoastLine(id: "m2", speaker: b, text: "I have read your pitch. Fortunately for you, I read slowly.", provisions: [Self.aiAct])))
        fine(1, Self.gdpr, "The dog did not consent.")
        script.append(.tier(2, name: "Committee"))
        script.append(.meanwhile(Meanwhile.estimate(key: caseID, elapsedSec: 56)))
        script.append(.line(RoastLine(id: "m3", speaker: a, text: "You say it is not high-risk. A derogation! You must document it. You have not documented it.", provisions: [Self.aiAct])))
        fine(2, Self.nis2, "Your incident response plan is a group chat.")
        fine(3, Self.gdpr, "Breach noticed in 2031, estimated.")
        script.append(.line(RoastLine(id: "m4", speaker: b, text: "Breach notification within 72 hours. You have not noticed the breach. This is the breach.", provisions: [Self.gdpr], stamp: "REFUSÉ")))
        fine(4, Self.nis2, "Supply chain: one dog.")
        fine(5, Self.aiAct, wantsMeltdown ? "Cumulative: you have exceeded the European budget." : "Rounding error in your disfavour.")
        if Self.store.lock.withLock({ Self.store.appealed.contains(caseID) }) {
            // Appeal: a short tier-5 round that makes it worse.
            total += 12_000_000
            script = [.tier(5, name: "Appeal — denied"),
                      .line(RoastLine(id: "ap1", speaker: a, text: "We have read your appeal. We read it aloud. It did not improve.", stamp: "REJETÉ")),
                      .fine(Fine(id: "fap", provision: Self.aiAct, amountEur: 12_000_000, jailMonths: 0, totalEur: total,
                                 totalJailMonths: jail, caption: "Costs of the appeal, payable in triplicate.")),
                      .line(RoastLine(id: "ap2", speaker: b, text: "The court of appeal is this room. The room agrees with us."))]
        }
        let melted = total >= meltdownEur || jail >= meltdownJailMonths
        if melted { script.append(.meltdown(totalEur: total, totalJailMonths: jail)) }

        let notice = Notice(
            serial: "L-2026/04812", startup: startup, officers: [a, b], fineEur: total,
            fineBasis: "€35M or 7% of worldwide turnover, whichever is higher — AI Act Art. 99(3)",
            findings: Self.findings, issuedAt: ISO8601DateFormatter().string(from: Date()),
            applicantId: state?.applicantId, startupName: startup, founderName: applicant?.founderName,
            totalEur: total, totalJailMonths: jail, meltdown: melted,
            tldr: [.init(law: "AI Act", oneLine: "High-risk derogation undocumented; transparency duties unmet."),
                   .init(law: "GDPR", oneLine: "No lawful basis for the dog; no breach process.")],
            recommendations: [.init(text: "Document the Article 6(3) derogation before launch.", provision: Self.aiAct),
                              .init(text: "Appoint a DPO. The dog does not qualify.", provision: Self.gdpr)],
            reportUrl: nil, badgeUrl: nil, meanwhile: final,
            turnoverEstimate: .init(eur: 40_000_000, basis: "EU HR-tech TAM €8 bn × 0.5 %"))
        script.append(.meanwhile(final))
        script.append(.verdict(notice))

        let entry = LeaderboardEntry(caseId: caseID, startupName: startup, founderName: applicant?.founderName,
                                     oneLiner: applicant?.oneLiner, photoUrl: nil, totalEur: total, totalJailMonths: jail,
                                     meltdown: melted, topLaws: ["AI Act", "GDPR", "NIS2"], issuedAt: ISO8601DateFormatter().string(from: Date()))
        let delay = lineDelay
        let events = script   // a let copy: `script` is a captured var (the `fine` helper appends to it)
        return AsyncThrowingStream { cont in
            let task = Task {
                for ev in events {
                    if !Self.fastForward { try? await Task.sleep(for: delay) }
                    if Task.isCancelled { break }
                    if case .verdict = ev { Self.publish(entry) }
                    cont.yield(ev)
                }
                cont.finish()
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }

    private static func publish(_ entry: LeaderboardEntry) {
        let listeners: [AsyncThrowingStream<LeaderboardEntry, Error>.Continuation] = store.lock.withLock {
            store.board.removeAll { $0.caseId == entry.caseId }
            store.board.append(entry)
            return Array(store.listeners.values)
        }
        listeners.forEach { $0.yield(entry) }
    }

    private static let seedBoard: [LeaderboardEntry] = {
        func e(_ n: String, _ f: String, _ one: String, _ eur: Double, _ jail: Int, _ melt: Bool, _ laws: [String], _ ago: Int) -> LeaderboardEntry {
            LeaderboardEntry(caseId: "seed-\(n)", startupName: n, founderName: f, oneLiner: one, photoUrl: nil, totalEur: eur,
                             totalJailMonths: jail, meltdown: melt, topLaws: laws,
                             issuedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(Double(-ago * 60))))
        }
        return [
            e("48K", "Pavel K.", "Uber for compliance", 1_240_000_000, 1_200, true, ["AI Act", "GDPR", "DSA"], 5),
            e("LLMeow", "Ines R.", "Cat translation as a service", 410_000_000, 480, false, ["AI Act", "GDPR"], 12),
            e("Brainbnb", "Tom A.", "Airbnb for unused thoughts", 220_000_000, 96, false, ["GDPR", "ePrivacy"], 18),
            e("FinOwl", "Sofia B.", "Crypto for pensioners", 95_000_000, 240, false, ["MiCA", "DORA"], 25),
            e("Stampede", "Luca M.", "Blockchain stamps", 61_000_000, 0, false, ["DORA"], 31),
            e("Gerrit AI", "Gerrit V.", "Pitch coach that also lies", 38_000_000, 36, false, ["AI Act"], 44),
        ]
    }()
}
