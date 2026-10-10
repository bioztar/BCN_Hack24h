import SwiftUI

/// The verdict: shareable badge (server `badgeUrl`, or a locally rendered notice), TL;DR per law, the PDF
/// report link, and "apply again".
struct VerdictCard: View {
    let notice: Notice
    /// Resolves a server-relative path (badgeUrl / reportUrl) against the API base; nil for the mock.
    var resolve: (String) -> URL? = { _ in nil }
    /// Whack-a-Model result from the repo audit (banned, Mistral stamped), shown as one line.
    var banned: (Int, Int)? = nil
    /// First pitch text / repo URL: prefills the full compliance analyzer.
    var pitch = ""
    var canAppeal = false
    var onAppeal: (String?) -> Void = { _ in }
    var onApplyAgain: () -> Void = {}

    @State private var badge: Image?
    @State private var badgeFile: URL?
    @State private var grounds = ""
    @State private var appealed = false
    @Environment(\.displayScale) private var scale
    @Environment(\.dismiss) private var dismiss

    private var turnoverLine: String? {
        guard let t = notice.turnoverEstimate, t.eur.isFinite, t.eur >= 0 else { return nil }
        let basis = t.basis?.trimmingCharacters(in: .whitespaces) ?? ""
        return "Estimated turnover (by the Commission, generously): \(Money.short(t.eur))" + (basis.isEmpty ? "" : " — \(basis)")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Group {
                    if let badge {
                        badge.resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        NoticeFace(notice: notice)
                    }
                }

                if let line = turnoverLine {
                    Text(line).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                if let b = banned {
                    Text(Arcade.whackLine(banned: b.0, mistral: b.1)).font(.footnote.weight(.semibold))
                        .foregroundStyle(.orange).multilineTextAlignment(.center)
                }

                if canAppeal && !appealed { appealBlock }

                Button(action: onApplyAgain) {
                    Text("🆕 New startup idea").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent).controlSize(.large)

                fixes

                actions

                Text("Free today · Full compliance dossier €49 · Accelerators: roast your whole cohort — [contact](mailto:hello@pro7ocol.com?subject=Eurocrat%20%E2%80%94%20roast%20our%20cohort)")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)

                if let m = notice.meanwhile { MeanwhileCard(meanwhile: m) }

                PlayArcadeButton(title: "Play while you appeal")

                if let tldr = notice.tldr, !tldr.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("TL;DR").font(.headline)
                        ForEach(Array(tldr.enumerated()), id: \.offset) { _, row in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(row.law).font(.caption.monospaced().weight(.bold)).foregroundStyle(.orange).frame(width: 78, alignment: .leading)
                                Text(row.oneLine).font(.callout)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button("Close", action: dismiss.callAsFunction).font(.footnote)
            }
            .padding()
        }
        .task(id: notice) { await loadBadge() }
    }

    /// One appeal, once: optional grounds (ignored), then a short tier-5 round and a new verdict.
    private var appealBlock: some View {
        VStack(spacing: 8) {
            TextField("Grounds for appeal (optional, will be ignored)", text: $grounds)
                .textFieldStyle(.roundedBorder)
            Button {
                appealed = true
                let text = grounds.trimmingCharacters(in: .whitespaces)
                dismiss()
                onAppeal(text.isEmpty ? nil : text)
            } label: {
                Text("⚖️ Appeal (one chance)").fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 4)
            }
            .buttonStyle(.bordered).controlSize(.large)
        }
    }

    /// Top 3 fixes + the real compliance report (warden) prefilled with the pitch.
    private var fixes: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("How to make it legal — top 3 fixes").font(.headline)
            ForEach(Array((notice.recommendations ?? []).prefix(3).enumerated()), id: \.offset) { i, r in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(i + 1).").font(.callout.weight(.bold))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.text).font(.callout)
                        if let p = r.provision, let url = URL(string: p.url) {
                            Link(p.label, destination: url).font(.caption2.monospaced())
                        }
                    }
                }
            }
            Link(destination: Arcade.wardenURL(pitch: pitch)) {
                Label("Get the full compliance report →", systemImage: "doc.text.magnifyingglass")
                    .frame(maxWidth: .infinity).padding(.vertical, 4)
            }
            .buttonStyle(.bordered).controlSize(.large)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actions: some View {
        VStack(spacing: 10) {
            HStack {
                if let file = badgeFile {
                    // A real PNG file + text through UIActivityViewController: lazy Transferable exports of an
                    // Image make WhatsApp/Instagram/LinkedIn/Mail close the sheet without posting.
                    Button { ShareSheet.present(items: [shareText, file]) } label: {
                        Label("Share badge", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                }
                if let path = notice.reportUrl, let url = resolve(path) {
                    Link(destination: url) { Label("Open report (PDF)", systemImage: "doc.richtext") }
                        .buttonStyle(.bordered)
                }
            }
        }
    }

    /// Server badge when there is one; otherwise render the on-screen notice so sharing always works.
    private func loadBadge() async {
        var image: UIImage?
        if let path = notice.badgeUrl, let url = resolve(path),
           let (data, _) = try? await URLSession.shared.data(from: url) {
            image = UIImage(data: data)
        }
        if image == nil {
            let renderer = ImageRenderer(content: NoticeFace(notice: notice).frame(width: 340).environment(\.colorScheme, .light))
            renderer.scale = scale
            image = renderer.uiImage
        }
        guard let image else { return }
        badge = Image(uiImage: image)
        // Written once, as a plain PNG, for the share sheet.
        let name = "eurocrat-\(notice.serial.replacingOccurrences(of: "/", with: "-")).png"
        let file = FileManager.default.temporaryDirectory.appending(path: name)
        if let png = image.pngData(), (try? png.write(to: file, options: .atomic)) != nil { badgeFile = file }
    }

    /// "My startup idea is so illegal it earned €1.2bn and 100 y in jail — Eurocrat https://eurocrat.pro7ocol.com"
    private var shareText: String {
        let eur = Money.short(notice.totalEur ?? notice.fineEur)
        let jail = (notice.totalJailMonths ?? 0) > 0 ? " and \(Money.jail(notice.totalJailMonths ?? 0)) in jail" : ""
        return "My startup idea is so illegal it earned \(eur)\(jail) — Eurocrat https://eurocrat.pro7ocol.com"
    }
}

/// Presents UIActivityViewController from the top-most view controller (works from inside the verdict sheet).
enum ShareSheet {
    @MainActor
    static func present(items: [Any]) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
              var top = scene.keyWindow?.rootViewController else { return }
        while let next = top.presentedViewController { top = next }
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = top.view
        top.present(vc, animated: true)
    }
}

struct NoticeFace: View {
    let notice: Notice

    private var fine: String {
        (notice.totalEur ?? notice.fineEur).formatted(.currency(code: "EUR").presentation(.narrow).precision(.fractionLength(0)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("NOTICE OF NON-COMPLIANCE").font(.caption.weight(.heavy)).tracking(1.5)
            Text(notice.serial).font(.caption.monospaced()).foregroundStyle(.secondary)
            Text((notice.startupName ?? notice.startup) + (notice.meltdown == true ? " 🔥" : ""))
                .font(.system(.title, design: .serif, weight: .bold))
            Divider()
            ForEach(Array(notice.findings.enumerated()), id: \.offset) { _, f in
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.text).font(.callout)
                    Text(f.provision.label).font(.caption2.monospaced()).foregroundStyle(.orange)
                }
            }
            Divider()
            Text("FINES").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
            Text(fine).font(.system(size: 34, weight: .black, design: .serif)).foregroundStyle(.red)
            if let jail = notice.totalJailMonths, jail > 0 {
                Text("+ \(Money.jail(jail)) custodial").font(.subheadline.weight(.semibold))
            }
            Text(notice.fineBasis).font(.caption2).foregroundStyle(.secondary)
            Text(notice.officers.map(Roster.name).joined(separator: " & ")).font(.caption2.italic())
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.98, green: 0.97, blue: 0.92))
        .foregroundStyle(.black)
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(.black.opacity(0.7), lineWidth: 2))
    }
}
