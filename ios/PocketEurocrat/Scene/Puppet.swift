import SceneKit
import SpriteKit
import UIKit

struct PuppetTuning {
    var leanGain: CGFloat = 0.9            // rad of lean per 1 g of sideways gravity
    var toppleThreshold: CGFloat = 0.55    // |gravity.x| that tips it over (~33° of tilt)
    var recoverThreshold: CGFloat = 0.3
    var recoverDelay: TimeInterval = 1.4   // lies down at least this long
}

/// One officer: a photo-relief bust on a weighted pivot (bobblehead / punching-clown).
/// Tilt leans it on a hand-integrated spring; past the topple threshold it falls sideways, lies there
/// (appalled), then rights itself. The bust is a SceneKit mesh rendered by an SK3DNode under `node`.
final class Puppet {
    private enum Stance: Equatable { case upright, down(dir: CGFloat) }   // dir +1 = fell to the right

    /// Scene-space container; its origin is the base of the bust (the pivot).
    let node = SKNode()
    var onImpact: ((Float) -> Void)?
    var onDownChange: (() -> Void)?

    private(set) var persona: Persona
    private(set) var isDown = false
    var expression: DummyScene.Expression = .neutral { didSet { if oldValue != expression { refreshFigure() } } }

    /// 0 = listening, 0.5 = nobody speaking, 1 = speaking. Speaker leans in and gets the light.
    var focus: CGFloat = 0.5
    /// Where the head turns: -1 left ... +1 right (towards the officer who is speaking). 0 = camera.
    var look: CGFloat = 0
    /// Scene gravity y (about -1 with the phone upright); drives pitch and light.
    var gravityY: CGFloat = -1
    var talkTarget: CGFloat = 0
    /// Per-puppet spring so a duo never moves in lockstep.
    var stiffness: CGFloat = 49
    var toppleBias: CGFloat = 0

    private let view3D = SK3DNode(viewportSize: CGSize(width: 100, height: 100))
    private let figureScene = SCNScene()
    private let figureHolder = SCNNode()
    private let ambient = SCNNode()
    private let key = SCNNode()
    private let rim = SCNNode()
    private var headNode: SCNNode?
    private var mouthMaterials: [SCNMaterial] = []
    private var lookNow: CGFloat = 0
    /// Lip sync: targets come from the audio analysis, the live values are smoothed (fast attack, slower release).
    var mouthTarget: CGFloat = 0
    var mouthWideTarget: CGFloat = 1
    private var mouthOpen: CGFloat = 0
    private var mouthWide: CGFloat = 1
    /// Soft contact shadow on the floor under the bust.
    private let shadow = SKShapeNode()
    private var figure: SCNNode?
    private let spin = SKNode()   // leans/topples; child of `node`, holds the 3D node

    private var stance: Stance = .upright
    private var theta: CGFloat = 0
    private var omega: CGFloat = 0
    private var shift: CGFloat = 0
    private var downSince: TimeInterval = 0
    private var impacted = false
    private var talk: CGFloat = 0
    private var focusNow: CGFloat = 0.5
    private(set) var bustH: CGFloat = 0
    private var bustW: CGFloat = 0
    private var baseX: CGFloat = 0

    init(persona: Persona) {
        self.persona = persona
        buildFigureScene()
        shadow.fillColor = .black
        shadow.strokeColor = .clear
        shadow.zPosition = -1
        node.addChild(shadow)
        spin.addChild(view3D)
        node.addChild(spin)
        refreshFigure()
    }

    func setPersona(_ p: Persona) {
        guard p.id != persona.id else { return }
        persona = p
        refreshFigure()
    }

    // MARK: layout

    /// `centerX`: scene x of the base when upright. `width`: on-screen width of the cut-out.
    func layout(centerX: CGFloat, floorY: CGFloat, width: CGFloat) {
        baseX = centerX
        bustW = width
        bustH = width * 4 / 3
        node.position = CGPoint(x: centerX + shift, y: floorY)
        // Figure is 2.0 units tall inside a 2.2-unit-tall viewport; cut-outs are 3:4.
        view3D.viewportSize = CGSize(width: width * 1.2, height: bustH * 1.1)
        view3D.position = CGPoint(x: 0, y: bustH / 2)   // image bottom edge sits on the pivot
        shadow.path = CGPath(ellipseIn: CGRect(x: -width * 0.45, y: -14, width: width * 0.9, height: 28), transform: nil)
    }

    // MARK: simulation

    func kick() {
        omega += CGFloat.random(in: -6...6)
        stance = .upright
        syncDown()
    }

    func step(dt: CGFloat, now: TimeInterval, gx: CGFloat, tuning t: PuppetTuning, sceneWidth: CGFloat) {
        updateStance(now: now, gx: gx, tuning: t)

        let target: CGFloat, k: CGFloat, zeta: CGFloat
        switch stance {
        case .upright: target = -min(max(gx * t.leanGain, -0.55), 0.55); k = stiffness; zeta = 0.22
        case .down(let d): target = -d * 1.5; k = 40; zeta = 0.15
        }
        let c = 2 * zeta * k.squareRoot()
        for _ in 0..<2 {
            let h = dt / 2
            omega += (-k * (theta - target) - c * omega) * h
            theta += omega * h
            if abs(theta) > 1.5 { theta = 1.5 * (theta < 0 ? -1 : 1); omega *= -0.3 }   // floor
        }
        if case .down = stance, !impacted, abs(theta) > 1.35 {
            impacted = true
            onImpact?(0.9)
        }

        var shiftTarget: CGFloat = 0
        if case .down(let d) = stance {
            // Lying, the bust reaches ~0.95 of its height sideways: slide the base so it stays on screen.
            let reach = bustH * 0.95
            if d > 0 { shiftTarget = min(0, sceneWidth * 0.97 - reach - baseX) }
            else { shiftTarget = max(0, sceneWidth * 0.03 + reach - baseX) }
        }
        shift += (shiftTarget - shift) * min(1, dt * 6)
        talk += (talkTarget - talk) * min(1, dt * 20)
        let rate: CGFloat = mouthTarget > mouthOpen ? 40 : 18   // snappy open, softer close
        mouthOpen += (mouthTarget - mouthOpen) * min(1, dt * rate)
        mouthWide += (mouthWideTarget - mouthWide) * min(1, dt * 20)
        charNow = burning ? min(0.7, charNow + dt / 12) : max(0, charNow - dt)   // slow char-darkening, recovers fast
        stepCrossfade(dt: dt)
        if burning, case .upright = stance {
            panicClock += dt
            if panicClock > 0.14 { panicClock = 0; omega += CGFloat.random(in: -1.6...1.6) }   // frantic flailing
        }
        applyMouth()
        focusNow += (focus - focusNow) * min(1, dt * 8)

        node.position.x = baseX + shift
        node.zPosition = 1 + focusNow
        let grow = 1 + 0.1 * (focusNow - 0.5)
        spin.zRotation = theta + sin(CGFloat(now) * 14) * 0.03 * talk
        spin.setScale(grow)
        spin.yScale = grow * (1 + 0.04 * talk)
        apply3D(now: now, gx: gx)
    }

    /// The 3D read: the whole figure yaws/pitches with the phone's tilt (parallax), the lights swing with it so
    /// the face shades, the head turns independently on the neck, and it breathes.
    private func apply3D(now: TimeInterval, gx: CGFloat) {
        let t = CGFloat(now)
        let tiltYaw = min(max(gx * 0.8, -0.7), 0.7)
        let tiltPitch = min(max((-gravityY - 0.9) * 1.0, -0.3), 0.3)   // phone leaned back/forward
        let breathe = sin(t * 1.7)
        figureHolder.eulerAngles = SCNVector3(
            Float(tiltPitch - 0.015 * breathe),
            Float(tiltYaw - theta * 0.35 + sin(t * 0.9) * 0.08),
            0)
        figureHolder.scale = SCNVector3(1, Float(1 + 0.008 * breathe), 1)

        lookNow += (look - lookNow) * min(1, 0.06)
        headNode?.eulerAngles = SCNVector3(
            Float(-0.14 * talk + 0.04 * sin(t * 1.3)),             // nods when talking
            Float(lookNow * 0.4 - tiltYaw * 0.3 + 0.12 * talk * sin(t * 6)),   // turns to the other officer
            Float(-theta * 0.15))                                  // head cants a little with the lean

        key.eulerAngles = SCNVector3(Float(-0.5 + (gravityY + 0.9) * 0.6), Float(-0.6 - gx * 1.0), 0)
        rim.eulerAngles = SCNVector3(-0.2, Float(.pi - 0.5 - gx * 0.8), 0)
        ambient.light?.intensity = 330 + 300 * focusNow
        key.light?.intensity = 750 + 400 * focusNow
        shadow.xScale = 1 + 0.15 * abs(sin(theta))
        shadow.alpha = 0.18 + 0.2 * focusNow
    }

    private func updateStance(now: TimeInterval, gx: CGFloat, tuning t: PuppetTuning) {
        let topple = t.toppleThreshold + toppleBias
        switch stance {
        case .upright:
            if abs(gx) > topple { fall(dir: gx > 0 ? 1 : -1, now: now) }
        case .down(let d):
            if gx * d < 0, abs(gx) > topple { fall(dir: -d, now: now) }   // rolled to the other side
            else if abs(gx) < t.recoverThreshold, now - downSince > t.recoverDelay { stance = .upright; syncDown() }
        }
    }

    private func fall(dir: CGFloat, now: TimeInterval) {
        stance = .down(dir: dir)
        downSince = now
        impacted = false
        omega += -dir * 1.5   // initial shove
        syncDown()
    }

    private func syncDown() {
        let down = stance != .upright
        guard down != isDown else { return }
        isDown = down
        refreshFigure()
        onDownChange?()
    }

    // MARK: meltdown

    private var burning = false
    private var charNow: CGFloat = 0
    private var panicClock: CGFloat = 0
    private var fireNodes: [SCNNode] = []

    /// Particle fire in front of the bust (SceneKit particles inside the figure scene, so they are depth-sorted
    /// with the relief — SpriteKit emitters get painted over by the SK3DNode), plus soot, a crossfade to the
    /// "burning" cut-out and a frantic wobble.
    func ignite() {
        guard !burning else { return }
        burning = true
        refreshFigure(crossfade: true)

        // Flames lick up from the bottom edge of the bust (figure is 2.0 tall, bottom at y = -1).
        fireNodes.append(emitter(y: -1.0, width: 1.7, rate: 40, speed: 2.4, size: 0.5, life: 1.0, spread: 14,
                                 colors: [(1, 0.95, 0.55), (1, 0.55, 0.08), (0.75, 0.15, 0.02), (0.15, 0.05, 0.03)], additive: true))
        fireNodes.append(emitter(y: -0.9, width: 1.1, rate: 18, speed: 3.0, size: 0.35, life: 0.8, spread: 8,   // hot core
                                 colors: [(1, 1, 0.8), (1, 0.85, 0.3), (1, 0.45, 0.05), (0.3, 0.08, 0.02)], additive: true))
        fireNodes.append(emitter(y: -0.2, width: 0.9, rate: 22, speed: 1.1, size: 0.7, life: 2.6, spread: 24,   // smoke
                                 colors: [(0.28, 0.27, 0.27), (0.2, 0.2, 0.2), (0.12, 0.12, 0.12), (0.08, 0.08, 0.08)], additive: false))
    }

    func extinguish() {
        guard burning else { return }
        burning = false
        fireNodes.forEach { $0.removeFromParentNode() }
        fireNodes = []
        refreshFigure()
    }

    private func emitter(y: Float, width: CGFloat, rate: CGFloat, speed: CGFloat, size: CGFloat, life: Double,
                         spread: CGFloat, colors: [(CGFloat, CGFloat, CGFloat)], additive: Bool) -> SCNNode {
        let ps = SCNParticleSystem()
        ps.particleImage = Puppet.flameImage
        ps.birthRate = rate
        ps.particleLifeSpan = CGFloat(life)
        ps.particleLifeSpanVariation = CGFloat(life) * 0.4
        ps.emitterShape = SCNPlane(width: width, height: 0.08)
        ps.emittingDirection = SCNVector3(0, 1, 0)
        ps.spreadingAngle = spread
        ps.particleVelocity = speed
        ps.particleVelocityVariation = speed * 0.4
        ps.particleSize = size
        ps.particleSizeVariation = size * 0.3
        ps.stretchFactor = additive ? 0.22 : 0
        ps.blendMode = additive ? .additive : .alpha
        ps.isLightingEnabled = false
        ps.isAffectedByGravity = false
        ps.loops = true
        let color = CAKeyframeAnimation()
        color.values = colors.map { UIColor(red: $0.0, green: $0.1, blue: $0.2, alpha: 1) }
        color.keyTimes = [0, 0.25, 0.65, 1]
        let alpha = CAKeyframeAnimation()
        alpha.values = additive ? [0.0, 0.55, 0.35, 0.0] : [0.0, 0.35, 0.3, 0.0]
        alpha.keyTimes = [0, 0.12, 0.6, 1]
        let scale = CAKeyframeAnimation()
        scale.values = (additive ? [0.5, 1.0, 0.45] : [0.5, 1.0, 1.7]).map { $0 * size }   // absolute sizes: flames taper, smoke billows
        scale.keyTimes = [0, 0.3, 1]
        ps.propertyControllers = [
            .color: SCNParticlePropertyController(animation: color),
            .opacity: SCNParticlePropertyController(animation: alpha),
            .size: SCNParticlePropertyController(animation: scale),
        ]
        let n = SCNNode()
        n.position = SCNVector3(0, y, 1.1)   // in front of the nearest relief point (≤ 0.9)
        n.addParticleSystem(ps)
        figureScene.rootNode.addChildNode(n)
        return n
    }

    /// Soft flame-shaped blob (bright base, tapered tip) used for every particle; tinted by the colour controller.
    private static let flameImage: UIImage = {
        // 64 x 96: a teardrop, widest and brightest near the bottom, soft all round, fading to a point at the top.
        let size = CGSize(width: 64, height: 96)
        return UIGraphicsImageRenderer(size: size).image { r in
            let g = r.cgContext
            let colors = [UIColor.white.cgColor, UIColor(white: 1, alpha: 0).cgColor] as CFArray
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            g.translateBy(x: 0, y: 0)
            g.saveGState()
            g.scaleBy(x: 1, y: 1.5)   // stretch the radial gradient into a tall ellipse
            g.drawRadialGradient(grad, startCenter: CGPoint(x: 32, y: 44), startRadius: 0,
                                 endCenter: CGPoint(x: 32, y: 44), endRadius: 32, options: [])
            g.restoreGState()
        }
    }()

    // MARK: figure

    /// What is actually shown: burning wins (meltdown), then lying-on-the-floor, then the requested face;
    /// extra cut-outs that are not bundled for this officer fall back to `appalled`.
    private var shownExpression: DummyScene.Expression {
        var e: DummyScene.Expression = burning ? .burning : (isDown ? .appalled : expression)
        if (e == .burning || e == .outrage), !CutoutStore.has(officer: persona, expression: e) { e = .appalled }
        return e
    }

    /// `crossfade`: blend from the current figure to the new one (used when the officer catches fire).
    private func refreshFigure(crossfade: Bool = false) {
        let n = ReliefFigure.node(officer: persona, expression: shownExpression)
        if let stale = fadingOut { stale.removeFromParentNode(); fadingOut = nil }
        if crossfade, let old = figure {
            fadingOut = old
            fadeT = 0
            n.opacity = 0
        } else {
            figure?.removeFromParentNode()
        }
        figureHolder.addChildNode(n)
        figure = n
        headNode = n.childNode(withName: "head", recursively: false)
        mouthMaterials = n.childNodes.compactMap { $0.geometry?.firstMaterial }
    }

    private var fadingOut: SCNNode?
    private var fadeT: CGFloat = 1

    private func stepCrossfade(dt: CGFloat) {
        guard let old = fadingOut, let new = figure else { return }
        fadeT = min(1, fadeT + dt / 1.1)
        new.opacity = fadeT
        old.opacity = 1 - fadeT
        if fadeT >= 1 { old.removeFromParentNode(); fadingOut = nil; new.opacity = 1 }
    }

    private func applyMouth() {
        for m in mouthMaterials {   // head and body share one material; setting twice is harmless
            m.setValue(NSNumber(value: Float(mouthOpen)), forKey: "mouthOpen")
            m.setValue(NSNumber(value: Float(mouthWide)), forKey: "mouthWide")
            m.setValue(NSNumber(value: Float(charNow)), forKey: "charAmount")
        }
    }

    private func buildFigureScene() {
        figureScene.rootNode.addChildNode(figureHolder)
        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.fieldOfView = 25
        camera.position = SCNVector3(0, 0, 5)
        figureScene.rootNode.addChildNode(camera)
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 625
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 850
        key.eulerAngles = SCNVector3(-0.5, -0.6, 0)
        rim.light = SCNLight()
        rim.light?.type = .directional                        // from behind: rims the silhouette
        rim.light?.intensity = 700
        rim.light?.color = UIColor(red: 0.7, green: 0.8, blue: 1, alpha: 1)
        rim.eulerAngles = SCNVector3(-0.2, .pi - 0.5, 0)
        figureScene.rootNode.addChildNode(ambient)
        figureScene.rootNode.addChildNode(key)
        figureScene.rootNode.addChildNode(rim)
        view3D.scnScene = figureScene
        view3D.pointOfView = camera
    }
}
