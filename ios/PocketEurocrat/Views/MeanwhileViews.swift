import SwiftUI

/// Three small counters (🇨🇳 models · 🇺🇸 models · 🇪🇺 regulations + forms) shown during the queue and the roast.
struct MeanwhileStrip: View {
    let meanwhile: Meanwhile

    var body: some View {
        VStack(spacing: 2) {
            Text("MEANWHILE").font(.caption2.weight(.heavy)).tracking(1.5).foregroundStyle(.secondary)
            HStack(spacing: 0) {
                cell("🇨🇳", "\(meanwhile.china.models)", meanwhile.china.models == 1 ? "model" : "models")
                cell("🇺🇸", "\(meanwhile.us.models)", meanwhile.us.models == 1 ? "model" : "models")
                cell("🇪🇺", "\(meanwhile.eu.regulations) + \(meanwhile.eu.forms)", "regs + forms")
            }
        }
        .padding(.vertical, 6).padding(.horizontal, 8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .animation(.easeOut(duration: 0.4), value: meanwhile)
        .accessibilityElement(children: .combine)
    }

    private func cell(_ flag: String, _ value: String, _ unit: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Text(flag)
                Text(value).font(.subheadline.monospacedDigit().weight(.bold)).contentTransition(.numericText())
            }
            Text(unit).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

/// The verdict's "While you were being processed…" card (above Share).
struct MeanwhileCard: View {
    let meanwhile: Meanwhile

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Meanwhile…").font(.headline)
            Text((try? AttributedString(markdown: meanwhile.paragraph)) ?? AttributedString(meanwhile.paragraph))
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 14) {
                Text("🇨🇳 \(meanwhile.china.models)")
                Text("🇺🇸 \(meanwhile.us.models)")
                Text("🇪🇺 \(meanwhile.eu.regulations) + \(meanwhile.eu.forms)")
            }
            .font(.subheadline.monospacedDigit().weight(.bold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2).fill(Color(red: 1, green: 0.84, blue: 0.09)).frame(width: 6)   // EU yellow accent
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
