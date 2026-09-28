import EmotionEngine
import SwiftUI

/// The live label: primary emotion, confidence, gloss and complex-state chips.
struct ReadoutView: View {
    let output: FrameResult?
    let cm: CompiledModel

    var body: some View {
        let face = output?.face ?? false
        let primary = output?.primary ?? Ranked(id: "neutral", score: 0)
        let meta = ExpressionMeta(primary.id, cm)
        let isNeutral = primary.id == "neutral"

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Text(face ? meta.emoji : "🙈").font(.system(size: 44))
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(face ? meta.name : "No face").font(.system(size: 26, weight: .bold))
                        if face && !isNeutral {
                            Text(percent(primary.score)).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                    Meter(value: face && !isNeutral ? primary.score : 0, color: Theme.primaryColors[primary.id] ?? Theme.accent, height: 5)
                    Text(face ? meta.gloss : "Point the front camera at a face.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            if face, let complex = output?.complex, !complex.isEmpty {
                FlowChips(items: complex.map { c in
                    let m = ExpressionMeta(c.id, cm)
                    return ChipItem(id: c.id, text: "\(m.emoji) \(m.name)", value: percent(c.score), color: Theme.tierColor(m.tier))
                })
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 28)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [.clear, .black.opacity(0.35), .black.opacity(0.72)], startPoint: .top, endPoint: .bottom))
        .accessibilityElement(children: .combine)
    }
}

struct ChipItem: Identifiable {
    let id: String
    let text: String
    let value: String
    let color: Color
}

struct FlowChips: View {
    let items: [ChipItem]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            chips
        }
    }

    private var chips: some View {
        HStack(spacing: 6) {
            ForEach(items) { item in
                HStack(spacing: 4) {
                    Text(item.text).font(.footnote)
                    Text(item.value).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }
                .lineLimit(1)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(item.color.opacity(0.16), in: Capsule())
                .overlay(Capsule().stroke(item.color.opacity(0.4)))
            }
        }
    }
}
