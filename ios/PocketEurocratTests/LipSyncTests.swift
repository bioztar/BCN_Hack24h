import AVFoundation
import XCTest
@testable import PocketEurocrat

final class LipSyncTests: XCTestCase {
    /// 0.4 s silence, 0.4 s of a 200 Hz tone (vowel-like), 0.4 s of a 6 kHz tone (sibilant-like), 16 kHz mono.
    private func wavData() throws -> Data {
        let sr = 16_000.0
        let url = FileManager.default.temporaryDirectory.appending(path: "lipsync-test.wav")
        defer { try? FileManager.default.removeItem(at: url) }
        do {   // scope: the WAV header is only finalised when the AVAudioFile is released
            let file = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: sr, AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
            ])
            let n = Int(sr * 1.2)
            let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(n))!
            buf.frameLength = AVAudioFrameCount(n)
            let ch = buf.floatChannelData![0]
            for i in 0..<n {
                let t = Double(i) / sr
                switch t {
                case ..<0.4: ch[i] = 0
                case ..<0.8: ch[i] = Float(0.5 * sin(2 * .pi * 200 * t))
                default: ch[i] = Float(0.5 * sin(2 * .pi * 6000 * t))
                }
            }
            try file.write(from: buf)
        }
        return try Data(contentsOf: url)
    }

    func testVowelOpensSibilantNarrows() throws {
        let frames = AudioService.mouthTrack(from: try wavData())
        guard frames.count > 50 else { return XCTFail("clip not analysed (\(frames.count) frames)") }
        func avg(_ range: Range<Int>, _ key: KeyPath<AudioService.MouthFrame, Float>) -> Float {
            range.map { frames[$0][keyPath: key] }.reduce(0, +) / Float(range.count)
        }
        // frames are 20 ms: silence 0..<20, vowel 25..<35 (clear of the edges), sibilant 45..<55
        XCTAssertLessThan(avg(2..<18, \.open), 0.1)
        XCTAssertGreaterThan(avg(25..<35, \.open), 0.6)
        XCTAssertLessThan(avg(45..<55, \.open), avg(25..<35, \.open))
        XCTAssertGreaterThan(avg(45..<55, \.wide), avg(25..<35, \.wide))
    }

    func testEveryCutoutHasAMouth() {
        for officer in Roster.officers {
            for e in DummyScene.Expression.allCases {
                XCTAssertNotNil(MouthStore.rect(for: "\(officer.id)-\(e.rawValue)"), "\(officer.id)-\(e.rawValue)")
            }
        }
    }
}
