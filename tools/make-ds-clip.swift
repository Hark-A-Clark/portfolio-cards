// Renders the Planet A design-system demo clip: an AI prompt types in, the real SolutionCard
// (captured from Storybook into tools/ds-frames/) appears, then cycles Light → Dark → High contrast → Arabic RTL.
// The loop starts and ends on the finished Light state, so the poster (frame 0) shows the whole idea.
// usage: swift tools/make-ds-clip.swift    → media/design-system.mp4 + .jpg
import AVFoundation; import AppKit

let W = 1280, H = 720, FPS = 30, DURATION = 11.0
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let PROMPT = "Build a SolutionCard from our design tokens: org identity with verification, language badge, climate-zone chips, and Q&A, Replications and Bookmarks stats. It has to work in light, dark, high contrast and right-to-left."

struct State { let file: String; let card: CGRect; let stage: NSColor; let pill: Int }
// card = the SolutionCard's rect inside each capture (captured at 1.6× CSS px).
let states = [
  State(file: "light", card: CGRect(x: 24, y: 22, width: 544, height: 636), stage: NSColor(srgbRed: 0.93, green: 0.945, blue: 0.957, alpha: 1), pill: 0),
  State(file: "dark", card: CGRect(x: 24, y: 22, width: 544, height: 636), stage: NSColor(srgbRed: 0.075, green: 0.082, blue: 0.094, alpha: 1), pill: 1),
  State(file: "high-contrast", card: CGRect(x: 24, y: 22, width: 544, height: 636), stage: NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1), pill: 2),
  State(file: "arabic", card: CGRect(x: 8, y: 8, width: 544, height: 628), stage: NSColor(srgbRed: 0.93, green: 0.945, blue: 0.957, alpha: 1), pill: 3),
]
let images: [CGImage] = states.map { s in
  let src = NSImage(contentsOf: root.appendingPathComponent("tools/ds-frames/\(s.file).png"))!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  return src.cropping(to: s.card)!
}
let pills = ["Light", "Dark", "High contrast", "العربية · RTL"]

// Timeline (seconds). Each entry: (start, end, from state, to state); outside transitions we hold.
// 0–1.4 light · →dark · →HC · →Arabic · 6.8 card out, prompt clears · 7.2–9.8 typing · 9.8–10.4 card in · hold to 11.
func smooth(_ x: Double) -> Double { let t = max(0, min(1, x)); return t * t * (3 - 2 * t) }
func lerp(_ a: CGFloat, _ b: CGFloat, _ t: Double) -> CGFloat { a + (b - a) * CGFloat(t) }
func mix(_ a: NSColor, _ b: NSColor, _ t: Double) -> NSColor {
  NSColor(srgbRed: lerp(a.redComponent, b.redComponent, t), green: lerp(a.greenComponent, b.greenComponent, t), blue: lerp(a.blueComponent, b.blueComponent, t), alpha: 1)
}
let switches: [(Double, Int)] = [(1.4, 1), (3.2, 2), (5.0, 3)] // time, new state; each crossfades over 0.4s

func frameState(_ t: Double) -> (from: Int, to: Int, mixT: Double, cardAlpha: Double, cardLift: Double, typed: Int, promptAlpha: Double) {
  var from = 0, to = 0, m = 0.0
  for (st, s) in switches where t >= st { from = to; to = s; m = smooth((t - st) / 0.4) }
  if t < 1.4 { from = 0; to = 0; m = 1 }
  var cardAlpha = 1.0, lift = 0.0, typed = PROMPT.count, promptAlpha = 1.0
  if t >= 6.8 && t < 7.2 { cardAlpha = 1 - smooth((t - 6.8) / 0.4); promptAlpha = cardAlpha }
  if t >= 7.2 { from = 0; to = 0; m = 1; promptAlpha = 1
    typed = min(PROMPT.count, Int(Double(PROMPT.count) * (t - 7.2) / 2.6))
    cardAlpha = smooth((t - 9.8) / 0.6); lift = 1 - cardAlpha }
  return (from, to, m, cardAlpha, lift, typed, promptAlpha)
}

func roundedPath(_ r: CGRect, _ rad: CGFloat) -> CGPath { CGPath(roundedRect: r, cornerWidth: rad, cornerHeight: rad, transform: nil) }

func draw(_ ctx: CGContext, _ t: Double) {
  let f = frameState(t)
  let stage = mix(states[f.from].stage, states[f.to].stage, f.mixT)
  ctx.setFillColor(stage.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)

  // Prompt panel (left): constant dark "terminal" surface so it reads on every stage colour.
  let panel = CGRect(x: 56, y: 92, width: 560, height: 536)
  ctx.saveGState(); ctx.setShadow(offset: CGSize(width: 0, height: -6), blur: 24, color: NSColor(white: 0, alpha: 0.18).cgColor)
  ctx.addPath(roundedPath(panel, 18)); ctx.setFillColor(NSColor(srgbRed: 0.106, green: 0.122, blue: 0.141, alpha: 1).cgColor); ctx.fillPath(); ctx.restoreGState()
  let label: [NSAttributedString.Key: Any] = [.font: NSFont.monospacedSystemFont(ofSize: 17, weight: .semibold), .foregroundColor: NSColor(srgbRed: 0.45, green: 0.85, blue: 0.6, alpha: 1)]
  ("✦ AI prompt" as NSString).draw(at: NSPoint(x: panel.minX + 32, y: panel.maxY - 52), withAttributes: label)
  ctx.setFillColor(NSColor(white: 1, alpha: 0.08).cgColor); ctx.fill(CGRect(x: panel.minX + 32, y: panel.maxY - 66, width: panel.width - 64, height: 1))

  let para = NSMutableParagraphStyle(); para.lineSpacing = 9
  let body: [NSAttributedString.Key: Any] = [.font: NSFont.monospacedSystemFont(ofSize: 25, weight: .regular), .foregroundColor: NSColor(white: 1, alpha: 0.94 * f.promptAlpha), .paragraphStyle: para]
  var shown = String(PROMPT.prefix(f.typed))
  let typing = t >= 7.2 && f.typed < PROMPT.count
  if typing || Int(t * 2) % 2 == 0 { shown += "▍" }
  let textRect = CGRect(x: panel.minX + 32, y: panel.minY + 40, width: panel.width - 64, height: panel.height - 130)
  (NSString(string: "› ") as NSString).draw(at: NSPoint(x: textRect.minX - 2, y: textRect.maxY - 32), withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: 25, weight: .bold), .foregroundColor: NSColor(srgbRed: 0.45, green: 0.85, blue: 0.6, alpha: f.promptAlpha)])
  NSString(string: shown).draw(with: CGRect(x: textRect.minX + 30, y: textRect.minY, width: textRect.width - 30, height: textRect.height), options: [.usesLineFragmentOrigin], attributes: body)

  // Card (right): crossfade between captured states, rounded mask + soft shadow.
  let cx = 640.0 + 320.0, scale = 560.0 / 636.0
  func cardRect(_ img: CGImage) -> CGRect {
    let w = CGFloat(img.width) * scale, h = CGFloat(img.height) * scale
    return CGRect(x: cx - w / 2, y: (Double(H) - h) / 2 - f.cardLift * 24, width: w, height: h)
  }
  func drawCard(_ i: Int, _ alpha: Double) {
    guard alpha > 0.001 else { return }
    let img = images[i], r = cardRect(img)
    ctx.saveGState(); ctx.setAlpha(alpha * f.cardAlpha)
    ctx.beginTransparencyLayer(auxiliaryInfo: nil)
    ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 30, color: NSColor(white: 0, alpha: 0.22).cgColor)
    ctx.addPath(roundedPath(r, 12 * 1.6 * scale)); ctx.setFillColor(NSColor.white.cgColor); ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)
    ctx.addPath(roundedPath(r, 12 * 1.6 * scale)); ctx.clip(); ctx.draw(img, in: r)
    ctx.endTransparencyLayer(); ctx.restoreGState()
  }
  if f.from == f.to || f.mixT >= 1 { drawCard(f.to, 1) } else { drawCard(f.from, 1 - f.mixT); drawCard(f.to, f.mixT) }

  // Theme pills under the prompt: which state is showing.
  var x = panel.minX + 32
  let active = f.mixT > 0.5 ? states[f.to].pill : states[f.from].pill
  for (i, p) in pills.enumerated() {
    let on = i == active && f.cardAlpha > 0.5
    let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 17, weight: .semibold), .foregroundColor: on ? NSColor(srgbRed: 0.07, green: 0.09, blue: 0.1, alpha: 1) : NSColor(white: 1, alpha: 0.6)]
    let s = NSAttributedString(string: p, attributes: attrs); let sz = s.size()
    let pr = CGRect(x: x, y: panel.minY + 28, width: sz.width + 28, height: 38)
    ctx.addPath(roundedPath(pr, 19))
    if on { ctx.setFillColor(NSColor(srgbRed: 0.45, green: 0.85, blue: 0.6, alpha: 1).cgColor); ctx.fillPath() }
    else { ctx.setStrokeColor(NSColor(white: 1, alpha: 0.18).cgColor); ctx.setLineWidth(1.5); ctx.strokePath() }
    s.draw(at: NSPoint(x: pr.minX + 14, y: pr.minY + (38 - sz.height) / 2))
    x = pr.maxX + 10
  }
}

// Encode.
let out = root.appendingPathComponent("media/design-system.mp4"); try? FileManager.default.removeItem(at: out)
let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4); writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_800_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: 60, AVVideoAllowFrameReorderingKey: false]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let frames = Int(DURATION * Double(FPS)); var poster: CGImage?
for i in 0..<frames {
  while !input.isReadyForMoreMediaData { usleep(2000) }
  var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)!
  draw(ctx, Double(i) / Double(FPS))
  if i == 0 { poster = ctx.makeImage() }
  CVPixelBufferUnlockBaseAddress(pb!, [])
  adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(FPS)))
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
let jpg = NSBitmapImageRep(cgImage: poster!).representation(using: .jpeg, properties: [.compressionFactor: 0.82])!
try! jpg.write(to: root.appendingPathComponent("media/design-system.jpg"))
let size = (try! FileManager.default.attributesOfItem(atPath: out.path)[.size] as! Int)
print(String(format: "design-system  %.1fs  %.2f MB  poster %d KB  status %d", DURATION, Double(size) / 1e6, jpg.count / 1000, writer.status.rawValue))
