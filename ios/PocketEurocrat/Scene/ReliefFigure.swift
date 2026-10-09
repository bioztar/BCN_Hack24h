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
    /// Overlap (rows) between the head and body meshes, so the head can turn without opening a crack.
    private static let overlapRows = 10   // rows shared by head and body meshes (±6%): a wider shared band hides the split

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

    // MARK: lip sync shaders (uniforms set per frame by Puppet: mouthOpen 0...1, mouthWide ~0.8...1.4)

    /// Jaw drop: vertices under the mouth line slide down, weighted by distance from the mouth centre and
    /// fading out towards the neck, so the chin follows the open mouth.
    private static let jawShader = """
    #pragma arguments
    float mouthOpen;
    float mouthWide;
    float mouthU;
    float mouthV;
    float mouthHW;
    float mouthHH;
    float mouthIW;
    #pragma body
    float2 uv = _geometry.texcoords[0];
    float dx = (uv.x - mouthU) / (mouthHW * 1.7 * mouthWide);
    float wx = exp(-dx * dx);
    float below = smoothstep(mouthV - mouthHH, mouthV + mouthHH, uv.y);
    float chin = 1.0 - smoothstep(mouthV + 0.07, mouthV + 0.20, uv.y);
    _geometry.position.y -= mouthOpen * 0.066 * wx * below * chin;   // max drop ~60% of the first version
    """

    /// Mouth cavity: an ellipse clipped to the inner-lips width (in texture space, so the jaw drop stretches it
    /// into the opening). Dark red under the upper lip fading to black, plus a faint upper-teeth strip.
    private static let mouthShader = """
    #pragma arguments
    float mouthOpen;
    float mouthWide;
    float mouthU;
    float mouthV;
    float mouthHW;
    float mouthHH;
    float mouthIW;
    #pragma body
    float2 uv = _surface.diffuseTexcoord;
    float halfH = mouthHH * 0.5;
    float2 d = float2((uv.x - mouthU) / (mouthIW * mouthWide), (uv.y - mouthV) / halfH);
    float inside = 1.0 - smoothstep(0.72, 1.0, length(d));
    float k = inside * smoothstep(0.04, 0.2, mouthOpen);
    float depth = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);   // 0 = under the upper lip, 1 = bottom of the opening
    float3 cavity = mix(float3(0.30, 0.05, 0.06), float3(0.015, 0.0, 0.01), smoothstep(0.0, 0.75, depth));
    float teeth = (1.0 - smoothstep(0.08, 0.30, depth)) * (1.0 - smoothstep(0.5, 0.85, abs(d.x))) * smoothstep(0.2, 0.5, mouthOpen);
    cavity = mix(cavity, float3(0.78, 0.74, 0.68), teeth * 0.5);
    _surface.diffuse.rgb = mix(_surface.diffuse.rgb, cavity, k);
    // Soft left/right image borders, where the cut-out is cropped (a hard crop edge shows where busts overlap).
    float side = smoothstep(0.0, 0.10, uv.x) * (1.0 - smoothstep(0.90, 1.0, uv.x));
    _surface.diffuse.a *= side;
    _surface.transparent.a *= side;
    """

    // MARK: photo-relief

    private static func relief(officer: Persona, expression: DummyScene.Expression) -> SCNNode {
        let image = CutoutStore.image(officer: officer, expression: expression)
        let depth = CutoutStore.depth(officer: officer, expression: expression)
        let aspect = Float(image.size.width / max(image.size.height, 1))
        let width = height * aspect

        let field = heightField(depth: depth)
        let mouth = MouthStore.rect(for: "\(officer.id)-\(expression.rawValue)")

        // Split below the chin so the seam never crosses the mouth: mouth line + a face-height allowance.
        let neckV = min(max((mouth?.v ?? 0.31) + 0.12, 0.40), 0.60)
        let neckY = (0.5 - neckV) * height
        let neckRow = Int(neckV * Float(rows - 1))
        // NB: a cross-fade of the head layer's alpha over the overlap band was tried and rejected — SceneKit's
        // blending left a visible lighter band across the chest. The hard split stays clean because the head
        // pivots at the neck's real depth (below) and the two meshes share vertices/uv/material in the overlap.
        let material = makeMaterial(image: image, mouth: mouth)
        let body = mesh(field: field, width: width, material: material, rows: (neckRow - overlapRows)..<(rows - 1))
        body.name = "body"
        let head = mesh(field: field, width: width, material: material, rows: 0..<(neckRow + overlapRows))
        head.name = "head"
        // Head rotates about the neck, at the neck's actual depth (the relief puts it well in front of z = 0),
        // or turning it would shear the overlap rows sideways and open a seam across the shoulders.
        let neckZ = field.z[min(neckRow, rows - 1) * columns + columns / 2]
        head.pivot = SCNMatrix4MakeTranslation(0, neckY, neckZ)
        head.position = SCNVector3(0, neckY, neckZ)

        let root = SCNNode()
        root.addChildNode(body)
        root.addChildNode(head)
        root.addChildNode(backFace(image: image, width: width))
        return root
    }

    /// Lit photo material with the lip-sync shaders.
    private static func makeMaterial(image: UIImage, mouth: MouthStore.Rect?) -> SCNMaterial {
        let material = SCNMaterial()
        material.diffuse.contents = image
        material.lightingModel = .lambert
        material.isDoubleSided = true
        material.shaderModifiers = [.geometry: jawShader, .surface: mouthShader]
        let m = mouth ?? MouthStore.Rect(u: -5, v: 0, hw: 0.05, hh: 0.02, iw: 0.04)   // no mouth: cavity off-image
        let values: [(String, Float)] = [
            ("mouthU", m.u), ("mouthV", m.v), ("mouthHW", m.hw), ("mouthHH", m.hh), ("mouthIW", m.iw),
            ("mouthOpen", 0), ("mouthWide", 1),
        ]
        for (key, value) in values { material.setValue(NSNumber(value: value), forKey: key) }
        return material
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
