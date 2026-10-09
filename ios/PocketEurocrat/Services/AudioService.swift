import AVFoundation

/// Plays roast audio (TTS mp3 from /api/audio/:hash.mp3) and records the dictated pitch.
@MainActor
final class AudioService {
    private var player: AVPlayer?
    private var recorder: AVAudioRecorder?
    private let recordURL = FileManager.default.temporaryDirectory.appending(path: "pitch.m4a")

    /// Plays `url` and returns when it ends (or after `maxSeconds`, so a stalled stream can't wedge the queue).
    func play(_ url: URL, maxSeconds: Double = 30) async {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p
        p.play()
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                for await _ in NotificationCenter.default.notifications(named: .AVPlayerItemDidPlayToEndTime, object: item) { return }
            }
            group.addTask { try? await Task.sleep(for: .seconds(maxSeconds)) }
            await group.next()
            group.cancelAll()
        }
        p.pause()
    }

    func stopPlayback() { player?.pause(); player = nil }

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
