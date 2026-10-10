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
    /// Whack-a-Model overlay while a GitHub repo is audited; officer lines wait behind it.
    struct Whack: Equatable { var active = false; var auditDone = false; var banned = 0; var mistral = 0; var played = false }
    var whack = Whack()
    /// One appeal per case, after the verdict (express mode).
    var appealUsed = false
    /// The first pitch text / repo URL: prefills the full compliance analyzer from the verdict.
    var lastPitch: String?
    /// Server forgot the applicant (404 on case create): the flow drops the ticket and returns to Register.
    @ObservationIgnored var onStaleApplicant: (() -> Void)?
    @ObservationIgnored private var lastCaseID: String?
    @ObservationIgnored private var audioWarned = false
    /// Set by the flow while the queue screen runs: the case is created, the stream starts when this clears.
    @ObservationIgnored var holdForQueue = false
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

    /// Pitch screen: stop the recording and return the transcript for editing (nil + errorMessage on failure).
    func finishDictation() async -> String? {
        guard phase == .listening else { return nil }
        phase = .idle
        guard let data = audio.stopRecording(), data.count > 2_000 else { errorMessage = "Too short — tap, pitch, tap again."; return nil }
        do {
            return try await backend.transcribe(audio: data, contentType: "audio/mp4")
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    /// `submission` (pitch screen) overrides the auto-classification of `text`; ignored for follow-up replies.
    func submit(_ text: String, dictated: Bool = false, as submission: Submission? = nil) async {
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
                let sub = submission ?? Submission.classify(pitch, dictated: dictated)
                lastPitch = pitch
                if case .repo = sub.base { puppet.setExpression(.outrage) }   // outraged while the repo is read
                id = try await backend.createCase(sub, officers: pair.officers, applicantId: applicantId,
                                                  applicantToken: applicantToken, express: true).caseId
                caseID = id
                // The case exists; the roast starts when the queue (Whack-a-Model) ends.
                while holdForQueue, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(100)) }
            }
            phase = .roasting
            try await consume(backend.stream(caseID: id))
            if phase == .roasting { phase = .idle }
        } catch {
            whack.active = false
            phase = .idle
            if Task.isCancelled || error is CancellationError { return }   // abandoned via "New startup"
            if applicantId != nil, (error as? LiveBackend.ServerError)?.status == 404 {
                // Server forgot this applicant (data wipe): drop the ticket, back to Register.
                onStaleApplicant?()
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// One appeal after the verdict: the stream continues with a short tier-5 round and a new verdict.
    func appeal(text: String?) async {
        guard let id = lastCaseID, !appealUsed, phase == .idle else { return }
        appealUsed = true
        do {
            try await backend.appeal(caseID: id, applicantToken: applicantToken, text: text)
        } catch {
            errorMessage = error.localizedDescription
            return
        }
        notice = nil
        subtitle = nil
        caseID = id
        phase = .roasting
        do {
            try await consume(backend.stream(caseID: id))
        } catch {
            errorMessage = error.localizedDescription
        }
        if phase == .roasting { phase = .idle }
    }

    /// "New startup" while a case runs: silence the officers and drop every event still queued for them.
    func abandon() {
        epoch += 1
        holdForQueue = false
        audio.stopPlayback()
        puppet.setSpeaker(nil)
        puppet.extinguish()
        phase = .idle
    }

    /// Bumped by `abandon()`; a running `consume` stops handling events from an older epoch.
    @ObservationIgnored private var epoch = 0

    /// Stop the audit game (user tapped "Face the officers", or the round ended + 2.5 s).
    func closeWhack() { whack.active = false }

    /// Wait behind the game overlay: the officers do not start until the audience is done.
    private func waitForWhack() async {
        while whack.active, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(150)) }
    }

    /// Events are played strictly in order by one consumer, while the network reader keeps filing late
    /// `audio` events (TTS that finished after its line was sent) so a line can pick its clip up on arrival.
    private func consume(_ stream: AsyncThrowingStream<RoastEvent, Error>) async throws {
        lateAudio = [:]
        let (queue, push) = AsyncStream.makeStream(of: RoastEvent.self)
        let my = epoch
        let player = Task { for await event in queue { guard my == epoch else { break }; await handle(event) } }
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
        case .tier(_, let name):
            tierName = name
            if whack.active { whack.auditDone = true }   // the audit is over; the game may stay until the audience is done
        case .line(let line):
            if whack.active { whack.auditDone = true }
            await waitForWhack()
            subtitle = line
            puppet.setSpeaker(line.speaker)
            if let s = line.stamp { showStamp(s, by: line.speaker) }
            var played = false
            let path = await audioPath(for: line)
            if let path, let url = backend.resolve(path) {
                played = await audio.play(url) { [puppet] open, wide in puppet.setMouth(open: open, wide: wide, speaker: line.speaker) }
            }
            NSLog("audio: line \(line.id.suffix(6)) path=\(path ?? "nil") played=\(played) problem=\(audio.lastProblem ?? "-")")
            if let problem = audio.lastProblem, !audioWarned {   // tell the audience once why it is silent
                audioWarned = true
                errorMessage = problem
            }
            if !played { await talkFor(min(max(Double(line.text.count) * 0.045, 1.8), 6), speaker: line.speaker) }
        case .verdict(let n):
            await waitForWhack()
            notice = n; phase = .idle; lastCaseID = caseID ?? lastCaseID; caseID = nil; showSmug()
        case .analyzing(let stage, let progress):
            analyzing = (stage, progress)
            puppet.setExpression(.outrage)   // outrage cut-outs while the repo is read (falls back to appalled)
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
            haptics.stamp()                 // the heavy hit at ignition…
            haptics.rumble(seconds: 3)      // …then the crackle
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
        whack = Whack()
        appealUsed = false
        lastCaseID = nil
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
