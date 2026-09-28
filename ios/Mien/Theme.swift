import EmotionEngine
import SwiftUI

enum Theme {
    static let background = Color(red: 0.043, green: 0.051, blue: 0.071)
    static let surface = Color(red: 0.078, green: 0.094, blue: 0.129)
    static let surface2 = Color(red: 0.110, green: 0.129, blue: 0.173)
    static let accent = Color(red: 0.486, green: 0.612, blue: 1.0)
    static let good = Color(red: 0.243, green: 0.812, blue: 0.557)
    static let warn = Color(red: 0.961, green: 0.725, blue: 0.259)
    static let bad = Color(red: 1.0, green: 0.42, blue: 0.42)

    static let primaryColors: [String: Color] = [
        "neutral": Color(red: 0.435, green: 0.471, blue: 0.525),
        "happiness": Color(red: 0.961, green: 0.773, blue: 0.259),
        "sadness": Color(red: 0.290, green: 0.565, blue: 0.886),
        "surprise": Color(red: 0.702, green: 0.420, blue: 1.0),
        "fear": Color(red: 0.247, green: 0.757, blue: 0.690),
        "anger": Color(red: 1.0, green: 0.353, blue: 0.373),
        "disgust": Color(red: 0.482, green: 0.753, blue: 0.263),
        "contempt": Color(red: 1.0, green: 0.624, blue: 0.110),
    ]

    static func tierColor(_ tier: String) -> Color {
        switch tier {
        case "social": return good
        case "cognitive": return warn
        case "physical": return bad
        default: return accent
        }
    }
}

/// Display metadata for an expression id, including the synthetic "neutral".
struct ExpressionMeta {
    let id: String
    let name: String
    let emoji: String
    let gloss: String
    let tier: String

    init(_ id: String, _ cm: CompiledModel) {
        if let e = cm.byId[id] {
            self.id = id; name = e.name; emoji = e.emoji; gloss = e.gloss; tier = e.tier
        } else {
            self.id = "neutral"; name = "Neutral"; emoji = "😐"; gloss = "No expression stands out from your baseline."; tier = "primary"
        }
    }
}

func percent(_ v: Double) -> String { "\(Int((v * 100).rounded()))%" }

/// Human label for a feature such as "AU12", "AU14U", "GAZE_DOWN" or "PERCLOS".
func featureLabel(_ f: String, _ model: EmotionModel) -> (code: String, name: String) {
    let suffixes: [Character: String] = ["L": " (left)", "R": " (right)", "U": " (one-sided)", "B": " (both sides)"]
    if f.hasPrefix("AU") {
        var base = f
        var suffix = ""
        if let last = f.last, let s = suffixes[last], model.aus[String(f.dropLast())] != nil {
            base = String(f.dropLast())
            suffix = s
        }
        return (base, (model.aus[base]?.name ?? base) + suffix)
    }
    if let au = model.aus[f] { return ("gaze", au.name) }
    if let t = model.temporal[f] { return (f == "PERCLOS" ? "PERCLOS" : "time", t.name) }
    return (f, f)
}

struct Meter: View {
    var value: Double
    var color: Color = Theme.accent
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.12))
                Capsule().fill(color).frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: height)
        .animation(.linear(duration: 0.12), value: value)
    }
}
