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
