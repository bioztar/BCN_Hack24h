import SwiftUI

/// The verdict: shareable badge (server `badgeUrl`, or a locally rendered notice), TL;DR per law, the PDF
/// report link, and "apply again".
struct VerdictCard: View {
    let notice: Notice
    /// Resolves a server-relative path (badgeUrl / reportUrl) against the API base; nil for the mock.
    var resolve: (String) -> URL? = { _ in nil }
    var onApplyAgain: () -> Void = {}

    @State private var badge: Image?
    @Environment(\.displayScale) private var scale
    @Environment(\.dismiss) private var dismiss

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

                if let m = notice.meanwhile { MeanwhileCard(meanwhile: m) }

                actions

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

                if let recs = notice.recommendations, !recs.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("How to adjust the idea").font(.headline)
                        ForEach(Array(recs.enumerated()), id: \.offset) { _, r in
                            Text("• " + r.text).font(.callout)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button("Apply again with another startup", action: onApplyAgain).buttonStyle(.bordered)
                Button("Close", action: dismiss.callAsFunction).font(.footnote)
            }
            .padding()
        }
        .task(id: notice) { await loadBadge() }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            HStack {
                if let badge {
                    ShareLink(item: badge, preview: SharePreview("\(notice.startupName ?? notice.startup) — REFUSÉ", image: badge)) {
                        Label("Share badge", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                }
                if let path = notice.reportUrl, let url = resolve(path) {
                    Link(destination: url) { Label("Open report (PDF)", systemImage: "doc.richtext") }
                        .buttonStyle(.bordered)
                }
            }
            Link(destination: URL(string: "https://warden.pro7ocol.com/analyze/")!) {
                Label("Get the real report", systemImage: "doc.text.magnifyingglass")
            }
            .font(.footnote)
        }
    }

    /// Server badge when there is one; otherwise render the on-screen notice so sharing always works.
    private func loadBadge() async {
        if let path = notice.badgeUrl, let url = resolve(path),
           let (data, _) = try? await URLSession.shared.data(from: url), let ui = UIImage(data: data) {
            badge = Image(uiImage: ui)
            return
        }
        let renderer = ImageRenderer(content: NoticeFace(notice: notice).frame(width: 340).environment(\.colorScheme, .light))
        renderer.scale = scale
        if let ui = renderer.uiImage { badge = Image(uiImage: ui) }
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
