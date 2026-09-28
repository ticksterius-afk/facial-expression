import SwiftUI

/// Three-second neutral-face calibration, followed (the first time, or on request)
/// by the personal range calibration: a few maximal faces that teach the engine
/// how far this person's brows, eyes and mouth move.
struct CalibrationView: View {
    enum Phase { case neutralIntro, neutral, rangeIntro, range }

    @EnvironmentObject private var tracker: FaceTracker
    @Binding var isPresented: Bool
    @State private var phase: Phase

    init(isPresented: Binding<Bool>, startWithRange: Bool = false) {
        _isPresented = isPresented
        _phase = State(initialValue: startWithRange ? .rangeIntro : .neutralIntro)
    }

    private var progress: Double {
        switch phase {
        case .neutral: tracker.calibrationProgress
        case .range: tracker.rangeProgress
        default: 0
        }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.82).ignoresSafeArea()
            VStack(spacing: 14) {
                ZStack {
                    Circle().stroke(Theme.surface2, lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Theme.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.1), value: progress)
                }
                .frame(width: 110, height: 110)

                content
            }
            .padding(28)
            .frame(maxWidth: 440)
        }
        .onChange(of: tracker.calibrating) { _, calibrating in
            guard phase == .neutral, !calibrating else { return }
            if tracker.lastCalibration == .done && !tracker.hasRangeGains {
                phase = .rangeIntro
            } else {
                isPresented = false
            }
        }
        .onChange(of: tracker.rangeIndex) { _, index in
            if phase == .range && index == nil { isPresented = false }
        }
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .neutralIntro:
            Text("Calibrate your neutral face").font(.title3.bold())
            Text("Everyone's resting face is different. Look at the screen with a relaxed, neutral expression for three seconds so expressions are measured from your baseline.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            primaryButton("Calibrate") {
                phase = .neutral
                tracker.beginCalibration()
            }
            Button("Not now") { isPresented = false }.foregroundStyle(.secondary)

        case .neutral:
            Text("Hold still — relaxed face").font(.title3.bold())
            Text("Look at the screen, lips together, brows relaxed.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

        case .rangeIntro:
            let steps = tracker.rangeSteps
            let p = tracker.engine.cm.params.range
            Text("Calibrate your range").font(.title3.bold())
            Text("\(steps.count) faces · about \(Int((Double(steps.count) * (p.settleSec + p.holdSec)).rounded())) seconds")
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondary)
            Text("Faces move by different amounts. Make each face as strongly as you can, so your full movement counts as full intensity.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            primaryButton("Start") {
                phase = .range
                tracker.beginRange()
            }
            Button("Not now") { isPresented = false }.foregroundStyle(.secondary)

        case .range:
            let steps = tracker.rangeSteps
            let i = min(tracker.rangeIndex ?? 0, steps.count - 1)
            Text("Face \(i + 1) of \(steps.count)")
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondary)
            Text(steps[i].prompt).font(.title3.bold()).multilineTextAlignment(.center)
            Text("Hold it until the ring is full.").foregroundStyle(.secondary)
            Button("Stop") {
                tracker.stopRange()
                isPresented = false
            }
            .foregroundStyle(.secondary)
        }
    }

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.headline).frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
    }
}
