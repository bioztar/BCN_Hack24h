import SwiftUI

/// The shareable notice. `VerdictCard` = sheet with share button; `NoticeFace` = the part rendered to an image.
struct VerdictCard: View {
    let notice: Notice
    @State private var image: Image?
    @Environment(\.displayScale) private var scale
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            NoticeFace(notice: notice)
            HStack {
                if let image {
                    ShareLink(item: image, preview: SharePreview("Notice \(notice.serial)", image: image)) {
                        Label("Share verdict", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                }
                Link(destination: URL(string: "https://warden.pro7ocol.com/analyze/")!) {
                    Label("Get the real report", systemImage: "doc.text.magnifyingglass")
                }
                .buttonStyle(.bordered)
            }
            Button("Close", action: dismiss.callAsFunction).font(.footnote)
        }
        .padding()
        .task(id: notice) { render() }
    }

    @MainActor private func render() {
        let renderer = ImageRenderer(content: NoticeFace(notice: notice).frame(width: 340).environment(\.colorScheme, .light))
        renderer.scale = scale
        if let ui = renderer.uiImage { image = Image(uiImage: ui) }
    }
}

struct NoticeFace: View {
    let notice: Notice

    private var fine: String {
        notice.fineEur.formatted(.currency(code: "EUR").presentation(.narrow).precision(.fractionLength(0)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("NOTICE OF NON-COMPLIANCE").font(.caption.weight(.heavy)).tracking(1.5)
            Text(notice.serial).font(.caption.monospaced()).foregroundStyle(.secondary)
            Text(notice.startup).font(.system(.title, design: .serif, weight: .bold))
            Divider()
            ForEach(Array(notice.findings.enumerated()), id: \.offset) { _, f in
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.text).font(.callout)
                    Text(f.provision.label).font(.caption2.monospaced()).foregroundStyle(.orange)
                }
            }
            Divider()
            Text("FINE").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
            Text(fine).font(.system(size: 34, weight: .black, design: .serif)).foregroundStyle(.red)
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
