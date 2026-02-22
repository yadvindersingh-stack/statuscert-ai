import Foundation
import PDFKit
import Vision
import AppKit

func renderPage(_ page: PDFPage, scale: CGFloat = 2.0) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let width = max(Int(bounds.width * scale), 1)
    let height = max(Int(bounds.height * scale), 1)

    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
    guard let ctx = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }

    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
    ctx.saveGState()
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    ctx.restoreGState()

    return ctx.makeImage()
}

func ocrImage(_ image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return ""
    }

    guard let observations = request.results as? [VNRecognizedTextObservation] else { return "" }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    return lines.joined(separator: "\n")
}

let args = CommandLine.arguments
if args.count < 3 {
    fputs("Usage: pdf_ocr.swift <input.pdf> <output.txt> [max_pages]\n", stderr)
    exit(1)
}

let input = args[1]
let output = args[2]
let maxPages = args.count >= 4 ? (Int(args[3]) ?? 50) : 50

let inputURL = URL(fileURLWithPath: input)
guard let doc = PDFDocument(url: inputURL) else {
    fputs("Failed to open PDF: \(input)\n", stderr)
    exit(2)
}

let pageCount = min(doc.pageCount, maxPages)
var allText: [String] = []

for i in 0..<pageCount {
    guard let page = doc.page(at: i), let image = renderPage(page) else { continue }
    let text = ocrImage(image)
    allText.append("\n\n--- PAGE \(i + 1) ---\n\n\(text)")
}

let joined = allText.joined(separator: "\n")
do {
    try joined.write(to: URL(fileURLWithPath: output), atomically: true, encoding: .utf8)
    print("WROTE", output, "chars", joined.count)
} catch {
    fputs("Failed to write output: \(error)\n", stderr)
    exit(3)
}
