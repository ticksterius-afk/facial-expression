import SwiftUI

@main
struct MienApp: App {
    @StateObject private var tracker = FaceTracker()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(tracker)
                .preferredColorScheme(.dark)
                .onChange(of: scenePhase) { _, phase in
                    // Stop the camera in the background; resume when the app returns.
                    if phase == .active { tracker.start() } else if phase == .background { tracker.pause() }
                }
        }
    }
}
