import Cocoa

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: swift generate-icon.swift <output-iconset-dir>\n", stderr)
    exit(1)
}

let iconsetDir = URL(fileURLWithPath: args[1])
try FileManager.default.createDirectory(at: iconsetDir, withIntermediateDirectories: true)

func renderIcon(pixels: Int) -> Data {
    let size = NSSize(width: pixels, height: pixels)
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixels,
        pixelsHigh: pixels,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    rep.size = size

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        fatalError("No CGContext")
    }

    let s = CGFloat(pixels)
    let margin = s * 0.08
    let rect = CGRect(x: margin, y: margin, width: s - margin * 2, height: s - margin * 2)
    let radius = rect.width * 0.225

    // Soft drop shadow
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.025), blur: s * 0.045, color: NSColor(calibratedWhite: 0, alpha: 0.25).cgColor)
    let bgPath = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
    ctx.addPath(bgPath)
    ctx.setFillColor(NSColor(calibratedRed: 0.918, green: 0.345, blue: 0.047, alpha: 1.0).cgColor)
    ctx.fillPath()
    ctx.restoreGState()

    // Gradient fill clipped inside squircle
    ctx.saveGState()
    ctx.addPath(bgPath)
    ctx.clip()

    let colors = [
        NSColor(calibratedRed: 0.976, green: 0.451, blue: 0.086, alpha: 1.0).cgColor,
        NSColor(calibratedRed: 0.855, green: 0.278, blue: 0.031, alpha: 1.0).cgColor
    ] as CFArray
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.0, 1.0])!
    ctx.drawLinearGradient(
        gradient,
        start: CGPoint(x: rect.minX, y: rect.maxY),
        end: CGPoint(x: rect.maxX, y: rect.minY),
        options: []
    )

    // Subtle warm gold Bingo ball accent in top-right corner
    let ballSize = rect.width * 0.24
    let ballRect = CGRect(
        x: rect.maxX - ballSize - rect.width * 0.09,
        y: rect.maxY - ballSize - rect.width * 0.09,
        width: ballSize,
        height: ballSize
    )
    ctx.setFillColor(NSColor(calibratedRed: 0.980, green: 0.800, blue: 0.082, alpha: 1.0).cgColor)
    ctx.fillEllipse(in: ballRect)
    ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.9).cgColor)
    ctx.setLineWidth(max(1.5, s * 0.016))
    ctx.strokeEllipse(in: ballRect)

    // Subtle white inner border
    let innerRect = rect.insetBy(dx: s * 0.018, dy: s * 0.018)
    let innerPath = CGPath(roundedRect: innerRect, cornerWidth: radius * 0.92, cornerHeight: radius * 0.92, transform: nil)
    ctx.addPath(innerPath)
    ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.22).cgColor)
    ctx.setLineWidth(max(1.0, s * 0.014))
    ctx.strokePath()
    ctx.restoreGState()

    // Bold italic "L" lettermark
    let fontSize = s * 0.56
    let baseFont = NSFont.systemFont(ofSize: fontSize, weight: .black)
    let italicDesc = baseFont.fontDescriptor.withSymbolicTraits([.bold, .italic])
    let font = NSFont(descriptor: italicDesc, size: fontSize) ?? baseFont
    let shadow = NSShadow()
    shadow.shadowOffset = NSSize(width: 0, height: -s * 0.018)
    shadow.shadowBlurRadius = s * 0.03
    shadow.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.28)

    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor.white,
        .shadow: shadow
    ]
    let str = NSAttributedString(string: "L", attributes: attrs)
    let textSize = str.size()
    let drawPoint = NSPoint(
        x: (s - textSize.width) / 2.0 - s * 0.03,
        y: (s - textSize.height) / 2.0 - s * 0.02
    )
    str.draw(at: drawPoint)

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let specs: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (filename, px) in specs {
    let png = renderIcon(pixels: px)
    try png.write(to: iconsetDir.appendingPathComponent(filename))
}
print("Generated \(specs.count) iconset PNGs in \(iconsetDir.path)")
