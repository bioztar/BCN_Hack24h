import AVFoundation

/// Plays roast audio (TTS mp3 from /api/audio/:hash.mp3) and records the dictated pitch.
@MainActor
final class AudioService {
    private var player: AVAudioPlayer?
    private var recorder: AVAudioRecorder?
    private let recordURL = FileManager.default.temporaryDirectory.appending(path: "pitch.m4a")

    /// One 20 ms slice of the mouth: `open` 0...1 (vowel energy), `wide` ~1 (>1 spread for sibilants).
    struct MouthFrame { var open: Float; var wide: Float }
    nonisolated static let mouthRate: Double = 50   // frames per second
    /// Officer voices play this much faster (AVAudioPlayer time-stretch keeps the pitch). Every pacing that waits
    /// on a clip's length divides by it. `currentTime` stays in media time, so the mouth track needs no change.
    nonisolated static let voiceRate: Float = 1.3

    /// Offline-analyses a decoded clip into a mouth track: RMS envelope -> opening, high zero-crossing rate
    /// (fricatives/sibilants, > ~2.5 kHz) -> narrower opening and a wider, thinner mouth. Empty if undecodable.
    nonisolated static func mouthTrack(from data: Data) -> [MouthFrame] {
        let ext = data.prefix(4) == Data("RIFF".utf8) ? "wav" : "mp3"   // CoreAudio wants a matching extension
        let tmp = FileManager.default.temporaryDirectory.appending(path: "lip-\(UUID().uuidString).\(ext)")
        defer { try? FileManager.default.removeItem(at: tmp) }
        guard (try? data.write(to: tmp)) != nil,
              let file = try? AVAudioFile(forReading: tmp),
              let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
              (try? file.read(into: buf)) != nil,
              let ch = buf.floatChannelData?[0] else { return [] }
        let sr = file.processingFormat.sampleRate
        let hop = max(Int(sr / mouthRate), 1)
        let n = Int(buf.frameLength) / hop
        guard n > 2 else { return [] }

        var rms = [Float](repeating: 0, count: n)
        var freq = [Float](repeating: 0, count: n)
        for f in 0..<n {
            var sum: Float = 0
            var crossings = 0
            let base = f * hop
            for i in 0..<hop {
                let s = ch[base + i]
                sum += s * s
                if i > 0, (s >= 0) != (ch[base + i - 1] >= 0) { crossings += 1 }
            }
            rms[f] = (sum / Float(hop)).squareRoot()
            freq[f] = Float(crossings) / 2 / Float(hop) * Float(sr)   // dominant frequency estimate, Hz
        }
        let ref = max(rms.sorted()[Int(Float(n) * 0.9)], 1e-4)
        var frames = (0..<n).map { f -> MouthFrame in
            let env = min(rms[f] / ref, 1.2)
            let sib = min(max((freq[f] - 2500) / 3500, 0), 1) * (env > 0.08 ? 1 : 0)
            let open = min(pow(env, 0.8) * (1 - 0.65 * sib), 1)
            return MouthFrame(open: open, wide: 1 + 0.35 * sib - 0.15 * env)
        }
        // 3-tap smoothing so single noisy frames don't flutter the jaw.
        let raw = frames
        for f in 1..<(n - 1) {
            frames[f].open = (raw[f - 1].open + 2 * raw[f].open + raw[f + 1].open) / 4
            frames[f].wide = (raw[f - 1].wide + 2 * raw[f].wide + raw[f + 1].wide) / 4
        }
        return frames
    }

    /// Downloads and plays `url`, driving `onMouth(open, wide)` ~30x/s from the clip's analysed mouth track
    /// (with a little look-ahead), so the bust lip-syncs. Falls back to live metering if the clip can't be analysed.
    /// Returns false if the clip could not be fetched/decoded (caller falls back to a timed pause).
    @discardableResult
    func play(_ url: URL, maxSeconds: Double = 30, onMouth: (Double, Double) -> Void) async -> Bool {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let reason = activatePlayback() { lastProblem = reason; return false }
            let track = Self.mouthTrack(from: data)
            let p = try AVAudioPlayer(data: data)
            p.isMeteringEnabled = true
            p.volume = 1
            p.enableRate = true   // before prepareToPlay
            p.prepareToPlay()
            p.rate = Self.voiceRate
            player = p
            guard p.play() else { lastProblem = "player refused to start"; return false }
            lastProblem = AVAudioSession.sharedInstance().outputVolume < 0.05 ? "Phone volume is at zero — the Commission is speaking." : nil
            let deadline = Date().addingTimeInterval(maxSeconds / Double(Self.voiceRate))
            while p.isPlaying, Date() < deadline, !Task.isCancelled {
                if track.isEmpty {
                    p.updateMeters()
                    onMouth(Double(min(max((p.averagePower(forChannel: 0) + 45) / 45, 0), 1)), 1)   // -45 dB...0 dB
                } else {
                    let i = min(Int((p.currentTime + 0.03) * Self.mouthRate), track.count - 1)
                    onMouth(Double(track[i].open), Double(track[i].wide))
                }
                try? await Task.sleep(for: .milliseconds(33))
            }
            p.stop()
            onMouth(0, 1)
            return true
        } catch {
            NSLog("audio: playback failed: \(error)")
            lastProblem = "audio: \(error.localizedDescription)"
            return false
        }
    }

    func stopPlayback() { player?.stop(); player = nil }

    // MARK: dictation

    func requestMic() async -> Bool { await AVAudioApplication.requestRecordPermission() }

    func startRecording() throws {
        stopPlayback()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)
        let r = try AVAudioRecorder(url: recordURL, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
        ])
        guard r.record() else { throw NSError(domain: "audio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not start recording"]) }
        recorder = r
    }

    /// Stops and returns the recorded m4a bytes (nil if nothing recorded).
    func stopRecording() -> Data? {
        recorder?.stop()
        recorder = nil
        // Leave record mode for good: the next thing this session does is play the roast.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        return try? Data(contentsOf: recordURL)
    }

    /// Playback session: `.playback` ignores the silent switch and routes to the speaker. Falls back to
    /// `.playAndRecord` + speaker if the switch out of record mode is refused. Returns a reason on failure.
    private func activatePlayback() -> String? {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playback, mode: .default, options: [])
            try s.setActive(true)
            try? s.overrideOutputAudioPort(.speaker)
            return nil
        } catch {
            NSLog("audio: .playback refused (\(error)); trying playAndRecord")
        }
        do {
            try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try s.setActive(true)
            return nil
        } catch {
            return "audio session: \(error.localizedDescription)"
        }
    }

    /// Why the last `play` failed (nil = it did not), plus a volume-at-zero hint; the model surfaces it once.
    private(set) var lastProblem: String?
}
