import Foundation

public enum EngineEvent: Equatable, Sendable {
    case blink(tMs: Double, durationMs: Double)
    case yawn(tMs: Double, durationMs: Double)
    case micro(tMs: Double, id: String, peak: Double, durationMs: Double)

    /// Compact form used by the parity fixtures ("blink", "yawn", "micro:surprise").
    public var tag: String {
        switch self {
        case .blink: return "blink"
        case .yawn: return "yawn"
        case .micro(_, let id, _, _): return "micro:\(id)"
        }
    }
}

/// Blinks, PERCLOS, yawns and head stillness (mirrors web/src/engine/temporal.ts). Times in seconds.
final class TemporalFeatures {
    private let p: ModelParams
    private var eyeClosedSince: Double?
    private var blinkTimes: [Double] = []
    private var perclosBuf: [(t: Double, dt: Double, closed: Bool)] = []
    private var perclosClosed = 0.0
    private var perclosTotal = 0.0
    private var yawnOpenSince: Double?
    private var yawnPeak = 0.0
    private var yawnClosedAt = -Double.infinity
    private var lastPose: (Double, Double, Double)?
    private var speed = 0.0

    private(set) var perclos = 0.0
    private(set) var yawn = 0.0
    private(set) var still = 1.0

    init(_ p: ModelParams) { self.p = p }

    func reset() {
        eyeClosedSince = nil
        yawnOpenSince = nil
        lastPose = nil
    }

    func update(t: Double, dt: Double, eyesClosed: Double, squeeze: Double, mouthStretch: Double, pose: (Double, Double, Double)) -> [EngineEvent] {
        var events: [EngineEvent] = []

        if let since = eyeClosedSince {
            if eyesClosed <= p.blink.off {
                let ms = (t - since) * 1000
                if ms >= p.blink.minMs && ms <= p.blink.maxMs {
                    events.append(.blink(tMs: t * 1000, durationMs: ms))
                    blinkTimes.append(t)
                }
                eyeClosedSince = nil
            }
        } else if eyesClosed >= p.blink.on {
            eyeClosedSince = t
        }
        while let first = blinkTimes.first, t - first > 60 { blinkTimes.removeFirst() }

        if dt > 0 && dt < 1 {
            let closed = eyesClosed >= p.perclos.closed && squeeze < p.perclos.maxSqueeze
            perclosBuf.append((t, dt, closed))
            perclosTotal += dt
            if closed { perclosClosed += dt }
            while let first = perclosBuf.first, t - first.t > p.perclos.windowSec {
                perclosBuf.removeFirst()
                perclosTotal -= first.dt
                if first.closed { perclosClosed -= first.dt }
            }
            perclos = perclosClosed / max(perclosTotal, 20)
        }

        if mouthStretch >= p.yawn.open {
            if yawnOpenSince == nil { yawnOpenSince = t }
            let d = t - yawnOpenSince!
            yawn = smoothstep(p.yawn.startSec, p.yawn.fullSec, d)
            yawnPeak = max(yawnPeak, yawn)
        } else {
            if let since = yawnOpenSince {
                let d = t - since
                if d >= p.yawn.startSec + 0.2 { events.append(.yawn(tMs: t * 1000, durationMs: d * 1000)) }
                yawnOpenSince = nil
                yawnClosedAt = t
            }
            let fade = max(0, 1 - (t - yawnClosedAt) / p.yawn.holdSec)
            yawn = yawnPeak * fade
            if fade == 0 { yawnPeak = 0 }
        }

        if let (a, b, c) = lastPose, dt > 0, dt < 1 {
            let v = hypot3(pose.0 - a, pose.1 - b, pose.2 - c) / dt
            speed += (v - speed) * emaAlpha(dt, p.stillness.tau)
            still = exp(-speed / p.stillness.degPerSec)
        }
        lastPose = pose
        return events
    }

    var blinkRate: Int { blinkTimes.count }
    var blinking: Bool { eyeClosedSince != nil }
}

@inline(__always) func hypot3(_ x: Double, _ y: Double, _ z: Double) -> Double {
    (x * x + y * y + z * z).squareRoot()
}

/// Brief (micro) expressions: on/off within `maxMs` after a quiet period.
final class MicroExpressionDetector {
    private struct State {
        var quietStart: Double
        var quietEnd: Double?
        var activeStart: Double?
        var peak: Double
        var blinked: Bool
    }
    private let p: ModelParams.Micro
    private var state: [String: State] = [:]

    init(_ p: ModelParams.Micro) { self.p = p }

    func reset() { state.removeAll() }

    /// `scores` must be in model expression order so events come out in a stable order.
    func update(t: Double, scores: [(String, Double)], blinking: Bool) -> [EngineEvent] {
        var events: [EngineEvent] = []
        for (id, s) in scores {
            var st = state[id] ?? State(quietStart: t, quietEnd: nil, activeStart: nil, peak: 0, blinked: false)
            if let activeStart = st.activeStart {
                st.peak = max(st.peak, s)
                st.blinked = st.blinked || blinking
                if s < p.off {
                    let ms = (t - activeStart) * 1000
                    if ms >= p.minMs && ms <= p.maxMs && st.peak >= p.minPeak && !st.blinked {
                        events.append(.micro(tMs: t * 1000, id: id, peak: st.peak, durationMs: ms))
                    }
                    st.activeStart = nil
                    st.quietStart = t
                    st.quietEnd = nil
                }
            } else if s < p.off {
                if st.quietEnd != nil {
                    st.quietStart = t
                    st.quietEnd = nil
                }
            } else {
                if st.quietEnd == nil { st.quietEnd = t }
                let quiet = (st.quietEnd! - st.quietStart) * 1000
                let rise = (t - st.quietEnd!) * 1000
                if s >= p.on && quiet >= p.quietMs && rise <= 150 {
                    st.activeStart = st.quietEnd
                    st.peak = s
                    st.blinked = blinking
                }
            }
            state[id] = st
        }
        return events
    }
}
