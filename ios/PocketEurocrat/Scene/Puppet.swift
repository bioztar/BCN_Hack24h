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

    // MARK: figure

    private func refreshFigure() {
        let e: DummyScene.Expression = isDown ? .appalled : expression
        figure?.removeFromParentNode()
        let n = ReliefFigure.node(officer: persona, expression: e)
        figureHolder.addChildNode(n)
        figure = n
        headNode = n.childNode(withName: "head", recursively: false)
        mouthMaterials = n.childNodes.compactMap { $0.geometry?.firstMaterial }
    }

    private func applyMouth() {
        for m in mouthMaterials {   // head and body share one material; setting twice is harmless
            m.setValue(NSNumber(value: Float(mouthOpen)), forKey: "mouthOpen")
            m.setValue(NSNumber(value: Float(mouthWide)), forKey: "mouthWide")
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
