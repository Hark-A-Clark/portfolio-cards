// Turns a raw screen recording into a card demo clip + poster, using macOS's built-in AVFoundation.
// usage: swift tools/make-clip.swift clips.json [name]
// clips.json: [{ "name", "source", "mode": "desktop"|"phone"|"mockup",
//   "segments": [{"start","end","speed"}], "blur": [{"start","end","rect":[x,y,w,h]}] (source px, top-left origin, source seconds) }]
import AVFoundation; import CoreImage; import AppKit

struct Seg: Decodable { let start: Double; let end: Double; let speed: Double? }
struct Blur: Decodable { let start: Double; let end: Double; let rect: [Double] }
// mockup mode: plays the recording inside the phone screen of a static mockup image.
//   image: mockup png; panel: [x,y,w,h] an area inside its coloured panel (clear of rounded corners and the baked-in shadow);
//   color: panel hex, for the card's own background;
//   screen: [x,y,w,h] where the recording goes (mockup px); radius: screen corner radius; crop: [x,y,w,h] recording px to use;
//   border: optional hex for a 1px outline redrawn around the screen. All rects use top-left origin.
struct Mockup: Decodable { let image: String; let panel: [Double]; let color: String; let screen: [Double]; let radius: Double; let crop: [Double]; let border: String? }
struct Clip: Decodable { let name: String; let source: String; let mode: String; let segments: [Seg]; let blur: [Blur]?; let phoneWidth: Double?; let offsetY: Double?; let mockup: Mockup? }

func ciColor(_ hex: String) -> CIColor {
  let v = Int(hex.dropFirst(), radix: 16)!
  return CIColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255)
}

let W = 1280.0, H = 720.0, FPS: Int32 = 30, BITRATE = 2_000_000
let bg = CIImage(color: CIColor(red: 0.957, green: 0.965, blue: 0.973)) // #f4f6f8 behind phone clips

let args = CommandLine.arguments
let cfgURL = URL(fileURLWithPath: args[1]); let base = cfgURL.deletingLastPathComponent().deletingLastPathComponent()
let clips = try! JSONDecoder().decode([Clip].self, from: Data(contentsOf: cfgURL)).filter { args.count < 3 || $0.name == args[2] }

func run(_ c: Clip) async throws {
  let src = AVURLAsset(url: base.appendingPathComponent(c.source))
  let srcTrack = try await src.loadTracks(withMediaType: .video)[0]
  let natural = try await srcTrack.load(.naturalSize)
  let comp = AVMutableComposition()
  let track = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
  var cursor = CMTime.zero
  var map: [(outStart: Double, outEnd: Double, srcStart: Double, speed: Double)] = []
  for s in c.segments {
    let r = CMTimeRange(start: CMTime(seconds: s.start, preferredTimescale: 600), end: CMTime(seconds: s.end, preferredTimescale: 600))
    try track.insertTimeRange(r, of: srcTrack, at: cursor)
    let sp = s.speed ?? 1, outDur = (s.end - s.start) / sp
    track.scaleTimeRange(CMTimeRange(start: cursor, duration: r.duration), toDuration: CMTime(seconds: outDur, preferredTimescale: 600))
    map.append((cursor.seconds, cursor.seconds + outDur, s.start, sp))
    cursor = cursor + CMTime(seconds: outDur, preferredTimescale: 600)
  }
  func srcTime(_ t: Double) -> Double { for m in map where t < m.outEnd { return m.srcStart + (t - m.outStart) * m.speed }; return map.last!.srcStart }
  let srcH = Double(natural.height), srcW = Double(natural.width)
  let mockupImage = c.mockup.map { CIImage(contentsOf: base.appendingPathComponent($0.image))! }

  let vc = AVMutableVideoComposition(asset: comp) { req in
    var img = req.sourceImage
    let st = srcTime(req.compositionTime.seconds)
    for b in c.blur ?? [] where st >= b.start && st < b.end {
      let r = CGRect(x: b.rect[0], y: srcH - b.rect[1] - b.rect[3], width: b.rect[2], height: b.rect[3])
      let blurred = img.clampedToExtent().applyingGaussianBlur(sigma: 28).cropped(to: r)
      img = blurred.composited(over: img)
    }
    var out: CIImage
    if c.mode == "mockup", let m = c.mockup {
      // Mockup is scaled so its panel fills the frame height and centred; the panel colour fills the sides.
      let mock = mockupImage!, mh = mock.extent.height
      let s = H / m.panel[3]
      let ox = (W - m.panel[2] * s) / 2 - m.panel[0] * s
      let oy = -(mh - m.panel[1] - m.panel[3]) * s // CI origin is bottom-left
      let place = CGAffineTransform(scaleX: s, y: s).concatenating(CGAffineTransform(translationX: ox, y: oy))
      let panelRect = CGRect(x: m.panel[0], y: mh - m.panel[1] - m.panel[3], width: m.panel[2], height: m.panel[3])
      // panel is cropped inside the mockup's rounded corners; its edge pixels are stretched outward to fill the frame
      var frame = mock.cropped(to: panelRect).clampedToExtent().transformed(by: place)
      // screen rect in output coords
      let sr = CGRect(x: m.screen[0], y: mh - m.screen[1] - m.screen[3], width: m.screen[2], height: m.screen[3]).applying(place)
      // recording crop (top-left px → CI coords), scaled to cover the screen, pinned to the top
      let cr = CGRect(x: m.crop[0], y: srcH - m.crop[1] - m.crop[3], width: m.crop[2], height: m.crop[3])
      let k = max(sr.width / cr.width, sr.height / cr.height)
      let rec = img.cropped(to: cr).transformed(by: CGAffineTransform(translationX: -cr.minX, y: -cr.minY))
        .transformed(by: CGAffineTransform(scaleX: k, y: k))
        .transformed(by: CGAffineTransform(translationX: sr.midX - cr.width * k / 2, y: sr.maxY - cr.height * k))
      let rr = m.radius * s
      let mask = CIFilter(name: "CIRoundedRectangleGenerator", parameters: ["inputExtent": CIVector(cgRect: sr), "inputRadius": rr, "inputColor": CIColor.white])!.outputImage!
      frame = rec.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: frame, kCIInputMaskImageKey: mask])
      if let b = m.border, let stroke = CIFilter(name: "CIRoundedRectangleStrokeGenerator", parameters: ["inputExtent": CIVector(cgRect: sr), "inputRadius": rr, "inputWidth": 1.2, "inputColor": ciColor(b)])?.outputImage {
        frame = stroke.composited(over: frame)
      }
      out = frame
    } else if c.mode == "phone" {
      // phoneWidth (share of frame width) zooms in: the phone is pinned near the top and runs off the bottom edge.
      // offsetY (source px) shifts the phone up to show a lower part of the screen.
      let scale = c.phoneWidth.map { $0 * W / srcW } ?? (H - 40) / srcH
      let y = c.phoneWidth == nil ? 20 : H - 28 - srcH * scale + (c.offsetY ?? 0) * scale
      let p = img.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      out = p.transformed(by: CGAffineTransform(translationX: (W - srcW * scale) / 2, y: y)).composited(over: bg)
    } else {
      // center-crop to 16:9, then scale to fill
      let cw = min(srcW, srcH * 16 / 9), ch = min(srcH, srcW * 9 / 16)
      let crop = CGRect(x: (srcW - cw) / 2, y: (srcH - ch) / 2, width: cw, height: ch)
      let s = W / cw
      out = img.cropped(to: crop).transformed(by: CGAffineTransform(translationX: -crop.minX, y: -crop.minY)).transformed(by: CGAffineTransform(scaleX: s, y: s))
    }
    req.finish(with: out.cropped(to: CGRect(x: 0, y: 0, width: W, height: H)), context: nil)
  }
  vc.renderSize = CGSize(width: W, height: H)
  vc.frameDuration = CMTime(value: 1, timescale: FPS)

  let outURL = base.appendingPathComponent("media/\(c.name).mp4")
  try? FileManager.default.removeItem(at: outURL)
  let reader = try AVAssetReader(asset: comp)
  let ro = AVAssetReaderVideoCompositionOutput(videoTracks: comp.tracks(withMediaType: .video), videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  ro.videoComposition = vc; reader.add(ro)
  let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
  writer.shouldOptimizeForNetworkUse = true
  let wi = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: BITRATE, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: 60, AVVideoAllowFrameReorderingKey: false]])
  wi.expectsMediaDataInRealTime = false; writer.add(wi)
  reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: .zero)
  while true {
    while !wi.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
    guard let sb = ro.copyNextSampleBuffer() else { break }
    wi.append(sb)
  }
  wi.markAsFinished(); await writer.finishWriting()
  if writer.status != .completed { throw writer.error ?? NSError(domain: "write", code: 1) }

  // poster = first frame, so nothing jumps when playback starts
  let gen = AVAssetImageGenerator(asset: AVURLAsset(url: outURL)); gen.requestedTimeToleranceAfter = .zero
  let (cg, _) = try await gen.image(at: .zero)
  let jpg = NSBitmapImageRep(cgImage: cg).representation(using: .jpeg, properties: [.compressionFactor: 0.8])!
  try jpg.write(to: base.appendingPathComponent("media/\(c.name).jpg"))
  let size = (try FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as! Int)
  print(String(format: "%@  %.1fs  %.2f MB  poster %d KB", c.name, cursor.seconds, Double(size) / 1e6, jpg.count / 1000))
}

let sem = DispatchSemaphore(value: 0)
Task { for c in clips { do { try await run(c) } catch { print("FAILED \(c.name): \(error)") } }; sem.signal() }
sem.wait()
