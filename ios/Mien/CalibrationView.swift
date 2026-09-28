import SwiftUI

/// Three-second neutral-face calibration with a progress ring.
struct CalibrationView: View {
    @EnvironmentObject private var tracker: FaceTracker
    @Binding var isPresented: Bool
    @State private var started = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.82).ignoresSafeArea()
            VStack(spacing: 14) {
                ZStack {
                    Circle().stroke(Theme.surface2, lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: started ? tracker.calibrationProgress : 0)
                        .stroke(Theme.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.1), value: tracker.calibrationProgress)
                }
                .frame(width: 110, height: 110)

                Text(started ? "Hold still — relaxed face" : "Calibrate your neutral face").font(.title3.bold())
                Text(started
                     ? "Look at the screen, lips together, brows relaxed."
                     : "Everyone's resting face is different. Look at the screen with a relaxed, neutral expression for three seconds so expressions are measured from your baseline.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                if !started {
                    Button {
                        started = true
                        tracker.beginCalibration()
                    } label: {
                        Text("Calibrate").font(.headline).frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
                    Button("Not now") { isPresented = false }.foregroundStyle(.secondary)
                }
            }
            .padding(28)
            .frame(maxWidth: 440)
        }
        .onChange(of: tracker.calibrating) { _, calibrating in
            if started && !calibrating { isPresented = false }
        }
    }
}
