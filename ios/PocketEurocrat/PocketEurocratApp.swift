import SwiftUI

@main
struct PocketEurocratApp: App {
    @State private var flow: FlowModel

    init() {
        let pocket = PocketModel()
        _flow = State(initialValue: FlowModel(pocket: pocket))
        #if DEBUG
        // Screenshot aid: `-stage select|play` jumps into the flow (sim-shot.sh).
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-stage"), i + 1 < args.count {
            let f = _flow.wrappedValue
            switch args[i + 1] {
            case "queue":
                f.startupName = "48K"; f.founderName = "Pavel K."
                Task { await f.register() }
            case "select": f.stage = .select
            case "play": f.stage = .play
            default: break
            }
        }
        if let i = args.firstIndex(of: "-pitch"), i + 1 < args.count {   // auto-pitch (needs -stage play)
            let text = args[i + 1]
            let f = _flow.wrappedValue
            Task {
                try? await Task.sleep(for: .seconds(2))
                await f.pocket.submit(text)
            }
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView(flow: flow)
                .preferredColorScheme(.dark)
                .task { flow.pocket.start() }
        }
    }
}
