import EmotionEngine
import SwiftUI

enum PanelTab: String, CaseIterable, Identifiable {
    case emotions = "Emotions", face = "Face", why = "Why", log = "Log"
    var id: String { rawValue }
}

struct PanelView: View {
    @EnvironmentObject private var tracker: FaceTracker
    @Binding var tab: PanelTab
    @Binding var whyID: String?

    var body: some View {
        VStack(spacing: 0) {
            Picker("Panel", selection: $tab) {
                ForEach(PanelTab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    switch tab {
                    case .emotions: EmotionsList(output: tracker.output, cm: tracker.engine.cm) { id in whyID = id; tab = .why }
                    case .face: FaceList(output: tracker.output, cm: tracker.engine.cm, fps: tracker.fps)
                    case .why: WhyView(output: tracker.output, engine: tracker.engine, selected: $whyID)
                    case .log: LogView(events: tracker.events, timeline: tracker.timeline)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 20)
            }
        }
        .background(Theme.surface)
    }
}

private struct GroupTitle: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(0.8)
            .foregroundStyle(.secondary)
            .padding(.top, 14).padding(.bottom, 4).padding(.horizontal, 2)
    }
}

// MARK: - Emotions

private struct EmotionsList: View {
    let output: FrameResult?
    let cm: CompiledModel
    let select: (String) -> Void

    private let tiers = ["primary", "compound", "social", "cognitive", "physical"]

    var body: some View {
        ForEach(tiers, id: \.self) { tier in
            GroupTitle(text: cm.model.tiers[tier] ?? tier)
            let ids = (tier == "primary" ? ["neutral"] : [String]()) + cm.expressions.filter { $0.tier == tier }.map(\.id)
            ForEach(ids, id: \.self) { id in
                row(id)
            }
        }
    }

    private func row(_ id: String) -> some View {
        let meta = ExpressionMeta(id, cm)
        let v = id == "neutral" ? (output?.neutral ?? 1) : (output?.scores[id] ?? 0)
        let active = output.map { o in o.primary.id == id || o.complex.contains { c in c.id == id } } ?? false
        return Button { select(id) } label: {
            HStack(spacing: 10) {
                Text(meta.emoji).frame(width: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text(meta.name).font(.subheadline)
                    Text(meta.gloss).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                Meter(value: v, color: Theme.primaryColors[id] ?? Theme.accent).frame(width: 84)
                Text(percent(v)).font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 40, alignment: .trailing)
            }
            .padding(.vertical, 6).padding(.horizontal, 6)
            .background(active ? Theme.accent.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 10))
            .opacity(v < 0.15 && !active ? 0.55 : 1)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Face (action units)

private struct FaceList: View {
    let output: FrameResult?
    let cm: CompiledModel
    let fps: Double

    private let regionOrder = ["brows", "eyes", "cheeks", "nose", "mouth", "chin", "jaw", "head", "gaze"]

    var body: some View {
        let o = output
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            stat(o.map { "\(Int($0.pose.pitch))° \(Int($0.pose.yaw))° \(Int($0.pose.roll))°" } ?? "–", "head pitch / yaw / roll")
            stat("\(o?.blinkRate ?? 0)", "blinks per minute")
            stat(percent(o?.perclos ?? 0), "eyelid closure (PERCLOS)")
            stat(String(format: "%.1f", o?.pspi ?? 0), "pain index (PSPI, 0–16)")
            stat(String(format: "%.0f", fps), "frames per second")
            stat(o?.calibrated == true ? "calibrated" : "learning", "baseline")
        }
        .padding(.top, 8)

        let channels = Set(cm.channels.map(\.au))
        ForEach(regionOrder, id: \.self) { region in
            let ids = cm.auIds.filter { cm.model.aus[$0]?.region == region && channels.contains($0) }
            if !ids.isEmpty {
                GroupTitle(text: cm.model.regions[region] ?? region)
                ForEach(ids, id: \.self) { id in
                    let au = cm.model.aus[id]!
                    let v = o?.aus[id] ?? 0
                    HStack(spacing: 10) {
                        Text(id.hasPrefix("AU") ? id : "gaze").font(.caption.monospaced()).foregroundStyle(Theme.accent).frame(width: 46, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(au.name).font(.subheadline)
                            Text(au.muscles).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Meter(value: v).frame(width: 84)
                        Text("\(Int((v * 100).rounded()))").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 32, alignment: .trailing)
                    }
                    .padding(.vertical, 5).padding(.horizontal, 6)
                    .opacity(v < 0.1 ? 0.55 : 1)
                }
            }
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Why

private struct WhyView: View {
    let output: FrameResult?
    let engine: EmotionEngine
    @Binding var selected: String?

    var body: some View {
        let live = output.map { $0.primary.id != "neutral" ? $0.primary.id : ($0.complex.first?.id ?? "neutral") } ?? "neutral"
        let id = selected ?? live
        let meta = ExpressionMeta(id, engine.cm)
        let choices = liveChoices()

        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                chip("Follow live", active: selected == nil) { selected = nil }
                ForEach(choices, id: \.self) { c in
                    let m = ExpressionMeta(c, engine.cm)
                    chip("\(m.emoji) \(m.name)", active: selected == c) { selected = c }
                }
            }
            .padding(.vertical, 8)
        }

        HStack(spacing: 12) {
            Text(meta.emoji).font(.system(size: 36))
            VStack(alignment: .leading, spacing: 2) {
                Text(id == "neutral" ? meta.name : "\(meta.name) · \(percent(output?.scores[id] ?? 0))").font(.title3.bold())
                Text(meta.gloss).font(.footnote).foregroundStyle(.secondary)
            }
        }

        if let e = engine.cm.byId[id] {
            GroupTitle(text: engine.cm.model.tiers[e.tier] ?? e.tier)
            Text(e.cues)
                .font(.subheadline)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
            let why = engine.explain(id)
            if !why.variant.isEmpty {
                Text("Best-matching configuration: \(why.variant)").font(.caption).foregroundStyle(.secondary).padding(.top, 4)
            }
            section("Defining actions", why.slots.filter { $0.kind == .core }, mark: "✓", color: Theme.good)
            section("Supporting actions", why.slots.filter { $0.kind == .support }, mark: "+", color: Theme.accent)
            section("Actions that argue against it", why.slots.filter { $0.kind == .inhibit }, mark: "✗", color: Theme.bad)
            GroupTitle(text: "Research")
            ForEach(Array(e.refs.enumerated()), id: \.offset) { item in
                Text("\(item.offset + 1). \(engine.cm.model.references[item.element] ?? item.element)").font(.caption2).foregroundStyle(.secondary).padding(.vertical, 2)
            }
        } else {
            Text("No configuration of facial actions stands out from your baseline. Active muscle actions are listed on the Face tab.")
                .font(.subheadline)
                .padding(10)
                .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private func liveChoices() -> [String] {
        guard let o = output else { return [] }
        let ids = [o.primary.id] + o.complex.map(\.id)
        return Array(Set(ids.filter { $0 != "neutral" })).sorted()
    }

    @ViewBuilder
    private func section(_ title: String, _ slots: [SlotExplanation], mark: String, color: Color) -> some View {
        if !slots.isEmpty {
            GroupTitle(text: title)
            ForEach(Array(slots.enumerated()), id: \.offset) { item in
                let s = item.element
                let label = featureLabel(s.best, engine.cm.model)
                HStack(spacing: 8) {
                    Text(s.evidence >= 0.5 ? mark : "·").frame(width: 18)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(label.code.hasPrefix("AU") ? "\(label.code) \(label.name)" : label.name).font(.subheadline)
                        if s.features.count > 1 {
                            Text("any of " + s.features.map { featureLabel($0, engine.cm.model).code }.joined(separator: ", "))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 8)
                    Meter(value: s.evidence, color: color).frame(width: 76)
                    Text(percent(s.value)).font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 40, alignment: .trailing)
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func chip(_ text: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.caption)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.surface2, in: Capsule())
                .overlay(Capsule().stroke(active ? Theme.accent : Color.white.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Log

private struct LogView: View {
    let events: [LoggedEvent]
    let timeline: [(t: TimeInterval, id: String)]

    var body: some View {
        GroupTitle(text: "Last 60 seconds")
        Canvas { ctx, size in
            guard let last = timeline.last?.t else { return }
            for (a, b) in zip(timeline, timeline.dropFirst()) where !a.id.isEmpty {
                let x0 = size.width - CGFloat((last - a.t) / 60) * size.width
                let x1 = size.width - CGFloat((last - b.t) / 60) * size.width
                let tall: CGFloat = a.id == "neutral" ? 0.3 : 1
                let rect = CGRect(x: x0, y: size.height * (1 - tall), width: max(1, x1 - x0 + 0.5), height: size.height * tall)
                ctx.fill(Path(rect), with: .color(Theme.primaryColors[a.id] ?? .gray))
            }
        }
        .frame(height: 56)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 8))

        GroupTitle(text: "Brief expressions & events")
        if events.isEmpty {
            Text("Nothing yet. Brief expressions and yawns will appear here.").font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 10)
        }
        ForEach(events) { e in
            HStack(spacing: 10) {
                Text(e.date, style: .time).font(.caption.monospaced()).foregroundStyle(.secondary)
                Text("\(e.emoji) \(e.title)").font(.subheadline)
                Spacer()
                Text(e.detail).font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 6)
            Divider()
        }
        Text("Brief expressions flash on and off within half a second (Ekman's micro-expressions last 1/25–1/5 s; Yan et al. 2013 put the upper bound near 500 ms). TrueDepth tracking at 60 fps catches the slower ones.")
            .font(.caption2).foregroundStyle(.secondary).padding(.top, 10)
    }
}
