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

    func testEveryOfficerIsInAPair() {
        XCTAssertEqual(Set(Roster.pairs.flatMap(\.officers)), Set(Roster.officers.map(\.id)))
    }
}
