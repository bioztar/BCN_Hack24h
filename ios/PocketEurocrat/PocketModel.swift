import Foundation
import Observation

/// App state + orchestration: motion -> scene, shake -> stamp, idle -> sleep, pitch -> roast stream.
@MainActor
@Observable
final class PocketModel {
    enum Phase: Equatable { case idle, listening, roasting, awaiting(String) }

    static let sleepAfter: TimeInterval = 8

    var officers: [Persona] = Roster.officers
    var selectedID = "formblatt"
    var phase: Phase = .idle
    var isAsleep = false
    var stamp: String?
    var subtitle: RoastLine?
    var tierName: String?
    var notice: Notice?
    var errorMessage: String?

    let box = BoxScene()
    @ObservationIgnored let backend: RoastBackend
    @ObservationIgnored private let motion = MotionService()
    @ObservationIgnored private let haptics = HapticsService()
    @ObservationIgnored private let audio = AudioService()
    @ObservationIgnored private var lastActivity = Date()
    @ObservationIgnored private var caseID: String?
    @ObservationIgnored private var started = false
    @ObservationIgnored private var stampTask: Task<Void, Never>?

    var selected: Persona { officers.first { $0.id == selectedID } ?? Roster.officers[0] }
    var motionAvailable: Bool { motion.isAvailable }

    init(backend: RoastBackend = BackendFactory.make()) {
        self.backend = backend
    }

    func start() {
        guard !started else { return }
        started = true
        box.setOfficerColor(hex: selected.color)
        box.onBump = { [weak self] strength in
            DispatchQueue.main.async { self?.haptics.bump(strength: strength); self?.wake() }
        }
        motion.onGravity = { [weak self] x, y in
            guard let self else { return }
            let moved = abs(x - lastGravity.x) + abs(y - lastGravity.y) > 0.03
            lastGravity = (x, y)
            box.setGravity(x: x, y: y)
            if moved { wake() }
        }
        motion.onShake = { [weak self] in self?.shake() }
        motion.start()
        Task { await loadRoster() }
        Task { await idleLoop() }
    }

    @ObservationIgnored private var lastGravity: (x: Double, y: Double) = (0, -1)

    func select(_ id: String) {
        selectedID = id
        box.setOfficerColor(hex: selected.color)
        wake()
    }

    func wake() {
        lastActivity = Date()
        if isAsleep { isAsleep = false; box.setAsleep(false) }
    }

    // MARK: shake -> stamp

    func shake() {
        wake()
        box.shake()
        showStamp("REFUSÉ")
    }

    private func showStamp(_ text: String) {
        haptics.stamp()
        stamp = text
        stampTask?.cancel()
        stampTask = Task {
            try? await Task.sleep(for: .milliseconds(1400))
            if !Task.isCancelled { stamp = nil }
        }
    }

    private func idleLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            if !isAsleep, phase == .idle, Date().timeIntervalSince(lastActivity) > Self.sleepAfter {
                isAsleep = true
                box.setAsleep(true)
            }
        }
    }

    private func loadRoster() async {
        // Live roster wins when reachable; the six paired ids keep their order.
        guard let live = try? await backend.personas() else { return }
        let paired = Roster.officers.compactMap { local in live.first { $0.id == local.id } }
        if paired.count == Roster.officers.count {
            officers = paired
            box.setOfficerColor(hex: selected.color)
        }
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
                let sub: Submission = dictated ? .dictation(pitch) : .text(pitch)
                id = try await backend.createCase(sub, officers: Roster.pair(containing: selectedID).officers).caseId
                caseID = id
            }
            phase = .roasting
            for try await event in backend.stream(caseID: id) { await handle(event) }
            if phase == .roasting { phase = .idle }
        } catch {
            errorMessage = error.localizedDescription
            phase = .idle
        }
    }

    private func handle(_ event: RoastEvent) async {
        switch event {
        case .tier(_, let name): tierName = name
        case .line(let line):
            subtitle = line
            if let s = line.stamp { showStamp(s) }
            if let path = line.audioUrl, let url = backend.resolve(path) {
                await audio.play(url)
            } else {
                try? await Task.sleep(for: .seconds(min(max(Double(line.text.count) * 0.045, 1.8), 6)))
            }
        case .verdict(let n): notice = n; phase = .idle; caseID = nil
        case .awaiting(let prompt): phase = .awaiting(prompt)
        case .error(let message): errorMessage = message; phase = .idle
        case .officers, .unknown: break
        }
    }

    func dismissVerdict() { notice = nil; subtitle = nil; tierName = nil }
}

extension PocketModel.Phase {
    var isAwaiting: Bool { if case .awaiting = self { return true } else { return false } }
}
