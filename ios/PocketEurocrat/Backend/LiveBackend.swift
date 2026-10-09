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

    func createCase(_ submission: Submission, officers: [String]) async throws -> CaseTicket {
        try await send("api/case", json: ["submission": submission.json, "officers": officers])
    }

    func reply(caseID: String, text: String) async throws {
        _ = try await raw(request("api/case/\(caseID)/reply", method: "POST", body: JSONSerialization.data(withJSONObject: ["text": text]), type: "application/json"))
    }

    func transcribe(audio: Data, contentType: String) async throws -> String {
        struct Out: Decodable { let text: String }
        let data = try await raw(request("api/stt", method: "POST", body: audio, type: contentType))
        return try JSONDecoder().decode(Out.self, from: data).text
    }

    func resolve(_ path: String) -> URL? { URL(string: path, relativeTo: base)?.absoluteURL }

    func stream(caseID: String) -> AsyncThrowingStream<RoastEvent, Error> {
        AsyncThrowingStream { cont in
            let task = Task {
                do {
                    var req = URLRequest(url: base.appending(path: "api/case/\(caseID)/stream"))
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    req.timeoutInterval = 120
                    let (bytes, resp) = try await session.bytes(for: req)
                    try Self.check(resp, data: Data())
                    for try await line in bytes.lines where line.hasPrefix("data:") {
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if let ev = try? JSONDecoder().decode(RoastEvent.self, from: Data(payload.utf8)) { cont.yield(ev) }
                    }
                    cont.finish()
                } catch { cont.finish(throwing: error) }
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: plumbing

    private func request(_ path: String, method: String = "GET", body: Data? = nil, type: String? = nil) -> URLRequest {
        var req = URLRequest(url: base.appending(path: path))
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

    private func send<T: Decodable>(_ path: String, json: [String: Any]) async throws -> T {
        let body = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(T.self, from: try await raw(request(path, method: "POST", body: body, type: "application/json")))
    }

    private static func check(_ resp: URLResponse, data: Data) throws {
        guard let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "request failed"
        throw ServerError(status: http.statusCode, message: msg)
    }
}
