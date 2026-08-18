import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

private let canvasSize = 1024
private let bodySize = 824
private let bodyInset = 100

private func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

private func loadImage(_ path: String) -> CGImage {
  let url = URL(fileURLWithPath: path) as CFURL
  guard
    let source = CGImageSourceCreateWithURL(url, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    fail("Could not decode PNG: \(path)")
  }
  return image
}

guard CommandLine.arguments.count == 4 else {
  fail("Usage: compose-macos-pre-tahoe-icon.swift <native-shell.png> <native-body.png> <output.png>")
}

let shellPath = CommandLine.arguments[1]
let bodyPath = CommandLine.arguments[2]
let outputPath = CommandLine.arguments[3]
let shell = loadImage(shellPath)
let body = loadImage(bodyPath)

guard shell.width == canvasSize, shell.height == canvasSize else {
  fail("Native shell must be 1024x1024; got \(shell.width)x\(shell.height).")
}
guard body.width == bodySize, body.height == bodySize else {
  fail("Native body must be 824x824; got \(body.width)x\(body.height).")
}

guard
  let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
  let context = CGContext(
    data: nil,
    width: canvasSize,
    height: canvasSize,
    bitsPerComponent: 8,
    bytesPerRow: canvasSize * 4,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )
else {
  fail("Could not create the 1024x1024 bitmap context.")
}

context.translateBy(x: 0, y: CGFloat(canvasSize))
context.scaleBy(x: 1, y: -1)
context.setBlendMode(.copy)
context.draw(shell, in: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))
context.draw(
  body,
  in: CGRect(x: bodyInset, y: bodyInset, width: bodySize, height: bodySize)
)

guard let output = context.makeImage() else {
  fail("Could not create the composed macOS image.")
}

let outputUrl = URL(fileURLWithPath: outputPath) as CFURL
guard let destination = CGImageDestinationCreateWithURL(
  outputUrl,
  UTType.png.identifier as CFString,
  1,
  nil
) else {
  fail("Could not create PNG destination: \(outputPath)")
}
CGImageDestinationAddImage(destination, output, nil)
guard CGImageDestinationFinalize(destination) else {
  fail("Could not write PNG: \(outputPath)")
}
