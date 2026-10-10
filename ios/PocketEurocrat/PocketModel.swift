import Foundation
import Observation

/// App state + orchestration: motion -> scene, shake -> stamp, idle -> sleep, pitch -> roast stream.
@MainActor
@Observable
final class PocketModel {
    enum Phase: Equatable { case idle, listening, roasting, awaiting(String) }

    static let sleepAfter: TimeInterval = 8

    var officers: [Persona] = Roster.officers
    var pairs: [Pair] = Roster.pairs
    var pairID = Roster.pairs[0].id
    var phase: Phase = .idle
    var isAsleep = false
    var stamp: String?
    var subtitle: RoastLine?
    var tierName: String?
    var notice: Notice?
    var errorMessage: String?

    // v2 roast mini-game: running totals from `fine` events, meltdown, repo-analysis progress.
    var totalEur: Double = 0
    var totalJailMonths = 0
    var lastFine: Fine?
    var meltedDown = false
    var analyzing: (stage: String, progress: Double)?
    /// v2 "Meanwhile" counters: latest server tick (applied as it arrives, not queued behind the lines).
    var meanwhile: Meanwhile?
    /// Set by the flow once the founder registered; sent with the case so the verdict lands on the leaderboard.
    @ObservationIgnored var applicantId: String?
    /// Secret from registration (memory only, never persisted); authorises attaching the case to the applicant.
    @ObservationIgnored var applicantToken: String?

    let puppet: DummyScene = {
        let s = DummyScene(size: CGSize(width: 390, height: 700))
        s.scaleMode = .resizeFill
        return s
    }()
    var smug = false
    @ObservationIgnored let backend: RoastBackend
    @ObservationIgnored private let motion = MotionService()
    @ObservationIgnored private let haptics = HapticsService()
    @ObservationIgnored private let audio = AudioService()
    @ObservationIgnored private var lastActivity = Date()
    @ObservationIgnored private var caseID: String?
    @ObservationIgnored private var lateAudio: [String: String] = [:]
    @ObservationIgnored private var started = false
    @ObservationIgnored private var stampTask: Task<Void, Never>?
    @ObservationIgnored private var stampBy: String?

    var pair: Pair { pairs.first { $0.id == pairID } ?? Roster.pairs[0] }
    /// The two officers of the selected pair, in on-screen order (left, right).
    var duo: [Persona] { pair.officers.compactMap { id in officers.first { $0.id == id } } }
    var motionAvailable: Bool { motion.isAvailable }

    init(backend: RoastBackend = BackendFactory.make()) {
        self.backend = backend
    }

    func start() {
        guard !started else { return }
        started = true
        puppet.setDuo(duo)
        puppet.onImpact = { [weak self] strength in
            DispatchQueue.main.async { self?.haptics.bump(strength: strength); self?.wake() }
        }
        motion.onGravity = { [weak self] x, y in
            guard let self else { return }
            let moved = abs(x - lastGravity.x) + abs(y - lastGravity.y) > 0.03
            lastGravity = (x, y)
            puppet.setGravity(x: x, y: y)
            if moved { wake() }
        }
        motion.onShake = { [weak self] in self?.shake() }
        motion.start()
        Task { await loadRoster() }
        Task { await idleLoop() }
    }

    @ObservationIgnored private var lastGravity: (x: Double, y: Double) = (0, -1)

    func select(pair id: String) {
        pairID = id
        puppet.setDuo(duo)
        wake()
    }

    func wake() {
        lastActivity = Date()
        if isAsleep { isAsleep = false; refreshExpression() }
    }

    /// Face priority: asleep > stamping > smug > neutral (the scene itself overrides with "appalled" while toppled).
    private func refreshExpression() {
        puppet.setExpression(isAsleep ? .asleep : smug ? .smug : .neutral)
        if stamp != nil, !isAsleep { puppet.setExpression(.stamping, for: stampBy) }   // stampBy nil = both
    }

    // MARK: shake -> stamp

    func shake() {
        wake()
        puppet.shake()
        showStamp("REFUSÉ", by: nil)
    }

    /// `by`: the officer holding the stamp (a roast line's speaker); nil = both (shake).
    private func showStamp(_ text: String, by: String?) {
        haptics.stamp()
        stamp = text
        stampBy = by
        refreshExpression()
        stampTask?.cancel()
        stampTask = Task {
            try? await Task.sleep(for: .milliseconds(1400))
            if !Task.isCancelled { stamp = nil; refreshExpression() }
        }
    }

    private func showSmug() {
        smug = true
        refreshExpression()
        Task {
            try? await Task.sleep(for: .seconds(5))
            smug = false
            refreshExpression()
        }
    }

    /// No audio clip: fake a speaking level for `seconds` so the bust still talks.
    private func talkFor(_ seconds: Double, speaker: String) async {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end, !Task.isCancelled {
            puppet.setMouth(open: .random(in: 0.1...0.9), wide: .random(in: 0.9...1.2), speaker: speaker)
            try? await Task.sleep(for: .milliseconds(110))
        }
        puppet.setMouth(open: 0, wide: 1, speaker: speaker)
    }

    private func idleLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            if !isAsleep, phase == .idle, Date().timeIntervalSince(lastActivity) > Self.sleepAfter {
                isAsleep = true
                refreshExpression()
            }
        }
    }

    private func loadRoster() async {
        // Live roster/pairs win when reachable; only officers we have cut-outs for are used.
        if let live = try? await backend.personas() {
            let paired = Roster.officers.compactMap { local in live.first { $0.id == local.id } }
            if paired.count == Roster.officers.count { officers = paired }
        }
        if let live = try? await backend.pairs(), !live.isEmpty,
           live.allSatisfy({ $0.officers.count == 2 && $0.officers.allSatisfy { id in Roster.officers.contains { $0.id == id } } }) {
            pairs = live
            if !live.contains(where: { $0.id == pairID }) { pairID = live[0].id }
        }
        puppet.setDuo(duo)
    }

    // MARK: dictation

    func beginDictation() async {
        wake()
        guard phase == .idle || phase.isAwaiting else { return }
        guard await audio.requestMic() else { errorMessage = "Microphone access is off — type your pitch instead."; return }
        do {
            try audio.startRecording()
            phase = .listening
        } catch {
            errorMessage = "Could not record: \(error.localizedDescription)"
        }
    }

    func endDictation() async {
        guard phase == .listening else { return }
        phase = .idle
        guard let data = audio.stopRecording(), data.count > 2_000 else { errorMessage = "Hold the button while you pitch."; return }
        do {
            let text = try await backend.transcribe(audio: data, contentType: "audio/mp4")
            await submit(text, dictated: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: roast

    func submit(_ text: String, dictated: Bool = false) async {
        let pitch = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pitch.isEmpty, phase == .idle || phase.isAwaiting else { return }
        wake()
        errorMessage = nil
        do {
            let id: String
            if case .awaiting = phase, let existing = caseID {
                try await backend.reply(caseID: existing, text: pitch)
                id = existing
            } else {
                resetCase()
                id = try await backend.createCase(Submission.classify(pitch, dictated: dictated),
                                                  officers: pair.officers, applicantId: applicantId,
                                                  applicantToken: applicantToken).caseId
                caseID = id
            }
            phase = .roasting
            try await consume(backend.stream(caseID: id))
            if phase == .roasting { phase = .idle }
        } catch {
            errorMessage = error.localizedDescription
            phase = .idle
        }
    }

    /// Events are played strictly in order by one consumer, while the network reader keeps filing late
    /// `audio` events (TTS that finished after its line was sent) so a line can pick its clip up on arrival.
    private func consume(_ stream: AsyncThrowingStream<RoastEvent, Error>) async throws {
        lateAudio = [:]
        let (queue, push) = AsyncStream.makeStream(of: RoastEvent.self)
        let player = Task { for await event in queue { await handle(event) } }
        do {
            for try await event in stream {
                switch event {
                case .audio(let id, let url): lateAudio[id] = url
                case .meanwhile(let m): meanwhile = m
                default: push.yield(event)
                }
            }
        } catch {
            push.finish()
            await player.value
            throw error
        }
        push.finish()
        await player.value
        puppet.setSpeaker(nil)
    }

    private func audioPath(for line: RoastLine) async -> String? {
        if let p = line.audioUrl { return p }
        for _ in 0..<25 {   // up to ~2.5 s for the late clip
            if let p = lateAudio[line.id] { return p }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return lateAudio[line.id]
    }

    private func handle(_ event: RoastEvent) async {
        switch event {
        case .tier(_, let name): tierName = name
        case .line(let line):
            subtitle = line
            puppet.setSpeaker(line.speaker)
            if let s = line.stamp { showStamp(s, by: line.speaker) }
            var played = false
            if let path = await audioPath(for: line), let url = backend.resolve(path) {
                played = await audio.play(url) { [puppet] open, wide in puppet.setMouth(open: open, wide: wide, speaker: line.speaker) }
            }
            if !played { await talkFor(min(max(Double(line.text.count) * 0.045, 1.8), 6), speaker: line.speaker) }
        case .verdict(let n): notice = n; phase = .idle; caseID = nil; showSmug()
        case .analyzing(let stage, let progress):
            analyzing = (stage, progress)
            puppet.setExpression(.appalled)   // officers hold their heads while the repo is read
        case .fine(let fine):
            if analyzing != nil { analyzing = nil; refreshExpression() }
            totalEur = fine.totalEur
            totalJailMonths = fine.totalJailMonths
            lastFine = fine
            haptics.fineTick(strength: Float(min(max(fine.amountEur / 50_000_000, 0.25), 1)))
        case .meltdown(let eur, let jail):
            totalEur = eur
            totalJailMonths = jail
            meltedDown = true
            puppet.ignite()
            haptics.rumble(seconds: 3)
            try? await Task.sleep(for: .seconds(5))   // let them burn before the verdict card covers the screen
        case .awaiting(let prompt): phase = .awaiting(prompt)
        case .error(let message): errorMessage = message; phase = .idle
        case .meanwhile(let m): meanwhile = m
        case .officers, .audio, .unknown: break
        }
    }

    func dismissVerdict() { notice = nil; subtitle = nil; tierName = nil }

    /// Fresh meter, fires out, nobody's face smoking — before each new case.
    private func resetCase() {
        totalEur = 0
        totalJailMonths = 0
        lastFine = nil
        meltedDown = false
        analyzing = nil
        meanwhile = nil
        notice = nil
        puppet.extinguish()
    }

    /// Back to a clean slate for the next applicant (flow calls this on "Apply again").
    func newApplication() {
        resetCase()
        caseID = nil
        subtitle = nil
        tierName = nil
        applicantId = nil
        applicantToken = nil
        phase = .idle
    }
}

extension PocketModel.Phase {
    var isAwaiting: Bool { if case .awaiting = self { return true } else { return false } }
}
