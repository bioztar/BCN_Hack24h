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

    func testEveryOfficerIsInAPair() {
        XCTAssertEqual(Set(Roster.pairs.flatMap(\.officers)), Set(Roster.officers.map(\.id)))
    }
}
