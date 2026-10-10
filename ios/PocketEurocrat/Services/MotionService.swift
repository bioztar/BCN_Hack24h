import CoreMotion

/// CoreMotion wrapper: streams the gravity vector (device axes) and detects shakes.
/// No-ops on the simulator (no motion hardware) — use the debug buttons there.
final class MotionService {
    var onGravity: ((_ x: Double, _ y: Double) -> Void)?
    var onShake: (() -> Void)?

    /// userAcceleration magnitude (g) that counts as a shake; calibration knob.
    var shakeThreshold = 2.0
    private let shakeCooldown: TimeInterval = 0.9
    private var lastShake = Date.distantPast
    private let manager = CMMotionManager()

    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let m = motion else { return }
            onGravity?(m.gravity.x, m.gravity.y)
            let a = m.userAcceleration
            let mag = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot()
            if mag > shakeThreshold, Date().timeIntervalSince(lastShake) > shakeCooldown {
                lastShake = Date()
                onShake?()
            }
        }
    }

    func stop() { manager.stopDeviceMotionUpdates() }
}
