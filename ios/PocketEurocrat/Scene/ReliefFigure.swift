import SceneKit
import UIKit

/// Builds the 3D bust for one officer + expression ("photo-relief"):
/// a grid mesh displaced by the offline depth map (`<name>-depth.png`, tools/depthgen.swift),
/// textured with the cut-out photo (alpha = silhouette), plus a thin dark back face.
/// The mesh is split at the neck into a `head` node (pivoting on the neck) and a `body` node, so the head
/// can turn independently of the torso. If `<name>.usdz` is bundled (true 3D from the other crew) it wins.
/// The returned node is 2.0 units tall, centred on the origin, facing +z.
enum ReliefFigure {
    static let height: Float = 2.0
    private static let columns = 128, rows = 160
    /// z of the nearest point, in figure units (figure is 2.0 tall); the main "how 3D" knob.
    private static let relief: Float = 0.9
    /// Cells over which depth ramps up from the silhouette, so edges roll off instead of cliffing.
    private static let edgeRamp: Float = 7
    /// Neck line as a fraction of the image height from the top, and the overlap (rows) between head and body.
    static let neckFraction: Float = 0.43
    private static let overlapRows = 6

    private static var cache: [String: SCNNode] = [:]

    /// Main-thread only (uses a shared cache). Returns a fresh clone each call.
    static func node(officer: Persona, expression: DummyScene.Expression) -> SCNNode {
        let key = "\(officer.id)-\(expression.rawValue)"
        if let hit = cache[key] { return hit.clone() }
        let built = usdz(named: key) ?? relief(officer: officer, expression: expression)
        cache[key] = built
        return built.clone()
    }

    /// Neck pivot in figure units (y up, 0 = middle of the figure).
    static var neckY: Float { (0.5 - neckFraction) * height }

    // MARK: true 3D (swap contract)

    private static func usdz(named name: String) -> SCNNode? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "usdz"),
              let scene = try? SCNScene(url: url) else { return nil }
        let holder = SCNNode()
        scene.rootNode.childNodes.forEach { holder.addChildNode($0) }
        let (lo, hi) = holder.boundingBox
        let h = max(hi.y - lo.y, 0.001)
        let s = height / h
        holder.scale = SCNVector3(s, s, s)
        holder.pivot = SCNMatrix4MakeTranslation((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
        let outer = SCNNode()
        outer.addChildNode(holder)
        return outer
    }

    // MARK: photo-relief

    private static func relief(officer: Persona, expression: DummyScene.Expression) -> SCNNode {
        let image = CutoutStore.image(officer: officer, expression: expression)
        let depth = CutoutStore.depth(officer: officer, expression: expression)
        let aspect = Float(image.size.width / max(image.size.height, 1))
        let width = height * aspect

        let field = heightField(depth: depth)
        let material = SCNMaterial()
        material.diffuse.contents = image
        material.lightingModel = .lambert
        material.isDoubleSided = true

        let neckRow = Int(neckFraction * Float(rows - 1))
        let body = mesh(field: field, width: width, material: material, rows: (neckRow - overlapRows)..<(rows - 1))
        body.name = "body"
        let head = mesh(field: field, width: width, material: material, rows: 0..<(neckRow + overlapRows))
        head.name = "head"
        // Head rotates about the neck: pivot and position at the neck point.
        head.pivot = SCNMatrix4MakeTranslation(0, neckY, 0)
        head.position = SCNVector3(0, neckY, 0)

        let root = SCNNode()
        root.addChildNode(body)
        root.addChildNode(head)
        root.addChildNode(backFace(image: image, width: width))
        return root
    }

    private struct Field {
        var z: [Float]            // displacement per vertex, already edge-ramped
        var present: [Bool]       // vertex inside (or next to) the silhouette
    }

    /// Depth map -> per-vertex displacement: bilinear sample, exaggerate, ramp to 0 at the silhouette.
    private static func heightField(depth: CutoutStore.DepthMap?) -> Field {
        let nx = columns, ny = rows
        guard let d = depth else {
            return Field(z: [Float](repeating: 0, count: nx * ny), present: [Bool](repeating: true, count: nx * ny))
        }
        func texel(_ x: Int, _ y: Int) -> Float { Float(d.bytes[min(y, d.height - 1) * d.width + min(x, d.width - 1)]) }
        var z = [Float](repeating: 0, count: nx * ny)
        var inside = [Bool](repeating: false, count: nx * ny)
        for j in 0..<ny {
            let fy = (Float(j) / Float(ny - 1)) * Float(d.height - 1)
            let y0 = Int(fy), ty = fy - Float(y0)
            for i in 0..<nx {
                let fx = (Float(i) / Float(nx - 1)) * Float(d.width - 1)
                let x0 = Int(fx), tx = fx - Float(x0)
                let top = texel(x0, y0) * (1 - tx) + texel(x0 + 1, y0) * tx
                let bot = texel(x0, y0 + 1) * (1 - tx) + texel(x0 + 1, y0 + 1) * tx
                let v = top * (1 - ty) + bot * ty
                inside[j * nx + i] = v > 0.5
                z[j * nx + i] = v / 255
            }
        }

        // Chamfer distance (in cells) to the background, two passes.
        var dist = inside.map { $0 ? Float(1000) : 0 }
        for j in 0..<ny {
            for i in 0..<nx where dist[j * nx + i] > 0 {
                var best = dist[j * nx + i]
                if i > 0 { best = min(best, dist[j * nx + i - 1] + 1) } else { best = min(best, 1) }
                if j > 0 { best = min(best, dist[(j - 1) * nx + i] + 1) } else { best = min(best, 1) }
                dist[j * nx + i] = best
            }
        }
        for j in stride(from: ny - 1, through: 0, by: -1) {
            for i in stride(from: nx - 1, through: 0, by: -1) where dist[j * nx + i] > 0 {
                var best = dist[j * nx + i]
                if i < nx - 1 { best = min(best, dist[j * nx + i + 1] + 1) }
                if j < ny - 1 { best = min(best, dist[(j + 1) * nx + i] + 1) }
                dist[j * nx + i] = best
            }
        }
        // The bottom/left/right image borders are crops, not silhouettes: don't ramp down there.
        for j in 0..<ny {
            for i in 0..<nx where inside[j * nx + i] {
                let onCrop = i == 0 || i == nx - 1 || j == ny - 1
                let t = onCrop ? 1 : min(dist[j * nx + i] / edgeRamp, 1)
                let ramp = t * t * (3 - 2 * t)           // smoothstep
                z[j * nx + i] *= relief * (0.35 + 0.65 * ramp)
            }
        }

        // Dilate by one cell: the photo's alpha (not the mesh) defines the silhouette, so never cut inside it.
        var present = [Bool](repeating: false, count: nx * ny)
        for j in 0..<ny {
            for i in 0..<nx {
                outer: for dj in -1...1 {
                    for di in -1...1 {
                        let jj = j + dj, ii = i + di
                        if jj >= 0, jj < ny, ii >= 0, ii < nx, inside[jj * nx + ii] { present[j * nx + i] = true; break outer }
                    }
                }
            }
        }
        return Field(z: z, present: present)
    }

    /// Triangle grid over the given vertex rows. Vertex positions/normals/uvs always come from the full
    /// field so the head and body meshes line up exactly where they overlap.
    private static func mesh(field: Field, width: Float, material: SCNMaterial, rows range: Range<Int>) -> SCNNode {
        let nx = columns, ny = rows
        let dx = width / Float(nx - 1), dy = height / Float(ny - 1)
        var verts = [SCNVector3](), normals = [SCNVector3](), uvs = [CGPoint]()
        let rowCount = range.count + 1
        verts.reserveCapacity(nx * rowCount)
        for j in range.lowerBound...range.upperBound {
            let jj = min(j, ny - 1)
            for i in 0..<nx {
                let z = field.z
                let zc = z[jj * nx + i]
                verts.append(SCNVector3((Float(i) / Float(nx - 1) - 0.5) * width, (0.5 - Float(jj) / Float(ny - 1)) * height, zc))
                uvs.append(CGPoint(x: CGFloat(i) / CGFloat(nx - 1), y: CGFloat(jj) / CGFloat(ny - 1)))   // SceneKit uv origin = image top-left
                let l = z[jj * nx + max(i - 1, 0)], r = z[jj * nx + min(i + 1, nx - 1)]
                let u = z[max(jj - 1, 0) * nx + i], b = z[min(jj + 1, ny - 1) * nx + i]
                let n = SCNVector3(-(r - l) / (2 * dx), (b - u) / (2 * dy), 1)
                let len = (n.x * n.x + n.y * n.y + n.z * n.z).squareRoot()
                normals.append(SCNVector3(n.x / len, n.y / len, n.z / len))
            }
        }

        var indices = [Int32]()
        indices.reserveCapacity((nx - 1) * range.count * 6)
        for row in 0..<range.count {
            let j = range.lowerBound + row
            for i in 0..<(nx - 1) {
                let a = row * nx + i, b = a + 1, c = a + nx, d = c + 1
                let p = j * nx + i
                guard field.present[p] || field.present[p + 1] || field.present[p + nx] || field.present[p + nx + 1] else { continue }
                indices.append(contentsOf: [Int32(a), Int32(c), Int32(b), Int32(b), Int32(c), Int32(d)])
            }
        }

        let geometry = SCNGeometry(
            sources: [SCNGeometrySource(vertices: verts), SCNGeometrySource(normals: normals), SCNGeometrySource(textureCoordinates: uvs)],
            elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
        geometry.materials = [material]
        return SCNNode(geometry: geometry)
    }

    /// Dark silhouette just behind the relief, so the figure is not a paper-thin shell when it turns over.
    private static func backFace(image: UIImage, width: Float) -> SCNNode {
        let plane = SCNPlane(width: CGFloat(width), height: CGFloat(height))
        let m = SCNMaterial()
        m.diffuse.contents = UIColor(white: 0.07, alpha: 1)
        m.transparent.contents = image
        m.lightingModel = .constant
        m.isDoubleSided = true
        plane.materials = [m]
        let node = SCNNode(geometry: plane)
        node.position = SCNVector3(0, 0, -0.03)
        return node
    }
}
