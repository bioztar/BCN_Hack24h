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

    @ViewBuilder private var applyTab: some View {
        switch flow.stage {
        case .register: RegisterView(flow: flow)
        case .queue: QueueView(flow: flow)
        case .select: DuoSelectView(flow: flow)
        case .pitch: PitchView(flow: flow)
        case .play: PocketView(model: flow.pocket, onApplyAgain: { flow.applyAgain() })
        }
    }
}
