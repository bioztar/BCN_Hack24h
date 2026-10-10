// Offline depth maps for the photo-relief bust.
// usage: swiftc -O depthgen.swift -o depthgen && ./depthgen <DepthAnythingV2SmallF16.mlmodelc> <outDir> <cutout.png>...
// For each `<name>.png` writes `<outDir>/<name>-depth.png`: 8-bit gray, 384 px wide, same aspect as the input,
// 255 = nearest point of the figure, 0 = background (outside the cut-out alpha).
import CoreImage
import CoreML
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

let args = CommandLine.arguments
guard args.count >= 4 else { print("usage: depthgen <model.mlmodelc> <outDir> <png...>"); exit(1) }
let model = try VNCoreMLModel(for: MLModel(contentsOf: URL(fileURLWithPath: args[1])))
let outDir = URL(fileURLWithPath: args[2])
let ci = CIContext()
let outW = 384

func gray8(_ w: Int, _ h: Int, alphaOnly: Bool = false) -> CGContext {
    CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
              space: alphaOnly ? CGColorSpaceCreateDeviceGray() : CGColorSpaceCreateDeviceGray(),
              bitmapInfo: alphaOnly ? CGImageAlphaInfo.alphaOnly.rawValue : CGImageAlphaInfo.none.rawValue)!
}

for path in args[3...] {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        print("skip (unreadable): \(path)"); continue
    }
    let w = img.width, h = img.height, outH = Int((Double(outW) * Double(h) / Double(w)).rounded())

    // Model input: the photo composited over mid-grey (transparent pixels have junk RGB).
    let rgbCtx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                           space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    rgbCtx.setFillColor(CGColor(gray: 0.5, alpha: 1))
    rgbCtx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    rgbCtx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))

    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFill
    try VNImageRequestHandler(cgImage: rgbCtx.makeImage()!).perform([request])
    guard let obs = request.results?.first as? VNPixelBufferObservation else { print("no depth output: \(path)"); continue }
    let depthCI = CIImage(cvPixelBuffer: obs.pixelBuffer)
    guard let depthImg = ci.createCGImage(depthCI, from: depthCI.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()) else {
        print("render failed: \(path)"); continue
    }

    let dCtx = gray8(outW, outH)
    dCtx.interpolationQuality = .high
    dCtx.draw(depthImg, in: CGRect(x: 0, y: 0, width: outW, height: outH))
    let aCtx = gray8(outW, outH, alphaOnly: true)
    aCtx.interpolationQuality = .high
    aCtx.draw(img, in: CGRect(x: 0, y: 0, width: outW, height: outH))
    let depth = dCtx.data!.assumingMemoryBound(to: UInt8.self)
    let alpha = aCtx.data!.assumingMemoryBound(to: UInt8.self)

    // Normalise on the figure only: 2nd...98th percentile -> 0...255.
    var fg: [UInt8] = []
    for i in 0..<(outW * outH) where alpha[i] > 128 { fg.append(depth[i]) }
    guard fg.count > 100 else { print("empty cut-out: \(path)"); continue }
    fg.sort()
    let lo = Double(fg[fg.count * 2 / 100]), hi = Double(fg[fg.count * 98 / 100])
    for i in 0..<(outW * outH) {
        if alpha[i] <= 128 { depth[i] = 0; continue }
        let v = (Double(depth[i]) - lo) / max(hi - lo, 1)
        depth[i] = UInt8(max(0, min(1, v)) * 254) + 1   // 1...255 so the figure never reads as "background"
    }

    let name = url.deletingPathExtension().lastPathComponent + "-depth.png"
    let dest = CGImageDestinationCreateWithURL(outDir.appendingPathComponent(name) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, dCtx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    print("ok \(name) \(outW)x\(outH)")
}
