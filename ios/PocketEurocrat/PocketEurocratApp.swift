import SwiftUI

@main
struct PocketEurocratApp: App {
    @State private var model = PocketModel()

    var body: some Scene {
        WindowGroup {
            PocketView(model: model)
                .preferredColorScheme(.dark)
                .task { model.start() }
        }
    }
}
