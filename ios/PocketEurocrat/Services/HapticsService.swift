import CoreHaptics
import UIKit

/// Core Haptics for the REFUSÉ stamp: sharp slam + decaying rumble. Falls back to UIKit
/// feedback where the engine is unsupported (simulator, old devices).
final class HapticsService {
    private var engine: CHHapticEngine?
    private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    init() { prepare() }

    private func prepare() {
        guard supported else { return }
        do {
            let e = try CHHapticEngine()
            e.isAutoShutdownEnabled = true
            e.resetHandler = { [weak self] in self?.prepare() }
            try e.start()
            engine = e
        } catch {
            engine = nil
            print("haptics: engine start failed: \(error)")
        }
    }

    func stamp() {
        guard let engine else { UIImpactFeedbackGenerator(style: .heavy).impactOccurred(); return }
        let slam = CHHapticEvent(eventType: .hapticTransient, parameters: [
            .init(parameterID: .hapticIntensity, value: 1.0),
            .init(parameterID: .hapticSharpness, value: 0.9),
        ], relativeTime: 0)
        let thud = CHHapticEvent(eventType: .hapticContinuous, parameters: [
            .init(parameterID: .hapticIntensity, value: 0.8),
            .init(parameterID: .hapticSharpness, value: 0.15),
        ], relativeTime: 0.02, duration: 0.35)
        let fade = CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
            .init(relativeTime: 0, value: 1), .init(relativeTime: 0.35, value: 0),
        ], relativeTime: 0.02)
        play(engine, events: [slam, thud], curves: [fade])
    }

    /// One tick per fine; heavier for bigger fines.
    func fineTick(strength: Float) {
        guard let engine else { UIImpactFeedbackGenerator(style: .medium).impactOccurred(intensity: CGFloat(strength)); return }
        let tick = CHHapticEvent(eventType: .hapticTransient, parameters: [
            .init(parameterID: .hapticIntensity, value: min(max(strength, 0.2), 1)),
            .init(parameterID: .hapticSharpness, value: 0.7),
        ], relativeTime: 0)
        play(engine, events: [tick], curves: [])
    }

    /// Meltdown: a growing crackle-rumble for `seconds`.
    func rumble(seconds: Double) {
        guard let engine else {
            let g = UINotificationFeedbackGenerator()
            g.notificationOccurred(.error)
            return
        }
        let base = CHHapticEvent(eventType: .hapticContinuous, parameters: [
            .init(parameterID: .hapticIntensity, value: 0.5),
            .init(parameterID: .hapticSharpness, value: 0.25),
        ], relativeTime: 0, duration: seconds)
        let swell = CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
            .init(relativeTime: 0, value: 0.3), .init(relativeTime: seconds * 0.8, value: 1), .init(relativeTime: seconds, value: 0.2),
        ], relativeTime: 0)
        var events = [base]
        var t = 0.1
        while t < seconds {   // crackle
            events.append(CHHapticEvent(eventType: .hapticTransient, parameters: [
                .init(parameterID: .hapticIntensity, value: Float.random(in: 0.4...1)),
                .init(parameterID: .hapticSharpness, value: Float.random(in: 0.5...1)),
            ], relativeTime: t))
            t += Double.random(in: 0.06...0.18)
        }
        play(engine, events: events, curves: [swell])
    }

    /// Light tick when the official hits a wall.
    func bump(strength: Float) {
        guard let engine else { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: CGFloat(strength)); return }
        let tick = CHHapticEvent(eventType: .hapticTransient, parameters: [
            .init(parameterID: .hapticIntensity, value: min(max(strength, 0.1), 1)),
            .init(parameterID: .hapticSharpness, value: 0.5),
        ], relativeTime: 0)
        play(engine, events: [tick], curves: [])
    }

    private func play(_ engine: CHHapticEngine, events: [CHHapticEvent], curves: [CHHapticParameterCurve]) {
        do {
            let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
            try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
        } catch {
            print("haptics: play failed: \(error)")
        }
    }
}
