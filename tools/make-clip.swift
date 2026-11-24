// Turns a raw screen recording into a card demo clip + poster, using macOS's built-in AVFoundation.
// usage: swift tools/make-clip.swift clips.json [name]
// clips.json: [{ "name", "source", "mode": "desktop"|"phone",
//   "segments": [{"start","end","speed"}], "blur": [{"start","end","rect":[x,y,w,h]}] (source px, top-left origin, source seconds) }]
import AVFoundation; import CoreImage; import AppKit

struct Seg: Decodable { let start: Double; let end: Double; let speed: Double? }
struct Blur: Decodable { let start: Double; let end: Double; let rect: [Double] }
struct Clip: Decodable { let name: String; let source: String; let mode: String; let segments: [Seg]; let blur: [Blur]?; let phoneWidth: Double?; let offsetY: Double? }

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

  let vc = AVMutableVideoComposition(asset: comp) { req in
    var img = req.sourceImage
    let st = srcTime(req.compositionTime.seconds)
    for b in c.blur ?? [] where st >= b.start && st < b.end {
      let r = CGRect(x: b.rect[0], y: srcH - b.rect[1] - b.rect[3], width: b.rect[2], height: b.rect[3])
      let blurred = img.clampedToExtent().applyingGaussianBlur(sigma: 28).cropped(to: r)
      img = blurred.composited(over: img)
    }
    var out: CIImage
    if c.mode == "phone" {
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
