import SwiftUI

/// Whack-a-Model on top of the roast while a GitHub repo is audited (PWA parity). The officers' lines wait behind it;
/// it closes 2.5 s after the round ends once the audit is done, or on "Face the officers".
struct WhackOverlay: View {
    @Bindable var model: PocketModel
    @State private var failed = false

    var body: some View {
        ZStack(alignment: .bottom) {
            ArcadeView.euBlue.ignoresSafeArea()
            VStack(spacing: 8) {
                Text(model.whack.auditDone ? "Audit complete." : "Analysing your repository…")
                    .font(.system(.title3, design: .serif, weight: .bold)).foregroundStyle(ArcadeView.euYellow)
                Text("Meanwhile: stamp every non-EU model. Do NOT stamp Mistral.")
                    .font(.footnote).foregroundStyle(.white.opacity(0.85)).multilineTextAlignment(.center)
                if let a = model.analyzing { ProgressView(value: a.progress).tint(.orange).padding(.horizontal, 40) }
                if failed {
                    Spacer()
                    Text("The game is pending approval by the Council.").foregroundStyle(.white.opacity(0.8))
                    Spacer()
                } else {
                    ArcadeWebView(url: Arcade.whackURL(base: BackendFactory.baseURL()), base: BackendFactory.baseURL(),
                                  onLoaded: {}, onFailed: { failed = true },
                                  onScore: { s in
                                      guard s.game == "whack" else { return }
                                      model.whack.banned = s.hits
                                      model.whack.mistral = s.mistralHits
                                      model.whack.played = true
                                  },
                                  onLeave: {})
                }
            }
            .padding(.top, 12)
            if model.whack.auditDone {
                Button { model.closeWhack() } label: {
                    Text("Face the officers →").fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).tint(ArcadeView.euYellow).foregroundStyle(.black).controlSize(.large)
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
        }
        .task(id: model.whack.auditDone && model.whack.played) {
            guard model.whack.auditDone, model.whack.played else { return }
            try? await Task.sleep(for: .seconds(2.5))
            if !Task.isCancelled { model.closeWhack() }
        }
        .task(id: failed) {   // no game, no wait: as soon as the audit is done the officers start
            guard failed else { return }
            while !model.whack.auditDone, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(200)) }
            model.closeWhack()
        }
    }
}
