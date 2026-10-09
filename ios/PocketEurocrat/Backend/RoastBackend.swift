import Foundation

/// One seam between the app and the server. `MockBackend` = fixtures, `LiveBackend` = eurocrat.pro7ocol.com.
protocol RoastBackend {
    func personas() async throws -> [Persona]
    func pairs() async throws -> [Pair]
    func createCase(_ submission: Submission, officers: [String], applicantId: String?) async throws -> CaseTicket
    func stream(caseID: String) -> AsyncThrowingStream<RoastEvent, Error>
    func reply(caseID: String, text: String) async throws
    /// Raw recorded audio -> transcript.
    func transcribe(audio: Data, contentType: String) async throws -> String
    /// Resolve a server-relative asset/audio path (nil for the mock).
    func resolve(_ path: String) -> URL?

    // v2
    func register(_ input: ApplicantInput) async throws -> QueueTicket
    func betterPlace(applicantId: String, cause: BetterPlaceCause) async throws -> BetterPlaceResult
    func leaderboard(sort: LeaderboardSort, limit: Int) async throws -> [LeaderboardEntry]
    func leaderboardStream() -> AsyncThrowingStream<LeaderboardEntry, Error>
    func leaderboardDetail(caseID: String) async throws -> LeaderboardDetail
}

extension RoastBackend {
    func createCase(_ submission: Submission, officers: [String]) async throws -> CaseTicket {
        try await createCase(submission, officers: officers, applicantId: nil)
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
        let base = bundle.object(forInfoDictionaryKey: "RoastBaseURL") as? String ?? "https://eurocrat.pro7ocol.com"
        return LiveBackend(base: URL(string: base)!)
    }
}
