import Foundation

struct LiveBackend: RoastBackend {
    let base: URL
    var session: URLSession = .shared

    struct ServerError: LocalizedError {
        let status: Int
        let message: String
        var errorDescription: String? { status == 429 ? "Slow down — the Commission is busy (429)." : "Server said \(status): \(message)" }
    }

    func personas() async throws -> [Persona] { try await get("api/personas") }
    func pairs() async throws -> [Pair] { try await get("api/pairs") }

    func createCase(_ submission: Submission, officers: [String], applicantId: String?, applicantToken: String?, express: Bool) async throws -> CaseTicket {
        var body: [String: Any] = ["submission": submission.json, "officers": officers]
        if let applicantId { body["applicantId"] = applicantId }
        if let applicantToken { body["applicantToken"] = applicantToken }
        guard express else { return try await send("api/case", json: body, token: applicantToken) }
        do {
            return try await send("api/case", json: body.merging(["mode": "express"]) { $1 }, token: applicantToken)
        } catch let e as ServerError where e.status == 400 {
            return try await send("api/case", json: body, token: applicantToken)   // server runs without EXPRESS_MODE: staged
        }
    }

    func appeal(caseID: String, applicantToken: String?, text: String?) async throws {
        var body: [String: Any] = [:]
        if let text, !text.isEmpty { body["text"] = text }
        if let applicantToken { body["applicantToken"] = applicantToken }
        var req = request("api/case/\(caseID)/appeal", method: "POST", body: try JSONSerialization.data(withJSONObject: body), type: "application/json")
        if let applicantToken { req.setValue(applicantToken, forHTTPHeaderField: "x-applicant-token") }
        _ = try await raw(req)
    }

    // MARK: v2

    func register(_ input: ApplicantInput) async throws -> QueueTicket {
        let body = try JSONEncoder().encode(input)
        return try JSONDecoder().decode(QueueTicket.self, from: try await raw(request("api/applicants", method: "POST", body: body, type: "application/json")))
    }

    func betterPlace(applicantId: String, applicantToken: String?, cause: BetterPlaceCause) async throws -> BetterPlaceResult {
        var body: [String: Any] = ["cause": cause.rawValue]
        if let applicantToken { body["applicantToken"] = applicantToken }
        return try await send("api/applicants/\(applicantId)/better-place", json: body, token: applicantToken)
    }

    func leaderboard(sort: LeaderboardSort, limit: Int) async throws -> [LeaderboardEntry] {
        let page: LeaderboardPage = try await get("api/leaderboard?sort=\(sort.rawValue)&limit=\(limit)")
        return page.entries
    }

    func leaderboardDetail(caseID: String) async throws -> LeaderboardDetail { try await get("api/leaderboard/\(caseID)") }

    func leaderboardStream() -> AsyncThrowingStream<LeaderboardEntry, Error> { sse(path: "api/leaderboard/stream") }

    func reply(caseID: String, text: String) async throws {
        _ = try await raw(request("api/case/\(caseID)/reply", method: "POST", body: JSONSerialization.data(withJSONObject: ["text": text]), type: "application/json"))
    }

    func transcribe(audio: Data, contentType: String) async throws -> String {
        struct Out: Decodable { let text: String }
        let data = try await raw(request("api/stt", method: "POST", body: audio, type: contentType))
        return try JSONDecoder().decode(Out.self, from: data).text
    }

    func resolve(_ path: String) -> URL? { URL(string: path, relativeTo: base)?.absoluteURL }

    func stream(caseID: String) -> AsyncThrowingStream<RoastEvent, Error> { sse(path: "api/case/\(caseID)/stream") }

    /// Server-sent events: every `data:` line is one JSON message decoded as `T` (undecodable ones are skipped).
    private func sse<T: Decodable>(path: String) -> AsyncThrowingStream<T, Error> {
        AsyncThrowingStream { cont in
            let task = Task {
                do {
                    var req = URLRequest(url: base.appending(path: path))
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    req.timeoutInterval = 3600
                    let (bytes, resp) = try await session.bytes(for: req)
                    try Self.check(resp, data: Data())
                    for try await line in bytes.lines where line.hasPrefix("data:") {
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if let ev = try? JSONDecoder().decode(T.self, from: Data(payload.utf8)) { cont.yield(ev) }
                    }
                    cont.finish()
                } catch { cont.finish(throwing: error) }
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: plumbing

    private func request(_ path: String, method: String = "GET", body: Data? = nil, type: String? = nil) -> URLRequest {
        // URL(string:relativeTo:) keeps a "?query" intact (appending(path:) would percent-escape it).
        var req = URLRequest(url: URL(string: path, relativeTo: base)!.absoluteURL)
        req.httpMethod = method
        req.httpBody = body
        if let type { req.setValue(type, forHTTPHeaderField: "Content-Type") }
        return req
    }

    private func raw(_ req: URLRequest) async throws -> Data {
        let (data, resp) = try await session.data(for: req)
        try Self.check(resp, data: data)
        return data
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await raw(request(path)))
    }

    /// `token` also goes out as `x-applicant-token` (the server accepts body or header).
    private func send<T: Decodable>(_ path: String, json: [String: Any], token: String? = nil) async throws -> T {
        let body = try JSONSerialization.data(withJSONObject: json)
        var req = request(path, method: "POST", body: body, type: "application/json")
        if let token { req.setValue(token, forHTTPHeaderField: "x-applicant-token") }
        return try JSONDecoder().decode(T.self, from: try await raw(req))
    }

    private static func check(_ resp: URLResponse, data: Data) throws {
        guard let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "request failed"
        throw ServerError(status: http.statusCode, message: msg)
    }
}
