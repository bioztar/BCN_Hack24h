import Foundation

/// One seam between the app and the server. `MockBackend` = fixtures, `LiveBackend` = eurocrat.pro7ocol.com.
protocol RoastBackend {
    func personas() async throws -> [Persona]
    func pairs() async throws -> [Pair]
    /// `applicantId` + `applicantToken` come from `register`; the token authorises attaching the case to that applicant.
    /// `express`: one stream (tiers 1→5, verdict) and one appeal; falls back to staged if the server says no.
    func createCase(_ submission: Submission, officers: [String], applicantId: String?, applicantToken: String?, express: Bool) async throws -> CaseTicket
    /// Express only, once, after the verdict: the next stream is a short tier-5 round and a new verdict.
    func appeal(caseID: String, applicantToken: String?, text: String?) async throws
    func stream(caseID: String) -> AsyncThrowingStream<RoastEvent, Error>
    func reply(caseID: String, text: String) async throws
    /// Raw recorded audio -> transcript.
    func transcribe(audio: Data, contentType: String) async throws -> String
    /// Resolve a server-relative asset/audio path (nil for the mock).
    func resolve(_ path: String) -> URL?

    // v2
    func register(_ input: ApplicantInput) async throws -> QueueTicket
    func betterPlace(applicantId: String, applicantToken: String?, cause: BetterPlaceCause) async throws -> BetterPlaceResult
    func leaderboard(sort: LeaderboardSort, limit: Int) async throws -> [LeaderboardEntry]
    func leaderboardStream() -> AsyncThrowingStream<LeaderboardEntry, Error>
    func leaderboardDetail(caseID: String) async throws -> LeaderboardDetail
}

extension RoastBackend {
    func createCase(_ submission: Submission, officers: [String]) async throws -> CaseTicket {
        try await createCase(submission, officers: officers, applicantId: nil, applicantToken: nil, express: false)
    }

    func createCase(_ submission: Submission, officers: [String], applicantId: String?, applicantToken: String?) async throws -> CaseTicket {
        try await createCase(submission, officers: officers, applicantId: applicantId, applicantToken: applicantToken, express: false)
    }
}

enum BackendFactory {
    /// Info.plist `RoastBackend` = "live" | "mock" (build setting ROAST_BACKEND in project.yml).
    /// Launch arg `-RoastBackend mock|live` overrides it for a one-off run.
    static func make(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> RoastBackend {
        let mode = defaults.string(forKey: "RoastBackend")
            ?? bundle.object(forInfoDictionaryKey: "RoastBackend") as? String
            ?? "mock"
        guard mode == "live" else { return MockBackend() }
        return LiveBackend(base: baseURL(bundle: bundle))
    }

    /// Info.plist `RoastBaseURL` (build setting ROAST_BASE_URL); also where the Arcade is served.
    static func baseURL(bundle: Bundle = .main) -> URL {
        let base = bundle.object(forInfoDictionaryKey: "RoastBaseURL") as? String ?? "https://eurocrat.pro7ocol.com"
        return URL(string: base) ?? URL(string: "https://eurocrat.pro7ocol.com")!
    }
}
