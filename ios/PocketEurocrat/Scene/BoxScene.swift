import SceneKit
import UIKit

/// The toy: a glass-fronted box with a placeholder EU official and loose papers.
/// SceneKit physics, 2.5D — bodies are locked to the z=0 plane (velocityFactor / angularVelocityFactor),
/// gravity comes from CoreMotion via `setGravity`. Swap `makeOfficer` for a USDZ node when assets land.
final class BoxScene: NSObject, SCNPhysicsContactDelegate {
    let scene = SCNScene()
    var onBump: ((Float) -> Void)?

    /// World gravity at full tilt (units/s²); calibration knob for how "heavy" the toy feels.
    var gravityScale: Float = 16

    private let width: Float = 3.2, height: Float = 5.4, depth: Float = 1.2, wall: Float = 0.3
    private let official = SCNNode()
    private let body = SCNNode()
    private let head = SCNNode()
    private let eyes = SCNNode()
    private var papers: [SCNNode] = []
    private var lastBump = Date.distantPast

    private enum Category { static let official = 1, wall = 2, paper = 4 }

    override init() {
        super.init()
        scene.physicsWorld.contactDelegate = self
        scene.physicsWorld.gravity = SCNVector3(0, -gravityScale, 0)
        scene.background.contents = UIColor(red: 0.07, green: 0.08, blue: 0.12, alpha: 1)
        buildCamera()
        buildLights()
        buildBox()
        buildOfficer()
        buildPapers(count: 7)
    }

    // MARK: control

    func setGravity(x: Double, y: Double) {
        scene.physicsWorld.gravity = SCNVector3(Float(x) * gravityScale, Float(y) * gravityScale, 0)
    }

    /// Kick everything: the official and the papers jump and tumble.
    func shake() {
        for node in [official] + papers {
            node.physicsBody?.applyForce(SCNVector3(.random(in: -7...7), .random(in: 4...11), 0), asImpulse: true)
            node.physicsBody?.applyTorque(SCNVector4(0, 0, 1, .random(in: -3...3)), asImpulse: true)
        }
    }

    func setOfficerColor(hex: String) {
        body.geometry?.firstMaterial?.diffuse.contents = UIColor(hex: hex)
    }

    func setAsleep(_ asleep: Bool) {
        eyes.runAction(.scale(to: asleep ? 0.12 : 1, duration: 0.3), forKey: "lids")
        head.runAction(.rotateTo(x: 0, y: 0, z: asleep ? 0.45 : 0, duration: 0.4), forKey: "nod")
    }

    // MARK: contacts (haptic tick when the official hits a wall)

    func physicsWorld(_ world: SCNPhysicsWorld, didBegin contact: SCNPhysicsContact) {
        let cats = contact.nodeA.physicsBody!.categoryBitMask | contact.nodeB.physicsBody!.categoryBitMask
        guard cats == (Category.official | Category.wall), contact.collisionImpulse > 1.5 else { return }
        let now = Date()
        guard now.timeIntervalSince(lastBump) > 0.12 else { return }
        lastBump = now
        onBump?(Float(min(contact.collisionImpulse / 12, 1)))
    }

    // MARK: construction

    private func buildCamera() {
        let cam = SCNNode()
        cam.camera = SCNCamera()
        cam.camera?.usesOrthographicProjection = true
        cam.camera?.projectionDirection = .horizontal   // scale = half-width, so the box always fits the screen width
        cam.camera?.orthographicScale = Double(width / 2 + wall + 0.1)
        cam.position = SCNVector3(0, 0, 10)
        scene.rootNode.addChildNode(cam)
    }

    private func buildLights() {
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 650
        let sun = SCNNode()
        sun.light = SCNLight()
        sun.light?.type = .directional
        sun.light?.intensity = 900
        sun.eulerAngles = SCNVector3(-0.6, 0.4, 0)
        scene.rootNode.addChildNode(ambient)
        scene.rootNode.addChildNode(sun)
    }

    private func buildBox() {
        let t = wall, w = width, h = height, d = depth
        let desk = UIColor(red: 0.20, green: 0.22, blue: 0.30, alpha: 1)
        let back = UIColor(red: 0.85, green: 0.86, blue: 0.80, alpha: 1)
        func add(_ size: SCNVector3, _ pos: SCNVector3, color: UIColor?) {
            let geo = SCNBox(width: CGFloat(size.x), height: CGFloat(size.y), length: CGFloat(size.z), chamferRadius: 0)
            let node = SCNNode(geometry: color == nil ? nil : geo)
            geo.firstMaterial?.diffuse.contents = color
            node.position = pos
            node.physicsBody = SCNPhysicsBody(type: .static, shape: SCNPhysicsShape(geometry: geo))
            node.physicsBody?.restitution = 0.35
            node.physicsBody?.friction = 0.6
            node.physicsBody?.categoryBitMask = Category.wall
            node.physicsBody?.contactTestBitMask = Category.official
            scene.rootNode.addChildNode(node)
        }
        let sideH = h + 2 * t
        add(SCNVector3(t, sideH, d + 2 * t), SCNVector3(-(w + t) / 2, 0, 0), color: desk)
        add(SCNVector3(t, sideH, d + 2 * t), SCNVector3((w + t) / 2, 0, 0), color: desk)
        add(SCNVector3(w, t, d + 2 * t), SCNVector3(0, -(h + t) / 2, 0), color: desk)
        add(SCNVector3(w, t, d + 2 * t), SCNVector3(0, (h + t) / 2, 0), color: desk)
        add(SCNVector3(w, h, t), SCNVector3(0, 0, -(d + t) / 2), color: back)
        add(SCNVector3(w, h, t), SCNVector3(0, 0, (d + t) / 2), color: nil)   // invisible "glass" front
    }

    private func buildOfficer() {
        let capsule = SCNCapsule(capRadius: 0.38, height: 1.4)
        capsule.firstMaterial?.diffuse.contents = UIColor.gray
        body.geometry = capsule

        let skull = SCNSphere(radius: 0.32)
        skull.firstMaterial?.diffuse.contents = UIColor(red: 0.96, green: 0.82, blue: 0.70, alpha: 1)
        head.geometry = skull
        head.position = SCNVector3(0, 1.0, 0)

        for sx: Float in [-0.12, 0.12] {
            let eye = SCNNode(geometry: SCNSphere(radius: 0.05))
            eye.geometry?.firstMaterial?.diffuse.contents = UIColor.black
            eye.position = SCNVector3(sx, 0.04, 0.28)
            eyes.addChildNode(eye)
        }
        eyes.pivot = SCNMatrix4MakeTranslation(0, 0.04, 0)   // lids close towards the eye line
        eyes.position = SCNVector3(0, 0.04, 0)
        head.addChildNode(eyes)

        let tie = SCNNode(geometry: SCNBox(width: 0.1, height: 0.6, length: 0.04, chamferRadius: 0.01))
        tie.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.1, green: 0.2, blue: 0.7, alpha: 1)
        tie.position = SCNVector3(0, 0.25, 0.37)

        official.addChildNode(body)
        official.addChildNode(head)
        official.addChildNode(tie)
        official.position = SCNVector3(0, 1.5, 0)

        let shape = SCNPhysicsShape(
            shapes: [SCNPhysicsShape(geometry: capsule), SCNPhysicsShape(geometry: skull)],
            transforms: [NSValue(scnMatrix4: SCNMatrix4Identity), NSValue(scnMatrix4: SCNMatrix4MakeTranslation(0, 1.0, 0))])
        let phys = SCNPhysicsBody(type: .dynamic, shape: shape)
        phys.mass = 1
        phys.restitution = 0.35
        phys.friction = 0.6
        phys.damping = 0.1
        phys.angularDamping = 0.25
        phys.velocityFactor = SCNVector3(1, 1, 0)
        phys.angularVelocityFactor = SCNVector3(0, 0, 1)
        phys.categoryBitMask = Category.official
        phys.contactTestBitMask = Category.wall
        official.physicsBody = phys
        scene.rootNode.addChildNode(official)
    }

    private func buildPapers(count: Int) {
        for i in 0..<count {
            let sheet = SCNBox(width: 0.55, height: 0.75, length: 0.02, chamferRadius: 0)
            sheet.firstMaterial?.diffuse.contents = UIColor(white: 0.97, alpha: 1)
            let node = SCNNode(geometry: sheet)
            node.position = SCNVector3(Float(i % 3) - 1, 2.2 + Float(i) * 0.1, 0)
            node.eulerAngles.z = .random(in: -0.6...0.6)
            let phys = SCNPhysicsBody(type: .dynamic, shape: SCNPhysicsShape(geometry: sheet))
            phys.mass = 0.08
            phys.restitution = 0.1
            phys.friction = 0.8
            phys.angularDamping = 0.5
            phys.velocityFactor = SCNVector3(1, 1, 0)
            phys.angularVelocityFactor = SCNVector3(0, 0, 1)
            phys.categoryBitMask = Category.paper
            node.physicsBody = phys
            scene.rootNode.addChildNode(node)
            papers.append(node)
        }
    }
}

extension UIColor {
    convenience init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}
