import Foundation

/// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): cutoff rises with speed,
/// removing jitter at rest while following fast expression onsets.
public final class OneEuroFilter {
    private var x: Double?
    private var dx = 0.0
    private var t = 0.0
    private let minCutoff: Double
    private let beta: Double
    private let dCutoff: Double

    public init(minCutoff: Double, beta: Double, dCutoff: Double) {
        self.minCutoff = minCutoff
        self.beta = beta
        self.dCutoff = dCutoff
    }

    private static func alpha(_ cutoff: Double, _ dt: Double) -> Double {
        let tau = 1 / (2 * Double.pi * cutoff)
        return 1 / (1 + tau / dt)
    }

    /// - Parameter t: time in seconds
    public func filter(_ value: Double, _ t: Double) -> Double {
        guard let prev = x else {
            x = value
            self.t = t
            return value
        }
        let dt = t - self.t
        if dt <= 0 { return prev }
        self.t = t
        let aD = Self.alpha(dCutoff, dt)
        dx = aD * ((value - prev) / dt) + (1 - aD) * dx
        let cutoff = minCutoff + beta * abs(dx)
        let a = Self.alpha(cutoff, dt)
        let next = a * value + (1 - a) * prev
        x = next
        return next
    }

    public func reset() {
        x = nil
        dx = 0
    }
}

@inline(__always) func emaAlpha(_ dt: Double, _ tau: Double) -> Double {
    tau <= 0 ? 1 : 1 - exp(-dt / tau)
}

@inline(__always) func clamp01(_ x: Double) -> Double {
    x < 0 ? 0 : (x > 1 ? 1 : x)
}

@inline(__always) func smoothstep(_ lo: Double, _ hi: Double, _ x: Double) -> Double {
    let t = clamp01((x - lo) / (hi - lo))
    return t * t * (3 - 2 * t)
}

@inline(__always) func sign(_ x: Double) -> Double {
    x > 0 ? 1 : (x < 0 ? -1 : 0)
}
