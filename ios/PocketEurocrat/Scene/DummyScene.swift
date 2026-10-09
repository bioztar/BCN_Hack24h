import SpriteKit
import UIKit

/// The toy: the case officers (a duo) as photo-relief busts on weighted pivots, plus loose papers.
/// The dummies are hand-integrated springs (see `Puppet`); only the papers use SpriteKit physics.
final class DummyScene: SKScene {
    enum Expression: String, CaseIterable { case neutral, stamping, smug, appalled, asleep }

    var onImpact: ((Float) -> Void)?
    /// Calibration knobs (real-device feel).
    var tuning = PuppetTuning()
    /// Height of the SwiftUI control bar the scene sits behind; the floor is just above it.
    var bottomInset: CGFloat = 150 { didSet { if figureRoot.parent != nil { layout() } } }

    /// True while any officer is lying on its side.
    var isDown: Bool { puppets.contains { $0.isDown } }

    private let figureRoot = SKNode()   // camera-ish transform (zoom onto the faces while the keyboard is up)
    private var puppets: [Puppet] = []
    private var papers: [SKSpriteNode] = []
    private var baseExpression: Expression = .neutral
    private var gx: CGFloat = 0
    private var gy: CGFloat = -1
    private var lastUpdate: TimeInterval = 0

    override init(size: CGSize) {
        super.init(size: size)
        setDuo(Array(Roster.officers.prefix(2)))
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.12, alpha: 1)
        scaleMode = .resizeFill
        figureRoot.zPosition = 1
        addChild(figureRoot)
        buildPapers()
        puppets.forEach { figureRoot.addChild($0.node) }
        layout()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        guard figureRoot.parent != nil else { return }
        layout()
    }

    // MARK: control

    /// Show these officers side by side (1 or 2). Keeps existing puppets when the ids match.
    func setDuo(_ personas: [Persona]) {
        let wanted = Array(personas.prefix(2))
        for (i, p) in wanted.enumerated() {
            if i < puppets.count {
                puppets[i].setPersona(p)
            } else {
                let puppet = Puppet(persona: p)
                puppet.stiffness = 49 - CGFloat(i) * 7
                puppet.toppleBias = CGFloat(i) * 0.05
                puppet.expression = baseExpression
                puppet.onImpact = { [weak self] s in self?.onImpact?(s) }
                puppets.append(puppet)
                if figureRoot.parent != nil { figureRoot.addChild(puppet.node) }
            }
        }
        while puppets.count > wanted.count { puppets.removeLast().node.removeFromParent() }
        if figureRoot.parent != nil { layout() }
    }

    func setGravity(x: Double, y: Double) {
        gx = CGFloat(x)
        gy = CGFloat(y)
        physicsWorld.gravity = CGVector(dx: x * 18, dy: y * 18)
    }

    /// `id == nil`: everyone; otherwise only that officer (e.g. the speaker stamping).
    func setExpression(_ e: Expression, for id: String? = nil) {
        if id == nil { baseExpression = e }
        for p in puppets where id == nil || p.persona.id == id { p.expression = e }
    }

    /// The speaker leans in and gets the light, the other reacts. nil = nobody speaking.
    func setSpeaker(_ id: String?) {
        let speaker = puppets.firstIndex { $0.persona.id == id }
        for (i, p) in puppets.enumerated() {
            p.focus = speaker == nil || puppets.count == 1 ? 0.5 : (i == speaker ? 1 : 0)
            // The listener turns its head to the speaker; the speaker faces the camera.
            p.look = (speaker == nil || i == speaker) ? 0 : (speaker! > i ? 1 : -1)
            if p.persona.id != id { p.talkTarget = 0; p.mouthTarget = 0 }
        }
    }

    /// Lip sync for the speaker: `open` 0...1 (jaw/mouth), `wide` ~1 (narrower/wider mouth). Also bobs the head.
    func setMouth(open: Double, wide: Double, speaker id: String? = nil) {
        let o = CGFloat(min(max(open, 0), 1))
        let w = CGFloat(min(max(wide, 0.7), 1.5))
        for p in puppets {
            let mine = id == nil || p.persona.id == id
            p.mouthTarget = mine ? o : 0
            p.mouthWideTarget = mine ? w : 1
            p.talkTarget = mine ? o : 0
        }
    }

    func shake() {
        puppets.forEach { $0.kick() }
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

    /// Exposed for tests: advance the dummies by `dt` seconds at time `now`.
    func step(dt: CGFloat, now: TimeInterval) {
        for p in puppets {
            p.gravityY = gy
            p.step(dt: dt, now: now, gx: gx, tuning: tuning, sceneWidth: size.width)
        }
    }

    // MARK: layout

    private var floorY: CGFloat { bottomInset + 10 }
    private var bustH: CGFloat { puppets.first?.bustH ?? 0 }

    private func layout() {
        physicsBody = SKPhysicsBody(edgeLoopFrom: CGRect(x: 0, y: floorY - 4, width: size.width, height: size.height))
        physicsBody?.friction = 0.6
        let duo = puppets.count > 1
        let width = size.width * (duo ? 0.64 : 0.9)
        for (i, p) in puppets.enumerated() {
            let cx = duo ? size.width * (i == 0 ? 0.31 : 0.69) : size.width / 2
            p.layout(centerX: cx, floorY: floorY, width: width)
        }
    }

    /// Keyboard up: zoom/pan so the faces sit in the free area above `keyboardHeight`
    /// (points from the bottom of the screen, controls bar included). nil = back to the full view.
    func frameFace(keyboardHeight: CGFloat?) {
        let scale: CGFloat, offset: CGPoint
        if let kb = keyboardHeight, bustH > 0 {
            let top: CGFloat = 120                                   // status bar + officer picker
            let free = max(size.height - kb - top, 100)
            let bandH = bustH * 0.5                                  // head + shoulders
            scale = min(max(free * 0.92 / bandH, 1), 1.5)
            let faceY = floorY + bustH * 0.76
            let target = kb + free / 2
            offset = CGPoint(x: size.width / 2 * (1 - scale), y: target - scale * faceY)
        } else {
            scale = 1; offset = .zero
        }
        figureRoot.removeAction(forKey: "frame")
        let zoom = SKAction.scale(to: scale, duration: 0.3)
        let pan = SKAction.move(to: offset, duration: 0.3)
        zoom.timingMode = .easeInEaseOut
        pan.timingMode = .easeInEaseOut
        figureRoot.run(.group([zoom, pan]), withKey: "frame")
    }

    private func buildPapers() {
        for i in 0..<6 {
            let sheet = SKSpriteNode(color: UIColor(white: 0.96, alpha: 1), size: CGSize(width: 46, height: 62))
            sheet.zPosition = 0.5   // behind the busts
            sheet.position = CGPoint(x: 60 + CGFloat(i) * 55, y: floorY + 40)
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
