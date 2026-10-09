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
    var talkTarget: CGFloat = 0
    /// Per-puppet spring so a duo never moves in lockstep.
    var stiffness: CGFloat = 49
    var toppleBias: CGFloat = 0

    private let view3D = SK3DNode(viewportSize: CGSize(width: 100, height: 100))
    private let figureScene = SCNScene()
    private let figureHolder = SCNNode()
    private let ambient = SCNNode()
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
        focusNow += (focus - focusNow) * min(1, dt * 8)

        node.position.x = baseX + shift
        node.zPosition = 1 + focusNow
        let grow = 1 + 0.1 * (focusNow - 0.5)
        spin.zRotation = theta + sin(CGFloat(now) * 14) * 0.03 * talk
        spin.setScale(grow)
        spin.yScale = grow * (1 + 0.04 * talk)
        // 3D: turn towards the lean (up to ~50° when lying down), nod while talking, faint idle sway.
        figureHolder.eulerAngles = SCNVector3(
            Float(-0.06 * talk),
            Float(-theta * 0.5 + sin(CGFloat(now) * 0.9) * 0.05),
            0)
        ambient.light?.intensity = 450 + 350 * focusNow
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
        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 850
        key.eulerAngles = SCNVector3(-0.5, -0.6, 0)
        figureScene.rootNode.addChildNode(ambient)
        figureScene.rootNode.addChildNode(key)
        view3D.scnScene = figureScene
        view3D.pointOfView = camera
    }
}
