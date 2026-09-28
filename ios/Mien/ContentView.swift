import EmotionEngine
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var tracker: FaceTracker
    @AppStorage("showMesh") private var showMesh = true
    @AppStorage("sensitivity") private var sensitivity = 1.0
    @State private var showSettings = false
    @State private var showCalibration = false
    @State private var tab: PanelTab = .emotions
    @State private var whyID: String?

    var body: some View {
        Group {
            if tracker.supported {
                main
            } else {
                UnsupportedView()
            }
        }
        .background(Theme.background.ignoresSafeArea())
    }

    private var main: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                ZStack {
                    ARFaceView(session: tracker.session, showMesh: showMesh)
                        .ignoresSafeArea(edges: .top)
                    VStack {
                        hud
                        Spacer()
                        ReadoutView(output: tracker.output, cm: tracker.engine.cm)
                    }
                    if let message = tracker.errorMessage {
                        Text(message)
                            .font(.callout)
                            .padding()
                            .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
                            .padding()
                    } else if tracker.output?.face == false {
                        Text("No face in view")
                            .font(.callout)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .background(.black.opacity(0.6), in: Capsule())
                    }
                }
                .frame(height: geo.size.height * 0.58)
                .clipped()

                PanelView(tab: $tab, whyID: $whyID)
                    .frame(maxHeight: .infinity)
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(showMesh: $showMesh, sensitivity: $sensitivity, recalibrate: {
                showSettings = false
                showCalibration = true
            })
            .presentationDetents([.medium, .large])
        }
        .overlay {
            if showCalibration {
                CalibrationView(isPresented: $showCalibration)
            }
        }
        .onAppear {
            tracker.sensitivity = sensitivity
            tracker.start()
            if !tracker.engine.baseline.calibrated { showCalibration = true }
        }
        .onChange(of: sensitivity) { _, value in tracker.sensitivity = value }
    }

    private var hud: some View {
        HStack(spacing: 10) {
            Text("Mien").font(.headline.weight(.bold))
            Button {
                showCalibration = true
            } label: {
                HStack(spacing: 6) {
                    Circle()
                        .fill(tracker.engine.baseline.calibrated ? Theme.good : Theme.warn)
                        .frame(width: 8, height: 8)
                    Text(tracker.engine.baseline.calibrated ? "Calibrated · TrueDepth" : "Tap to calibrate")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(.ultraThinMaterial, in: Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .medium))
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
    }
}

struct UnsupportedView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "faceid").font(.system(size: 54)).foregroundStyle(Theme.accent)
            Text("Face tracking isn't available").font(.title2.bold())
            Text("Mien's native app needs a device with a TrueDepth camera (Face ID) or an A12 chip or newer. You can still use the web version in Safari.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(32)
    }
}
