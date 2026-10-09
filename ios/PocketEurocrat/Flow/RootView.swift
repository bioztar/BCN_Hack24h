import SwiftUI

/// Apply (the v2 flow) and the leaderboard.
struct RootView: View {
    @Bindable var flow: FlowModel
    @State private var board: LeaderboardModel

    init(flow: FlowModel) {
        self.flow = flow
        _board = State(initialValue: LeaderboardModel(backend: flow.backend))
    }

    var body: some View {
        TabView {
            applyTab
                .tabItem { Label("Apply", systemImage: "doc.text") }
            LeaderboardView(model: board)
                .tabItem { Label("Hall of Shame", systemImage: "list.number") }
        }
    }

    @ViewBuilder private var applyTab: some View {
        switch flow.stage {
        case .register: RegisterView(flow: flow)
        case .queue: QueueView(flow: flow)
        case .select: DuoSelectView(flow: flow)
        case .play: PocketView(model: flow.pocket, onApplyAgain: { flow.applyAgain() })
        }
    }
}
