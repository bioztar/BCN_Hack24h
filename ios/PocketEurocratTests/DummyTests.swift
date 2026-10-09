import XCTest
@testable import PocketEurocrat

final class DummyTests: XCTestCase {
    private func run(_ s: DummyScene, seconds: Double, from t0: Double) -> Double {
        var t = t0
        while t < t0 + seconds { t += 1.0 / 60; s.step(dt: 1.0 / 60, now: t) }
        return t
    }

    func testToppleThenRecover() {
        let s = DummyScene(size: CGSize(width: 390, height: 700))
        var impacts = 0
        s.onImpact = { _ in impacts += 1 }

        s.setGravity(x: 0.3, y: -0.9)                 // small tilt: leans, stays up
        var t = run(s, seconds: 1, from: 0)
        XCTAssertFalse(s.isDown)

        s.setGravity(x: 0.8, y: -0.5)                 // past threshold: topples
        t = run(s, seconds: 1, from: t)
        XCTAssertTrue(s.isDown)
        XCTAssertEqual(impacts, 1)

        s.setGravity(x: 0, y: -1)                     // phone level: gets back up after the delay
        _ = run(s, seconds: 3, from: t)
        XCTAssertFalse(s.isDown)
    }
}
