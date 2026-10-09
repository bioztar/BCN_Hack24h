import SceneKit
import UIKit

/// Builds the 3D bust for one officer + expression ("photo-relief"):
/// a grid mesh displaced by the offline depth map (`<name>-depth.png`, tools/depthgen.swift),
/// textured with the cut-out photo (alpha = silhouette), plus a thin dark back face.
/// If `<name>.usdz` is bundled (true 3D from the other crew) it wins over the relief.
/// The returned node is 2.0 units tall, centred on the origin, facing +z.
enum ReliefFigure {
    static let height: Float = 2.0
    private static let columns = 128, rows = 160
    private static let relief: Float = 0.45   // z of the nearest point; calibration knob

    private static var cache: [String: SCNNode] = [:]

    /// Main-thread only (uses a shared cache). Returns a fresh clone each call.
    static func node(officer: Persona, expression: DummyScene.Expression) -> SCNNode {
        let key = "\(officer.id)-\(expression.rawValue)"
        if let hit = cache[key] { return hit.clone() }
        let built = usdz(named: key) ?? relief(officer: officer, expression: expression)
        cache[key] = built
        return built.clone()
    }

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

        let root = SCNNode()
        root.addChildNode(frontMesh(image: image, depth: depth, width: width))
        root.addChildNode(backFace(image: image, width: width))
        return root
    }

    private static func frontMesh(image: UIImage, depth: CutoutStore.DepthMap?, width: Float) -> SCNNode {
        let nx = columns, ny = rows
        var z = [Float](repeating: 0, count: nx * ny)
        var present = [Bool](repeating: false, count: nx * ny)
        if let d = depth {
            func texel(_ x: Int, _ y: Int) -> Float { Float(d.bytes[min(y, d.height - 1) * d.width + min(x, d.width - 1)]) }
            var raw = [Bool](repeating: false, count: nx * ny)
            for j in 0..<ny {
                let fy = (Float(j) / Float(ny - 1)) * Float(d.height - 1)
                let y0 = Int(fy), ty = fy - Float(y0)
                for i in 0..<nx {
                    let fx = (Float(i) / Float(nx - 1)) * Float(d.width - 1)
                    let x0 = Int(fx), tx = fx - Float(x0)
                    // bilinear, so the relief is smooth rather than stair-stepped
                    let top = texel(x0, y0) * (1 - tx) + texel(x0 + 1, y0) * tx
                    let bot = texel(x0, y0 + 1) * (1 - tx) + texel(x0 + 1, y0 + 1) * tx
                    let v = top * (1 - ty) + bot * ty
                    raw[j * nx + i] = v > 0.5
                    z[j * nx + i] = v / 255 * relief
                }
            }
            // Dilate by one cell: the photo's alpha (not the mesh) defines the silhouette, so never cut inside it.
            for j in 0..<ny {
                for i in 0..<nx {
                    outer: for dj in -1...1 {
                        for di in -1...1 {
                            let jj = j + dj, ii = i + di
                            if jj >= 0, jj < ny, ii >= 0, ii < nx, raw[jj * nx + ii] { present[j * nx + i] = true; break outer }
                        }
                    }
                }
            }
        } else {
            present = [Bool](repeating: true, count: nx * ny)   // no depth: flat card
        }

        let dx = width / Float(nx - 1), dy = height / Float(ny - 1)
        var verts = [SCNVector3](), normals = [SCNVector3](), uvs = [CGPoint]()
        verts.reserveCapacity(nx * ny)
        for j in 0..<ny {
            for i in 0..<nx {
                let zc = z[j * nx + i]
                verts.append(SCNVector3((Float(i) / Float(nx - 1) - 0.5) * width, (0.5 - Float(j) / Float(ny - 1)) * height, zc))
                uvs.append(CGPoint(x: CGFloat(i) / CGFloat(nx - 1), y: CGFloat(j) / CGFloat(ny - 1)))   // SceneKit uv origin = image top-left
                let l = z[j * nx + max(i - 1, 0)], r = z[j * nx + min(i + 1, nx - 1)]
                let u = z[max(j - 1, 0) * nx + i], b = z[min(j + 1, ny - 1) * nx + i]
                let n = SCNVector3(-(r - l) / (2 * dx), (b - u) / (2 * dy), 1)
                let len = (n.x * n.x + n.y * n.y + n.z * n.z).squareRoot()
                normals.append(SCNVector3(n.x / len, n.y / len, n.z / len))
            }
        }

        var indices = [Int32]()
        indices.reserveCapacity((nx - 1) * (ny - 1) * 6)
        for j in 0..<(ny - 1) {
            for i in 0..<(nx - 1) {
                let a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
                guard present[a] || present[b] || present[c] || present[d] else { continue }   // skip pure background
                indices.append(contentsOf: [Int32(a), Int32(c), Int32(b), Int32(b), Int32(c), Int32(d)])
            }
        }

        let geometry = SCNGeometry(
            sources: [SCNGeometrySource(vertices: verts), SCNGeometrySource(normals: normals), SCNGeometrySource(textureCoordinates: uvs)],
            elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
        let material = SCNMaterial()
        material.diffuse.contents = image
        material.lightingModel = .lambert
        material.isDoubleSided = true
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
