// Finds the mouth on each cut-out once, with Apple Vision face landmarks (outer lips).
// usage: swiftc -O mouthgen.swift -o mouthgen && ./mouthgen <out.json> <cutout.png>...
// Output: { "<name>": [u, v, halfWidth, halfHeight, innerHalfWidth] } in image fractions (u from left, v from TOP).
// Images with no detectable face (object-form officers) are listed on stderr; give them an entry by hand
// in tools/mouths-manual.json (merged by the app at load time).
import CoreGraphics
import Foundation
import ImageIO
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: mouthgen <out.json> <png...>"); exit(1) }
var out: [String: [Double]] = [:]
var missing: [String] = []

for path in args[2...] {
    let url = URL(fileURLWithPath: path)
    let name = url.deletingPathExtension().lastPathComponent
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        missing.append(name); continue
    }
    // Composite over mid-grey: transparent pixels have junk RGB.
    let w = img.width, h = img.height
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(gray: 0.5, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))

    let request = VNDetectFaceLandmarksRequest()
    try VNImageRequestHandler(cgImage: ctx.makeImage()!).perform([request])
    guard let face = (request.results as? [VNFaceObservation])?.max(by: { $0.boundingBox.width < $1.boundingBox.width }),
          let lips = face.landmarks?.outerLips, lips.pointCount > 4 else {
        missing.append(name); continue
    }
    let bb = face.boundingBox   // normalized, origin bottom-left
    let pts = lips.normalizedPoints.map { (x: bb.minX + CGFloat($0.x) * bb.width, y: bb.minY + CGFloat($0.y) * bb.height) }
    let xs = pts.map(\.x), ys = pts.map(\.y)
    let (x0, x1, y0, y1) = (xs.min()!, xs.max()!, ys.min()!, ys.max()!)
    // Inner lips: the cavity can never be wider than the gap between the lip corners.
    var innerHalfWidth = (x1 - x0) / 2 * 0.85
    if let inner = face.landmarks?.innerLips, inner.pointCount > 3 {
        let ix = inner.normalizedPoints.map { bb.minX + CGFloat($0.x) * bb.width }
        innerHalfWidth = (ix.max()! - ix.min()!) / 2
    }
    out[name] = [
        Double((x0 + x1) / 2), Double(1 - (y0 + y1) / 2),          // centre (v from the top)
        Double((x1 - x0) / 2 * 1.15), Double(max((y1 - y0) / 2 * 1.5, 0.012)),   // half size, a little generous
        Double(innerHalfWidth),                                    // inner-lips half width
    ]
    print("ok \(name)")
}

let data = try JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys])
try data.write(to: URL(fileURLWithPath: args[1]))
if !missing.isEmpty { FileHandle.standardError.write(Data(("no face: " + missing.sorted().joined(separator: ", ") + "\n").utf8)) }
