import SwiftUI

/// Character-select: pick one of the three double acts, then pitch.
struct DuoSelectView: View {
    @Bindable var flow: FlowModel

    var body: some View {
        VStack(spacing: 16) {
            Text("Choose your case officers").font(.system(.title2, design: .serif, weight: .bold)).padding(.top, 20)
            Text("They will be assigned to you regardless.").font(.footnote).foregroundStyle(.secondary)
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(flow.pocket.pairs, id: \.id) { pair in
                        Button { flow.choose(pairID: pair.id) } label: { card(pair) }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 110)   // clear of the floating tab bar
            }
        }
    }

    private func card(_ pair: Pair) -> some View {
        let people = pair.officers.compactMap { id in flow.pocket.officers.first { $0.id == id } }
        return HStack(spacing: 0) {
            ForEach(people) { p in
                VStack(spacing: 6) {
                    Image(uiImage: CutoutStore.image(officer: p, expression: .neutral))
                        .resizable().scaledToFit().frame(height: 150)
                        .frame(maxWidth: .infinity)
                    Text(p.name).font(.caption.weight(.semibold)).multilineTextAlignment(.center).lineLimit(2)
                    Text(p.title).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center).lineLimit(2)
                }
                .padding(.horizontal, 6)
            }
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.accentColor.opacity(0.35)))
    }
}
