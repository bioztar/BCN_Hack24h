import SwiftUI

/// Apply (the v2 flow), the leaderboard, and the Arcade.
struct RootView: View {
    @Bindable var flow: FlowModel
    @State private var board: LeaderboardModel

    init(flow: FlowModel) {
        self.flow = flow
        _board = State(initialValue: LeaderboardModel(backend: flow.backend))
    }

    @State private var tab = ProcessInfo.processInfo.arguments.contains("-tab-board") ? 1 : 0   // -tab-board: screenshot aid

    var body: some View {
        TabView(selection: $tab) {
            applyTab
                .tabItem { Label("Apply", systemImage: "doc.text") }
                .tag(0)
            LeaderboardView(model: board)
                .tabItem { Label("Hall of Shame", systemImage: "list.number") }
                .tag(1)
            ArcadeView(closable: false)
                .tabItem { Label("Play", systemImage: "gamecontroller") }
                .tag(2)
        }
    }

    @State private var confirmNew = false

    /// The stage view with a persistent "＋ New startup" pill on every stage after Register.
    private var applyTab: some View {
        stageView
            .safeAreaInset(edge: .top, spacing: 0) {   // a slim bar of its own: never covers the meter / ticket number
                if flow.stage != .register {
                    Button {
                        if flow.hasFileInProgress { confirmNew = true } else { flow.newStartup() }
                    } label: {
                        Label("New startup", systemImage: "plus")
                            .font(.subheadline.weight(.bold))
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(Color.accentColor))
                            .foregroundStyle(.white)
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.trailing, 12).padding(.vertical, 4)
                }
            }
            .confirmationDialog("Abandon this file?", isPresented: $confirmNew, titleVisibility: .visible) {
                Button("Abandon and start a new startup", role: .destructive) { flow.newStartup() }
                Button("Keep going", role: .cancel) {}
            } message: { Text("The officers will be told nothing. They will assume the worst.") }
    }

    @ViewBuilder private var stageView: some View {
        switch flow.stage {
        case .register: RegisterView(flow: flow)
        case .queue: QueueView(flow: flow)
        case .select: DuoSelectView(flow: flow)
        case .pitch: PitchView(flow: flow)
        case .play: PocketView(model: flow.pocket, onApplyAgain: { flow.newStartup() })
        }
    }
}
