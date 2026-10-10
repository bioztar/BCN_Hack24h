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
    }

    var canRegister: Bool {
        !startupName.trimmingCharacters(in: .whitespaces).isEmpty && !founderName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    func register() async {
        guard canRegister, !busy else { return }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            let input = ApplicantInput(
                startupName: String(startupName.trimmingCharacters(in: .whitespaces).prefix(60)),
                founderName: String(founderName.trimmingCharacters(in: .whitespaces).prefix(60)),
                oneLiner: oneLiner.isEmpty ? nil : String(oneLiner.prefix(140)),
                photo: photo.flatMap(Self.dataURL))
            ticket = try await backend.register(input)
            registeredAt = Date()
            skipResult = nil
            stage = .queue
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
            errorMessage = error.localizedDescription
        }
    }

    func queueFinished() {
        guard stage == .queue else { return }
        stage = .select
    }

    func choose(pairID: String) {
        pocket.select(pair: pairID)
        pocket.applicantId = ticket?.applicantId
        pocket.applicantToken = ticket?.applicantToken
        stage = .pitch
    }

    /// Pitch screen → roast screen; the chosen submission runs as the case's first pitch.
    func submitPitch(_ submission: Submission, label: String, dictated: Bool = false) {
        stage = .play
        Task { await pocket.submit(label, dictated: dictated, as: submission) }
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
