import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var tracker: FaceTracker
    @Binding var showMesh: Bool
    @Binding var sensitivity: Double
    let recalibrate: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading) {
                        HStack {
                            Text("Sensitivity")
                            Spacer()
                            Text(String(format: "%.1f×", sensitivity)).foregroundStyle(.secondary).monospacedDigit()
                        }
                        Slider(value: $sensitivity, in: 0.6...1.8, step: 0.1)
                    }
                    Toggle("Face mesh overlay", isOn: $showMesh)
                } footer: {
                    Text("Higher sensitivity reacts to subtler movements but also to noise.")
                }
                Section {
                    Button("Recalibrate neutral face", action: recalibrate)
                    Button("Forget calibration", role: .destructive) { tracker.forgetCalibration() }
                } footer: {
                    Text(tracker.engine.baseline.calibrated ? "Calibrated to your neutral face." : "Not calibrated — the baseline is being learned automatically.")
                }
                Section("About") {
                    Text("Mien tracks 52 facial blendshapes with the TrueDepth camera (ARKit), converts them to FACS Action Units, and names expressions using prototypes from Ekman & Friesen, EMFACS, Du, Tao & Martinez (compound emotions), Keltner, Tracy & Robins, Rozin & Cohen and Prkachin & Solomon.")
                    Text("Faces show expressions, not guaranteed feelings: the same movement can mean different things in different contexts and cultures (Barrett et al., 2019). Everything runs on this iPhone; nothing is recorded or uploaded.")
                        .foregroundStyle(.secondary)
                }
                .font(.footnote)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
