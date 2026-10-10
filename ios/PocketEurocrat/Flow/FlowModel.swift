import Observation
import UIKit

/// The v2 applicant flow: register → queue (→ better-place skip) → duo select → play (pitch / roast / verdict).
@MainActor
@Observable
final class FlowModel {
    enum Stage: Equatable { case register, queue, select, pitch, play }

    var stage: Stage = .register
    var startupName = ""
    var founderName = ""
    var oneLiner = ""
    var photo: UIImage?

    var ticket: QueueTicket?
    /// When the ticket was issued: the Meanwhile clock in the queue (server counts from registration too).
    var registeredAt: Date?
    var skipResult: BetterPlaceResult?
    var busy = false
    var errorMessage: String?

    let backend: RoastBackend
    let pocket: PocketModel

    init(pocket: PocketModel) {
        self.pocket = pocket
        self.backend = pocket.backend
        pocket.onStaleApplicant = { [weak self] in self?.staleApplicant() }
    }

    /// Name is the only required field (60-second register); the founder defaults like the PWA's.
    var canRegister: Bool { !startupName.trimmingCharacters(in: .whitespaces).isEmpty }

    /// The server forgot this applicant (data wipe → 404 on case create): drop the ticket, back to Register.
    private func staleApplicant() {
        pocket.newApplication()
        ticket = nil; skipResult = nil; registeredAt = nil
        stage = .register
        errorMessage = "The Commission has lost your file. Again. This is, statistically, the most European thing that could happen — please register once more."
    }

    func register() async {
        guard canRegister, !busy else { return }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            let founder = String(founderName.trimmingCharacters(in: .whitespaces).prefix(60))
            let input = ApplicantInput(
                startupName: String(startupName.trimmingCharacters(in: .whitespaces).prefix(60)),
                founderName: founder.isEmpty ? "A. Nonymous" : founder,
                oneLiner: nil,
                photo: photo.flatMap(Self.dataURL))
            ticket = try await backend.register(input)
            registeredAt = Date()
            skipResult = nil
            stage = .select   // register → duo → pitch → queue (with Whack-a-Model) → roast
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func skipQueue(cause: BetterPlaceCause) async {
        guard let ticket, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            skipResult = try await backend.betterPlace(applicantId: ticket.applicantId, applicantToken: ticket.applicantToken, cause: cause)
        } catch {
            if (error as? LiveBackend.ServerError)?.status == 404 { return staleApplicant() }
            errorMessage = error.localizedDescription
        }
    }

    /// Queue over (Whack round ended / 30 s / better-place skip): the held case starts its roast.
    func queueFinished() {
        guard stage == .queue else { return }
        stage = .play
        pocket.holdForQueue = false
        pocket.wake()   // the busts dozed off while the queue was on screen
    }

    func choose(pairID: String) {
        pocket.select(pair: pairID)
        pocket.applicantId = ticket?.applicantId
        pocket.applicantToken = ticket?.applicantToken
        stage = .pitch
    }

    /// Pitch screen → roast screen; the chosen submission runs as the case's first pitch.
    func submitPitch(_ submission: Submission, label: String, dictated: Bool = false) {
        skipResult = nil
        registeredAt = Date()
        pocket.holdForQueue = true
        stage = .queue
        pitchTask = Task {
            await pocket.submit(label, dictated: dictated, as: submission)   // returns after the stream (or at once on error)
            if stage == .queue, !Task.isCancelled {   // failed before the queue ended: back to the pitch (the alert says why)
                pocket.holdForQueue = false
                stage = .pitch
            }
        }
    }

    @ObservationIgnored private var pitchTask: Task<Void, Never>?

    /// Is there a file in progress that "New startup" would abandon (queue running / roast streaming)?
    var hasFileInProgress: Bool { stage == .queue || (stage == .play && pocket.phase != .idle) }

    /// "＋ New startup": abandon whatever runs, reset the case, back to Register with an EMPTY startup name
    /// (founder + selfie stay prefilled; a fresh applicant is registered on submit).
    func newStartup() {
        pitchTask?.cancel()
        pitchTask = nil
        pocket.abandon()
        pocket.newApplication()
        startupName = ""
        oneLiner = ""
        ticket = nil; skipResult = nil; registeredAt = nil
        errorMessage = nil
        stage = .register
    }

    /// "Faceify" → "Faceify (pivot 2)" → "Faceify (pivot 3)", within the 60-char name limit.
    nonisolated static func pivotName(_ name: String) -> String {
        var base = name, n = 2
        if let r = name.range(of: #" \(pivot (\d+)\)$"#, options: .regularExpression) {
            base = String(name[..<r.lowerBound])
            n = (Int(name[r].filter(\.isNumber)) ?? 1) + 1
        }
        let tag = " (pivot \(n))"
        return String(base.trimmingCharacters(in: .whitespaces).prefix(60 - tag.count)) + tag
    }

    func applyAgain() {
        pocket.newApplication()
        startupName = ""; founderName = ""; oneLiner = ""; photo = nil
        ticket = nil; skipResult = nil; registeredAt = nil
        stage = .register
    }

    // MARK: photo

    /// Downscale to ≤ 512 px and JPEG-compress under 400 KB; returns a data URL.
    nonisolated static func dataURL(from image: UIImage) -> String? {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, 512 / max(longest, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        var quality: CGFloat = 0.8
        while quality > 0.2 {
            if let data = resized.jpegData(compressionQuality: quality), data.count <= 400_000 {
                return "data:image/jpeg;base64," + data.base64EncodedString()
            }
            quality -= 0.15
        }
        return nil
    }
}
