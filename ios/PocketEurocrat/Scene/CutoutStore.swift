import UIKit

extension UIColor {
    convenience init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}

/// Cut-out images: `<officer>-<expression>.png` bundled in the app (assets/generated/cutout from the
/// Picsart pipeline). Anything missing falls back to a drawn placeholder bust, so the toy always works.
enum CutoutStore {
    static func image(officer: Persona, expression: DummyScene.Expression) -> UIImage {
        let name = "\(officer.id)-\(expression.rawValue)"
        if let path = Bundle.main.path(forResource: name, ofType: "png"), let img = UIImage(contentsOfFile: path) { return img }
        return placeholder(color: UIColor(hex: officer.color), expression: expression)
    }

    /// Is this exact cut-out bundled? (The drawn placeholder is not a substitute for burning/outrage.)
    static func has(officer: Persona, expression: DummyScene.Expression) -> Bool {
        Bundle.main.path(forResource: "\(officer.id)-\(expression.rawValue)", ofType: "png") != nil
    }

    struct DepthMap {
        let bytes: [UInt8]
        let width: Int
        let height: Int
    }

    /// `<officer>-<expression>-depth.png` (8-bit gray, 0 = background). nil -> flat card.
    static func depth(officer: Persona, expression: DummyScene.Expression) -> DepthMap? {
        let name = "\(officer.id)-\(expression.rawValue)-depth"
        guard let path = Bundle.main.path(forResource: name, ofType: "png"),
              let cg = UIImage(contentsOfFile: path)?.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h)
        let drawn = bytes.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? DepthMap(bytes: bytes, width: w, height: h) : nil
    }

    static func placeholder(color: UIColor, expression: DummyScene.Expression) -> UIImage {
        let size = CGSize(width: 600, height: 800)
        return UIGraphicsImageRenderer(size: size).image { r in
            let g = r.cgContext
            let skin = UIColor(red: 0.96, green: 0.82, blue: 0.70, alpha: 1)
            // shoulders + tie
            color.setFill()
            UIBezierPath(roundedRect: CGRect(x: 20, y: 520, width: 560, height: 300), byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: 170, height: 170)).fill()
            UIColor(red: 0.1, green: 0.2, blue: 0.7, alpha: 1).setFill()
            UIBezierPath(roundedRect: CGRect(x: 280, y: 540, width: 40, height: 200), cornerRadius: 8).fill()
            // neck + head
            skin.setFill()
            UIBezierPath(rect: CGRect(x: 250, y: 440, width: 100, height: 120)).fill()
            UIBezierPath(ovalIn: CGRect(x: 170, y: 140, width: 260, height: 320)).fill()
            // face
            UIColor.black.setFill(); UIColor.black.setStroke()
            g.setLineWidth(8); g.setLineCap(.round)
            func dot(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) { UIBezierPath(ovalIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)).fill() }
            func line(_ a: CGPoint, _ b: CGPoint) { g.move(to: a); g.addLine(to: b); g.strokePath() }
            func arc(_ cx: CGFloat, _ cy: CGFloat, _ w: CGFloat, up: Bool) {
                g.addArc(center: CGPoint(x: cx, y: cy), radius: w, startAngle: up ? .pi : 0, endAngle: up ? 0 : .pi, clockwise: !up)
                g.strokePath()
            }
            switch expression {
            case .neutral:
                dot(250, 290, 13); dot(350, 290, 13)
                line(CGPoint(x: 260, y: 390), CGPoint(x: 340, y: 390))
            case .stamping:
                dot(250, 300, 10); dot(350, 300, 10)
                line(CGPoint(x: 220, y: 262), CGPoint(x: 275, y: 280)); line(CGPoint(x: 380, y: 262), CGPoint(x: 325, y: 280))
                line(CGPoint(x: 255, y: 395), CGPoint(x: 345, y: 395))
            case .smug:
                line(CGPoint(x: 232, y: 292), CGPoint(x: 272, y: 292)); line(CGPoint(x: 328, y: 292), CGPoint(x: 368, y: 292))
                arc(310, 370, 45, up: false)
            case .appalled, .burning, .outrage:
                UIColor.white.setFill()
                UIBezierPath(ovalIn: CGRect(x: 220, y: 255, width: 60, height: 60)).fill()
                UIBezierPath(ovalIn: CGRect(x: 320, y: 255, width: 60, height: 60)).fill()
                UIColor.black.setFill(); dot(250, 285, 9); dot(350, 285, 9)
                UIBezierPath(ovalIn: CGRect(x: 275, y: 360, width: 50, height: 60)).fill()
            case .asleep:
                arc(250, 292, 22, up: false); arc(350, 292, 22, up: false)
                dot(300, 392, 8)
                ("z" as NSString).draw(at: CGPoint(x: 410, y: 150), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 60), .foregroundColor: UIColor.white])
            }
        }
    }
}
