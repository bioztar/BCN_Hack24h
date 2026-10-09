import Foundation

/// Fixture backend: lets the whole app run with no server. Lines are placeholder gags in the
/// spirit of content/gags.yaml (A0's checked bank replaces them once the live API is up).
struct MockBackend: RoastBackend {
    var lineDelay: Duration = .milliseconds(900)

    func personas() async throws -> [Persona] { Roster.officers }
    func pairs() async throws -> [Pair] { Roster.pairs }

    func createCase(_ submission: Submission, officers: [String]) async throws -> CaseTicket {
        CaseTicket(caseId: "mock-\(officers.joined(separator: "+"))", ticket: 4812, officers: officers)
    }

    func reply(caseID: String, text: String) async throws {}
    func transcribe(audio: Data, contentType: String) async throws -> String {
        "We use AI to match dogs with remote jobs. Pre-seed, no revenue, no lawyer."
    }
    func resolve(_ path: String) -> URL? { nil }

    func stream(caseID: String) -> AsyncThrowingStream<RoastEvent, Error> {
        let ids = caseID.dropFirst("mock-".count).split(separator: "+").map(String.init)
        let (a, b) = (ids.first ?? "formblatt", ids.last ?? "annexe")
        let art = Provision(id: "ai-act-6", label: "AI Act Art. 6(3)", title: "Derogation from high-risk", url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj")
        let gdpr = Provision(id: "gdpr-33", label: "GDPR Art. 33", title: "Notification of a personal data breach", url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj")
        let script: [RoastEvent] = [
            .tier(1, name: "Pre-consultation"),
            .line(RoastLine(id: "m1", speaker: a, text: "Is it an AI system? Article 3, point 1. Varying levels of autonomy. Your pitch has one level. It is called 'next slide'.")),
            .line(RoastLine(id: "m2", speaker: b, text: "I have read your pitch. Fortunately for you, I read slowly.", provisions: [art])),
            .tier(2, name: "Committee"),
            .line(RoastLine(id: "m3", speaker: a, text: "You say it is not high-risk. A derogation! You must document it. You have not documented it.", provisions: [art])),
            .line(RoastLine(id: "m4", speaker: b, text: "Breach notification within 72 hours. You have not noticed the breach. This is the breach.", provisions: [gdpr], stamp: "REFUSÉ")),
            .verdict(Notice(
                serial: "L-2026/04812", startup: "DogJobs.ai", officers: [a, b], fineEur: 35_000_000,
                fineBasis: "€35M or 7% of worldwide turnover, whichever is higher — AI Act Art. 99(3)",
                findings: [
                    .init(text: "Undocumented Article 6(3) derogation.", provision: art),
                    .init(text: "No breach-notification process; no breach noticed either.", provision: gdpr),
                ],
                issuedAt: "2026-10-09T20:00:00Z")),
        ]
        return AsyncThrowingStream { cont in
            let task = Task {
                for ev in script {
                    try? await Task.sleep(for: lineDelay)
                    if Task.isCancelled { break }
                    cont.yield(ev)
                }
                cont.finish()
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }
}
