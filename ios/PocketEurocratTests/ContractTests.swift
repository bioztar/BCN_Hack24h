import AVFoundation
import XCTest
@testable import PocketEurocrat

final class ContractTests: XCTestCase {
    func testDecodesContractEvents() throws {
        let json = """
        {"type":"line","id":"l1","speaker":"formblatt","text":"Stamp.","provisions":[{"id":"gdpr-33","label":"GDPR Art. 33","title":"t","url":"u"}],"clip":"stamp","audioUrl":null,"stamp":"REFUSÉ"}
        """
        guard case .line(let line) = try JSONDecoder().decode(RoastEvent.self, from: Data(json.utf8)) else { return XCTFail("not a line") }
        XCTAssertEqual(line.stamp, "REFUSÉ")
        XCTAssertNil(line.audioUrl)
        XCTAssertEqual(line.provisions.first?.id, "gdpr-33")
        XCTAssertEqual(try JSONDecoder().decode(RoastEvent.self, from: Data(#"{"type":"from-the-future"}"#.utf8)), .unknown)
    }

    func testMockStreamEndsInVerdict() async throws {
        let backend = MockBackend(lineDelay: .milliseconds(1))
        let ticket = try await backend.createCase(.text("pitch"), officers: Roster.pair(containing: "grandma-gdpr").officers)
        var last: RoastEvent?
        for try await ev in backend.stream(caseID: ticket.caseId) { last = ev }
        guard case .verdict(let n) = last else { return XCTFail("no verdict") }
        XCTAssertEqual(n.officers, ["grandma-gdpr", "auditor-9000"])
    }

    func testDecodesLateAudioEvent() throws {
        let json = #"{"type":"audio","id":"c-0-2","audioUrl":"/api/audio/abc.mp3"}"#
        XCTAssertEqual(try JSONDecoder().decode(RoastEvent.self, from: Data(json.utf8)), .audio(lineID: "c-0-2", url: "/api/audio/abc.mp3"))
    }

    /// Live end-to-end of the client path: text -> case -> SSE stream -> lines + late audio -> clip decodes.
    /// Skipped when the server is unreachable.
    func testLiveRoundTrip() async throws {
        let live = LiveBackend(base: URL(string: "https://eurocrat.pro7ocol.com")!)
        guard (try? await live.pairs()) != nil else { throw XCTSkip("live API unreachable") }
        let ticket = try await live.createCase(.text("An app that matches dogs with remote jobs."), officers: ["formblatt", "annexe"])
        var lines = 0, audio: String?
        for try await ev in live.stream(caseID: ticket.caseId) {
            switch ev {
            case .line(let l): lines += 1; audio = audio ?? l.audioUrl
            case .audio(_, let url): audio = audio ?? url
            default: break
            }
        }
        XCTAssertGreaterThan(lines, 0)
        let path = try XCTUnwrap(audio, "no audio url arrived")
        let (data, _) = try await URLSession.shared.data(from: try XCTUnwrap(live.resolve(path)))
        XCTAssertNoThrow(try AVAudioPlayer(data: data))
    }

    func testDecodesV2Events() throws {
        let dec = JSONDecoder()
        let fine = #"{"type":"fine","id":"f1","provision":{"id":"gdpr-33","label":"GDPR Art. 33","title":"t","url":"u"},"amountEur":20000000,"jailMonths":36,"totalEur":55000000,"totalJailMonths":36,"caption":"gag"}"#
        guard case .fine(let f) = try dec.decode(RoastEvent.self, from: Data(fine.utf8)) else { return XCTFail("not a fine") }
        XCTAssertEqual(f.totalEur, 55_000_000)
        XCTAssertEqual(f.jailMonths, 36)
        XCTAssertEqual(try dec.decode(RoastEvent.self, from: Data(#"{"type":"meltdown","totalEur":1.2e9,"totalJailMonths":1300}"#.utf8)),
                       .meltdown(totalEur: 1_200_000_000, totalJailMonths: 1300))
        XCTAssertEqual(try dec.decode(RoastEvent.self, from: Data(#"{"type":"analyzing","stage":"Cloning","progress":0.25}"#.utf8)),
                       .analyzing(stage: "Cloning", progress: 0.25))
    }

    /// register → better-place → case with applicant → fines → meltdown → verdict → on the leaderboard (mock).
    func testMockV2Flow() async throws {
        let b = MockBackend(lineDelay: .milliseconds(1))
        let ticket = try await b.register(ApplicantInput(startupName: "TestCo", founderName: "T. Ester", oneLiner: nil, photo: nil))
        XCTAssertGreaterThan(ticket.position, 1_000_000)
        let skip = try await b.betterPlace(applicantId: ticket.applicantId, applicantToken: ticket.applicantToken, cause: .climate)
        XCTAssertEqual(skip.position, 1)
        let c = try await b.createCase(.repo("https://github.com/x/y"), officers: ["de-vries", "the-cookie"],
                                       applicantId: ticket.applicantId, applicantToken: ticket.applicantToken)
        var fines = 0, melted = false, verdict: Notice?, ticks = 0
        for try await ev in b.stream(caseID: c.caseId) {
            switch ev {
            case .fine: fines += 1
            case .meltdown: melted = true
            case .meanwhile: ticks += 1
            case .verdict(let n): verdict = n
            default: break
            }
        }
        XCTAssertGreaterThan(fines, 3)
        XCTAssertTrue(melted)
        XCTAssertEqual(verdict?.startupName, "TestCo")
        XCTAssertEqual(verdict?.meltdown, true)
        XCTAssertGreaterThan(ticks, 0)
        XCTAssertNotNil(verdict?.meanwhile)
        let board = try await b.leaderboard(sort: .fines, limit: 50)
        XCTAssertTrue(board.contains { $0.caseId == c.caseId })
    }

    func testRepoUrlIsClassifiedAsRepo() {
        if case .repo = Submission.classify("https://github.com/bioztar/warden", dictated: false) {} else { XCTFail("url not a repo") }
        if case .text = Submission.classify("an app for dogs", dictated: false) {} else { XCTFail("text not text") }
        XCTAssertEqual(Money.short(1_240_000_000), "€1.24bn")
        XCTAssertEqual(Money.jail(1_200), "100 y")
    }

    func testEveryOfficerIsInAPair() {
        XCTAssertEqual(Set(Roster.pairs.flatMap(\.officers)), Set(Roster.officers.map(\.id)))
    }
    // MARK: v2 — Meanwhile, applicant token, leaderboard detail (fixtures from docs/CONTRACT.md / packages/shared)

    static let meanwhileJSON = #"{"elapsedSec":72,"china":{"models":11,"note":"one of them achieved superintelligence"},"us":{"models":3,"note":"and raised $40 bn"},"eu":{"regulations":27,"forms":412,"note":"you need all of them to open a bank account"}}"#

    func testDecodesMeanwhileEvent() throws {
        let json = #"{"type":"meanwhile","meanwhile":"# + Self.meanwhileJSON + "}"
        guard case .meanwhile(let m) = try JSONDecoder().decode(RoastEvent.self, from: Data(json.utf8)) else { return XCTFail("not meanwhile") }
        XCTAssertEqual(m.elapsedSec, 72)
        XCTAssertEqual(m.china.models, 11)
        XCTAssertEqual(m.us.note, "and raised $40 bn")
        XCTAssertEqual(m.eu.regulations, 27)
        XCTAssertEqual(m.eu.forms, 412)
        XCTAssertFalse(m.paragraph.isEmpty)
    }

    func testNoticeMeanwhileIsOptional() throws {
        let base = #""serial":"DG-1","startup":"X","officers":["de-vries"],"fineEur":1,"fineBasis":"b","findings":[],"issuedAt":"2026-10-10T09:00:00Z""#
        let without = try JSONDecoder().decode(Notice.self, from: Data("{\(base)}".utf8))
        XCTAssertNil(without.meanwhile)
        let with = try JSONDecoder().decode(Notice.self, from: Data("{\(base),\"meanwhile\":\(Self.meanwhileJSON)}".utf8))
        XCTAssertEqual(with.meanwhile?.china.models, 11)
    }

    func testUnknownOrUntypedEventsAreNoOps() throws {
        let dec = JSONDecoder()
        XCTAssertEqual(try dec.decode(RoastEvent.self, from: Data(#"{"type":"confetti","amount":9000}"#.utf8)), .unknown)
        XCTAssertEqual(try dec.decode(RoastEvent.self, from: Data(#"{"hello":"world"}"#.utf8)), .unknown)
    }

    func testQueueTicketCarriesApplicantToken() throws {
        let json = #"{"applicantId":"a1","applicantToken":"tok_abc","ticket":48213,"position":2417906,"etaText":"Estimated decision: Q3 2031","countdownSec":42}"#
        let t = try JSONDecoder().decode(QueueTicket.self, from: Data(json.utf8))
        XCTAssertEqual(t.applicantToken, "tok_abc")
        let old = try JSONDecoder().decode(QueueTicket.self, from: Data(json.replacingOccurrences(of: #""applicantToken":"tok_abc","#, with: "").utf8))
        XCTAssertNil(old.applicantToken)
    }

    func testMockRejectsWrongApplicantToken() async throws {
        let b = MockBackend(lineDelay: .milliseconds(1))
        let ticket = try await b.register(ApplicantInput(startupName: "T", founderName: "F", oneLiner: nil, photo: nil))
        do {
            _ = try await b.betterPlace(applicantId: ticket.applicantId, applicantToken: "nope", cause: .climate)
            XCTFail("accepted a wrong token")
        } catch let e as LiveBackend.ServerError {
            XCTAssertEqual(e.status, 403)
        }
    }

    func testDecodesLeaderboardDetail() throws {
        let json = #"{"entry":{"caseId":"c1","startupName":"48K","founderName":null,"oneLiner":null,"photoUrl":"/api/photos/p9.jpg","totalEur":5.5e7,"totalJailMonths":36,"meltdown":false,"topLaws":["GDPR"],"issuedAt":"2026-10-10T09:00:00Z"},"findings":[{"text":"No DPO.","provision":{"id":"gdpr-37","label":"GDPR Art. 37","title":"t","url":"u"}}]}"#
        let d = try JSONDecoder().decode(LeaderboardDetail.self, from: Data(json.utf8))
        XCTAssertEqual(d.entry.photoUrl, "/api/photos/p9.jpg")
        XCTAssertEqual(d.findings.first?.provision.id, "gdpr-37")
    }

    func testArcadeScoreMessage() {
        let s = ArcadeScore(body: ["type": "score", "game": "whack", "score": NSNumber(value: 1240), "rank": "Head of Unit"] as [String: Any])
        XCTAssertEqual(s?.score, 1240)
        XCTAssertEqual(s?.shareText, "I scored 1240 as Head of Unit in Whack-a-Model — eurocrat.pro7ocol.com")
        XCTAssertNil(ArcadeScore(body: ["type": "ready"] as [String: Any]))
        XCTAssertEqual(Arcade.url(base: URL(string: "https://eurocrat.pro7ocol.com")!).absoluteString, "https://eurocrat.pro7ocol.com/game/?embed=1")
    }
}
