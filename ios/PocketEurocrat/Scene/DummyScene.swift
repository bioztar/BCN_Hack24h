import SceneKit
import SpriteKit
import UIKit

/// The toy: a head-and-shoulders cut-out of the officer standing on a weighted pivot (bobblehead /
/// punching-clown). Tilt leans it with a spring; past `toppleThreshold` it falls sideways, lies there
/// (appalled), then rights itself. The dummy is a hand-integrated spring (not SpriteKit physics) so the
/// feel is tunable; only the loose papers use the SpriteKit physics world.
final class DummyScene: SKScene {
    enum Expression: String, CaseIterable { case neutral, stamping, smug, appalled, asleep }
    private enum Stance: Equatable { case upright, down(dir: CGFloat) }   // dir +1 = fell to the right

    var onImpact: ((Float) -> Void)?

    // Calibration knobs (real-device feel).
    var leanGain: CGFloat = 0.9            // rad of lean per 1 g of sideways gravity
    var toppleThreshold: CGFloat = 0.55    // |gravity.x| that tips it over (~33° of tilt)
    var recoverThreshold: CGFloat = 0.3
    var recoverDelay: TimeInterval = 1.4   // lies down at least this long

    private(set) var isDown = false

    /// Pivot at the base of the bust; everything physical (lean, topple, talk bob) is applied here.
    private let pivot = SKNode()
    /// The photo-relief figure rendered by SceneKit inside the SpriteKit scene.
    private let view3D = SK3DNode(viewportSize: CGSize(width: 100, height: 100))
    private let figureScene = SCNScene()
    private let figureHolder = SCNNode()   // yawed as the dummy leans, so it turns in 3D
    private var figure: SCNNode?
    private var bustH: CGFloat = 0
    private var papers: [SKSpriteNode] = []
    private var officer = Roster.officers[0]
    private var expression: Expression = .neutral
    private var stance: Stance = .upright
    private var gx: CGFloat = 0
    private var theta: CGFloat = 0
    private var omega: CGFloat = 0
    private var shift: CGFloat = 0
    private var downSince: TimeInterval = 0
    private var impacted = false
    private var talk: CGFloat = 0
    private var talkTarget: CGFloat = 0
    private var lastUpdate: TimeInterval = 0

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.12, alpha: 1)
        scaleMode = .resizeFill
        buildFigureScene()
        pivot.zPosition = 1
        pivot.addChild(view3D)
        addChild(pivot)
        buildPapers()
        refreshFigure()
        layout()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        guard pivot.parent != nil else { return }
        layout()
    }

    // MARK: control

    func setGravity(x: Double, y: Double) {
        gx = CGFloat(x)
        physicsWorld.gravity = CGVector(dx: x * 18, dy: y * 18)
    }

    func setOfficer(_ persona: Persona) {
        officer = persona
        refreshFigure()
    }

    func setExpression(_ e: Expression) {
        expression = e
        refreshFigure()
    }

    /// 0...1 mouth/voice level; bobs the head while the officer speaks.
    func setTalk(_ level: Double) { talkTarget = CGFloat(min(max(level, 0), 1)) }

    func shake() {
        omega += CGFloat.random(in: -6...6)
        stance = .upright
        syncDown()
        for p in papers {
            p.physicsBody?.applyImpulse(CGVector(dx: .random(in: -25...25), dy: .random(in: 25...70)))
            p.physicsBody?.applyAngularImpulse(.random(in: -0.05...0.05))
        }
    }

    // MARK: simulation

    override func update(_ t: TimeInterval) {
        let dt = CGFloat(min(max(t - lastUpdate, 0), 1.0 / 30))
        lastUpdate = t
        guard dt > 0 else { return }
        step(dt: dt, now: t)
    }

    /// Exposed for tests: advance the dummy by `dt` seconds at time `now`.
    func step(dt: CGFloat, now: TimeInterval) {
        updateStance(now: now)

        let target: CGFloat, k: CGFloat, zeta: CGFloat
        switch stance {
        case .upright: target = -min(max(gx * leanGain, -0.55), 0.55); k = 49; zeta = 0.22
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

        let shiftTarget: CGFloat
        if case .down(let d) = stance { shiftTarget = -d * fallShift } else { shiftTarget = 0 }
        shift += (shiftTarget - shift) * min(1, dt * 6)
        talk += (talkTarget - talk) * min(1, dt * 20)

        pivot.position.x = size.width / 2 + shift
        pivot.zRotation = theta + sin(CGFloat(now) * 14) * 0.03 * talk
        pivot.yScale = 1 + 0.04 * talk
        // 3D: turn towards the lean (up to ~50° when lying down), nod while talking, faint idle sway.
        figureHolder.eulerAngles = SCNVector3(
            Float(-0.06 * talk),
            Float(-theta * 0.5 + sin(CGFloat(now) * 0.9) * 0.05),
            0)
    }

    private func updateStance(now: TimeInterval) {
        switch stance {
        case .upright:
            if abs(gx) > toppleThreshold { fall(dir: gx > 0 ? 1 : -1, now: now) }
        case .down(let d):
            if gx * d < 0, abs(gx) > toppleThreshold { fall(dir: -d, now: now) }   // rolled to the other side
            else if abs(gx) < recoverThreshold, now - downSince > recoverDelay { stance = .upright; syncDown() }
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
    }

    // MARK: visuals

    private var fallShift: CGFloat { max(0, bustH - size.width / 2 + size.width * 0.1) }

    private func layout() {
        let floorY = size.height * 0.1
        pivot.position = CGPoint(x: size.width / 2 + shift, y: floorY)
        physicsBody = SKPhysicsBody(edgeLoopFrom: CGRect(x: 0, y: floorY - 4, width: size.width, height: size.height))
        physicsBody?.friction = 0.6
        // Figure is 2.0 units tall inside a 2.2-unit-tall viewport; cut-outs are 3:4.
        let w = size.width * 0.9
        bustH = w * 4 / 3
        view3D.viewportSize = CGSize(width: w * 1.1, height: bustH * 1.1)
        view3D.position = CGPoint(x: 0, y: bustH / 2)   // image bottom edge sits on the pivot
    }

    private func buildFigureScene() {
        figureScene.rootNode.addChildNode(figureHolder)
        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.fieldOfView = 25
        camera.position = SCNVector3(0, 0, 5)
        figureScene.rootNode.addChildNode(camera)
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 750
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

    private func refreshFigure() {
        guard pivot.parent != nil else { return }
        let e: Expression = isDown ? .appalled : expression
        figure?.removeFromParentNode()
        let node = ReliefFigure.node(officer: officer, expression: e)
        figureHolder.addChildNode(node)
        figure = node
    }

    private func buildPapers() {
        for i in 0..<6 {
            let sheet = SKSpriteNode(color: UIColor(white: 0.96, alpha: 1), size: CGSize(width: 46, height: 62))
            sheet.zPosition = 0.5   // behind the bust
            sheet.position = CGPoint(x: 60 + CGFloat(i) * 55, y: size.height * 0.1 + 40)
            sheet.zRotation = .random(in: -0.5...0.5)
            sheet.physicsBody = SKPhysicsBody(rectangleOf: sheet.size)
            sheet.physicsBody?.mass = 0.05
            sheet.physicsBody?.restitution = 0.1
            sheet.physicsBody?.friction = 0.7
            sheet.physicsBody?.angularDamping = 0.6
            sheet.physicsBody?.linearDamping = 0.4
            addChild(sheet)
            papers.append(sheet)
        }
    }
}
