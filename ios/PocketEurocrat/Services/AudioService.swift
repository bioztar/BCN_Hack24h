import AVFoundation

/// Plays roast audio (TTS mp3 from /api/audio/:hash.mp3) and records the dictated pitch.
@MainActor
final class AudioService {
    private var player: AVAudioPlayer?
    private var recorder: AVAudioRecorder?
    private let recordURL = FileManager.default.temporaryDirectory.appending(path: "pitch.m4a")

    /// Downloads and plays `url`, reporting a 0...1 voice level (metering) ~30x/s so the bust can "talk".
    /// Returns false if the clip could not be fetched/decoded (caller falls back to a timed pause).
    @discardableResult
    func play(_ url: URL, maxSeconds: Double = 30, onLevel: (Double) -> Void) async -> Bool {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try? AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(data: data)
            p.isMeteringEnabled = true
            player = p
            guard p.play() else { return false }
            let deadline = Date().addingTimeInterval(maxSeconds)
            while p.isPlaying, Date() < deadline, !Task.isCancelled {
                p.updateMeters()
                onLevel(Double(min(max((p.averagePower(forChannel: 0) + 45) / 45, 0), 1)))   // -45 dB...0 dB
                try? await Task.sleep(for: .milliseconds(33))
            }
            p.stop()
            onLevel(0)
            return true
        } catch {
            print("audio: playback failed: \(error)")
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
        return try? Data(contentsOf: recordURL)
    }
}
