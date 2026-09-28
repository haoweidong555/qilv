// 栖旅 · 城市视频处理工具（macOS 自带 AVFoundation，无需 ffmpeg）
//
// 用法：
//   1) 生成分帧预览图，用来挑选要剪的片段：
//      swift tools/video.swift contact <源视频> <输出预览图.png> [帧数，默认12]
//
//   2) 剪出一段网页用的短片（H.264 / 无音轨，适合做静音循环背景）：
//      swift tools/video.swift clip <源视频> <输出.mp4> <开始秒> <时长秒> [封面.jpg] [--speed 4] [--width 1280]
//      --speed 把长镜头压成加速短片（4 表示 4 倍速，输出时长 = 时长 / 4）
//      --width 输出宽度，默认 1280；高度按画面比例自动取偶数
//
//   3) 抽一帧做背景图 / 头图（自动去黑边，输出 JPEG）：
//      swift tools/video.swift frame <源视频> <输出.jpg> <秒> [宽度] [JPEG质量] [再裁掉底部百分比]
//
// 例子：
//   swift tools/video.swift contact "大理/1.mp4" /tmp/dali-sheet.png 12
//   swift tools/video.swift clip "大理/1.mp4" assets/video/dali.mp4 62 9 assets/video/dali-poster.jpg
//   swift tools/video.swift frame "大理/1.mp4" assets/img/hero-dali.jpg 33 2560
//   swift tools/video.swift clip stock.mp4 assets/video/x.mp4 0 20 assets/video/x-poster.jpg --speed 4

import Foundation
import AVFoundation
import AppKit

// ---------------- 通用 ----------------

/// 取一帧原始分辨率的画面
func grabFrame(asset: AVAsset, at seconds: Double) -> CGImage? {
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = CMTime(seconds: 0.2, preferredTimescale: 600)
    gen.requestedTimeToleranceAfter = CMTime(seconds: 0.2, preferredTimescale: 600)
    return try? gen.copyCGImage(at: CMTime(seconds: seconds, preferredTimescale: 600), actualTime: nil)
}

/// 探测画面上下是否带电影黑边（很多航拍/纪录片素材会把宽画幅压进 16:9）
/// 返回实际画面所在的像素范围：top 为上方黑边高度，bottom 为下方黑边高度
func detectPictureBars(_ cg: CGImage) -> (top: Int, bottom: Int) {
    let rep = NSBitmapImageRep(cgImage: cg)
    let w = rep.pixelsWide, h = rep.pixelsHigh
    if w == 0 || h == 0 { return (0, 0) }
    let stepX = max(1, w / 80)

    func rowLuma(_ y: Int) -> Double {
        var sum = 0.0, n = 0, x = 0
        while x < w {
            if let c = rep.colorAt(x: x, y: y) {
                sum += 0.299 * Double(c.redComponent) + 0.587 * Double(c.greenComponent) + 0.114 * Double(c.blueComponent)
                n += 1
            }
            x += stepX
        }
        return n == 0 ? 0 : sum / Double(n)
    }

    var rows = [Double](repeating: 0, count: h)
    for y in 0..<h { rows[y] = rowLuma(y) }
    let overall = rows.reduce(0, +) / Double(h)
    let thresh = max(0.03, overall * 0.3)

    var top = 0
    while top < h && rows[top] < thresh { top += 1 }
    var bottom = 0
    while bottom < h - top && rows[h - 1 - bottom] < thresh { bottom += 1 }

    // 黑边超过画面 35% 基本属于误判（比如夜景本身很暗），不做裁切
    if Double(top + bottom) > Double(h) * 0.35 { return (0, 0) }
    return (top, bottom)
}

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write(("错误：" + msg + "\n").data(using: .utf8)!)
    exit(1)
}

func writeImage(_ image: NSImage, to path: String, asJPEG: Bool, quality: Double = 0.86) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff) else { fail("无法生成图片数据") }
    let data = asJPEG
        ? rep.representation(using: .jpeg, properties: [.compressionFactor: quality])
        : rep.representation(using: .png, properties: [:])
    guard let out = data else { fail("无法编码图片") }
    do { try out.write(to: URL(fileURLWithPath: path)) }
    catch { fail("写入失败 \(path)：\(error.localizedDescription)") }
}

// ---------------- 分帧预览 ----------------

func makeContactSheet(src: String, dst: String, count: Int) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: src))
    let duration = CMTimeGetSeconds(asset.duration)
    if duration.isNaN || duration <= 0 { fail("读不到视频时长") }

    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.maximumSize = CGSize(width: 560, height: 560)
    gen.requestedTimeToleranceBefore = CMTime(seconds: 0.4, preferredTimescale: 600)
    gen.requestedTimeToleranceAfter = CMTime(seconds: 0.4, preferredTimescale: 600)

    var frames: [(Double, NSImage)] = []
    for i in 0..<count {
        let t = min(duration - 0.05, duration * Double(i) / Double(count) + 0.05)
        do {
            let cg = try gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
            frames.append((t, NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))))
        } catch {
            FileHandle.standardError.write("跳过 \(String(format: "%.1f", t))s：\(error.localizedDescription)\n".data(using: .utf8)!)
        }
    }
    if frames.isEmpty { fail("没有取到任何帧") }

    let cols = 4
    let rows = Int(ceil(Double(frames.count) / Double(cols)))
    let cellW = 480, cellH = 270, gap = 6
    let sheetW = cols * cellW + (cols + 1) * gap
    let sheetH = rows * cellH + (rows + 1) * gap

    let sheet = NSImage(size: NSSize(width: sheetW, height: sheetH))
    sheet.lockFocus()
    NSColor(calibratedWhite: 0.08, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: sheetW, height: sheetH).fill()
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.monospacedDigitSystemFont(ofSize: 18, weight: .medium),
        .foregroundColor: NSColor.white
    ]
    let pad: CGFloat = 6
    for (idx, item) in frames.enumerated() {
        let r: Int = idx / cols
        let c: Int = idx % cols
        let x: CGFloat = CGFloat(gap) + CGFloat(c) * CGFloat(cellW + gap)
        let y: CGFloat = CGFloat(sheetH) - CGFloat(gap) - CGFloat(r + 1) * CGFloat(cellH + gap)
        let cell = NSRect(x: x, y: y, width: CGFloat(cellW), height: CGFloat(cellH))
        item.1.draw(in: cell)

        let label: String = String(format: "%.1fs", item.0)
        let size: NSSize = label.size(withAttributes: attrs)
        let bgW: CGFloat = size.width + pad * 2
        let bgH: CGFloat = size.height + pad
        let bg = NSRect(x: x + pad, y: y + pad, width: bgW, height: bgH)
        NSColor(calibratedWhite: 0, alpha: 0.6).setFill()
        bg.fill()
        let textPoint = NSPoint(x: x + pad * 2, y: y + pad * 1.5)
        label.draw(at: textPoint, withAttributes: attrs)
    }
    sheet.unlockFocus()

    writeImage(sheet, to: dst, asJPEG: false)
    print("预览图已生成：\(dst)｜时长 \(String(format: "%.2f", duration))s｜\(frames.count) 帧")
}

// ---------------- 剪片 ----------------

func exportClip(src: String, dst: String, start: Double, duration: Double, poster: String?,
                speed: Double, width: CGFloat, presetOverride: String, maxMB: Double) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: src))
    // 请求的时长可能超过源片（比如拿已经剪过的短片再压一次），先钳制到可用范围
    let assetSeconds = CMTimeGetSeconds(asset.duration)
    let safeDuration = max(0.5, min(duration, max(0.5, assetSeconds - start)))
    let range = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600),
                            duration: CMTime(seconds: safeDuration, preferredTimescale: 600))

    // 只保留画面轨，避免把原声一起带进画廊循环
    let comp = AVMutableComposition()
    guard let videoTrack = comp.addMutableTrack(withMediaType: .video,
                                                preferredTrackID: kCMPersistentTrackID_Invalid) else {
        fail("无法创建视频轨")
    }
    let sourceTracks = asset.tracks(withMediaType: .video)
    guard let first = sourceTracks.first else { fail("源文件没有画面轨") }
    do { try videoTrack.insertTimeRange(range, of: first, at: .zero) }
    catch { fail("截取失败：\(error.localizedDescription)") }
    videoTrack.preferredTransform = first.preferredTransform

    // 加速：把这段画面压缩到更短的时长，做出延时摄影的节奏
    if speed > 1.0001 {
        let target = CMTime(seconds: safeDuration / speed, preferredTimescale: 600)
        comp.scaleTimeRange(CMTimeRange(start: .zero, duration: range.duration), toDuration: target)
        print("加速 \(String(format: "%.1f", speed))×：\(String(format: "%.1f", safeDuration))s → " +
              "\(String(format: "%.1f", safeDuration / speed))s")
    }

    // 按输出宽度选编码档位；也可以用 --preset 手动指定（体积不合适时换档）
    var preset: String
    if width <= 640 { preset = AVAssetExportPreset640x480 }
    else if width <= 960 { preset = AVAssetExportPreset960x540 }
    else if width <= 1280 { preset = AVAssetExportPreset1280x720 }
    else { preset = AVAssetExportPreset1920x1080 }
    if !presetOverride.isEmpty { preset = presetOverride }
    guard let export = AVAssetExportSession(asset: comp, presetName: preset) else {
        fail("无法创建导出任务")
    }
    let outURL = URL(fileURLWithPath: dst)
    try? FileManager.default.removeItem(at: outURL)
    try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(),
                                             withIntermediateDirectories: true)
    export.outputURL = outURL
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true

    // 体积上限：网页用的小循环短片不需要高码率。
    // 给出字节上限后编码器会自己降码率；万一因此失败，下面会去掉上限重试一次。
    let outSeconds = max(1.0, safeDuration / max(1.0, speed))
    let limitMB = maxMB > 0 ? maxMB : outSeconds * 0.45
    export.fileLengthLimit = Int64(limitMB * 1024 * 1024)

    // 去掉素材自带的电影黑边，只保留真正的画面
    var cropTop = 0
    var cropBottom = 0
    var renderSize = CGSize(width: width, height: (width * 9 / 16).rounded())
    let totalDuration = CMTimeGetSeconds(asset.duration)
    let sampleAt = min(max(0, start + 0.3), max(0, totalDuration - 0.2))
    if let frame = grabFrame(asset: asset, at: sampleAt) {
        let bars = detectPictureBars(frame)
        cropTop = bars.top
        cropBottom = bars.bottom
        let sourceW = CGFloat(frame.width)
        let sourceH = CGFloat(frame.height)
        let pictureH = sourceH - CGFloat(cropTop + cropBottom)
        let scale = width / sourceW
        // H.264 的 4:2:0 色度采样要求宽高都是偶数，奇数高度会被部分解码器拒播
        var outH = (pictureH * scale).rounded()
        if Int(outH) % 2 != 0 { outH -= 1 }
        renderSize = CGSize(width: width, height: outH)

        if cropTop > 0 || cropBottom > 0 {
            let videoComp = AVMutableVideoComposition()
            videoComp.renderSize = renderSize
            videoComp.frameDuration = CMTime(value: 1, timescale: 30)
            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = CMTimeRange(start: .zero, duration: comp.duration)
            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
            let move = CGAffineTransform(translationX: 0, y: -CGFloat(cropTop))
            let zoom = CGAffineTransform(scaleX: scale, y: scale)
            layer.setTransform(move.concatenating(zoom), at: .zero)
            instruction.layerInstructions = [layer]
            videoComp.instructions = [instruction]
            export.videoComposition = videoComp
            print("检测到电影黑边：上 \(cropTop)px / 下 \(cropBottom)px，已裁掉 → 输出 \(Int(renderSize.width))×\(Int(renderSize.height))")
        } else {
            print("未检测到黑边，输出 \(Int(renderSize.width))×\(Int(renderSize.height))")
        }
    }

    func runExport() -> Bool {
        let sem = DispatchSemaphore(value: 0)
        export.exportAsynchronously { sem.signal() }
        sem.wait()
        return export.status == .completed
    }

    if !runExport() {
        // 带体积上限失败时，去掉上限重试一次
        export.fileLengthLimit = 0
        try? FileManager.default.removeItem(at: outURL)
        if !runExport() {
            fail("导出未完成（status=\(export.status.rawValue)）：\(export.error?.localizedDescription ?? "未知原因")")
        }
        print("提示：体积上限过紧，已按默认画质重新导出")
    }
    let size = ((try? FileManager.default.attributesOfItem(atPath: dst))?[.size] as? Int) ?? 0
    print("短片已导出：\(dst)｜\(String(format: "%.1f", Double(size) / 1024 / 1024)) MB")

    if let posterPath = poster, let raw = grabFrame(asset: asset, at: sampleAt) {
        var picture = raw
        if cropTop > 0 || cropBottom > 0 {
            let cropRect = CGRect(x: 0, y: CGFloat(cropTop),
                                  width: CGFloat(raw.width),
                                  height: CGFloat(raw.height - cropTop - cropBottom))
            if let cropped = raw.cropping(to: cropRect) { picture = cropped }
        }
        let targetW = CGFloat(renderSize.width)
        let targetH = targetW * CGFloat(picture.height) / CGFloat(picture.width)
        let posterImage = NSImage(size: NSSize(width: targetW, height: targetH))
        posterImage.lockFocus()
        NSImage(cgImage: picture, size: NSSize(width: picture.width, height: picture.height))
            .draw(in: NSRect(x: 0, y: 0, width: targetW, height: targetH))
        posterImage.unlockFocus()
        writeImage(posterImage, to: posterPath, asJPEG: true)
        print("封面已生成：\(posterPath)")
    }
}

// ---------------- 入口 ----------------

/// 采样若干帧，算相邻帧的平均亮度差（0–100），用来判断素材「动没动」。
/// 固定机位的空镜头分数很低（≈1），有推拉摇移或水流云动的会明显更高。
func motionScore(src: String, samples: Int) -> Double {
    let asset = AVURLAsset(url: URL(fileURLWithPath: src))
    let duration = CMTimeGetSeconds(asset.duration)
    if duration.isNaN || duration < 0.5 { return 0 }
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.maximumSize = CGSize(width: 120, height: 120)
    gen.requestedTimeToleranceBefore = CMTime(seconds: 0.4, preferredTimescale: 600)
    gen.requestedTimeToleranceAfter = CMTime(seconds: 0.4, preferredTimescale: 600)

    var previous: [Double] = []
    var total = 0.0
    var pairs = 0
    for i in 0..<max(2, samples) {
        let t = duration * Double(i) / Double(max(1, samples - 1)) * 0.98
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
        let rep = NSBitmapImageRep(cgImage: cg)
        let w = rep.pixelsWide, h = rep.pixelsHigh
        if w == 0 || h == 0 { continue }
        let stepX = max(1, w / 48), stepY = max(1, h / 27)
        var luma: [Double] = []
        var y = 0
        while y < h {
            var x = 0
            while x < w {
                if let c = rep.colorAt(x: x, y: y) {
                    luma.append(0.299 * Double(c.redComponent) +
                                0.587 * Double(c.greenComponent) +
                                0.114 * Double(c.blueComponent))
                }
                x += stepX
            }
            y += stepY
        }
        if !previous.isEmpty && previous.count == luma.count {
            var diff = 0.0
            for k in 0..<luma.count { diff += abs(luma[k] - previous[k]) }
            total += diff / Double(luma.count) * 100
            pairs += 1
        }
        previous = luma
    }
    return pairs == 0 ? 0 : total / Double(pairs)
}

/// 把 --flag value 形式的参数拆出来，剩下的按顺序当作位置参数
func parseFlags(_ args: [String]) -> (positional: [String], flags: [String: String]) {
    var positional: [String] = []
    var flags: [String: String] = [:]
    var i = 0
    while i < args.count {
        let a = args[i]
        if a.hasPrefix("--") {
            let key = String(a.dropFirst(2))
            if i + 1 < args.count && !args[i + 1].hasPrefix("--") {
                flags[key] = args[i + 1]
                i += 2
            } else {
                flags[key] = "true"
                i += 1
            }
        } else {
            positional.append(a)
            i += 1
        }
    }
    return (positional, flags)
}

// ---------------- 抽帧做图 ----------------

func exportFrame(src: String, dst: String, seconds: Double, targetW: CGFloat,
                 quality: Double, cropBottomPercent: Double) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: src))
    guard let raw = grabFrame(asset: asset, at: seconds) else { fail("取帧失败（时间点可能超出片长）") }
    let bars = detectPictureBars(raw)
    var picture = raw
    if bars.top > 0 || bars.bottom > 0 {
        let cropRect = CGRect(x: 0, y: CGFloat(bars.top),
                              width: CGFloat(raw.width),
                              height: CGFloat(raw.height - bars.top - bars.bottom))
        if let cropped = raw.cropping(to: cropRect) { picture = cropped }
        print("检测到电影黑边：上 \(bars.top)px / 下 \(bars.bottom)px，已裁掉")
    }
    if cropBottomPercent > 0 {
        // 再裁掉一点底部，用来去掉素材自带的水印字幕
        let keepH = CGFloat(picture.height) * CGFloat(1 - cropBottomPercent / 100)
        let rect = CGRect(x: 0, y: 0, width: CGFloat(picture.width), height: keepH.rounded())
        if let cropped = picture.cropping(to: rect) { picture = cropped }
        print("底部再裁掉 \(cropBottomPercent)%")
    }
    let targetH = targetW * CGFloat(picture.height) / CGFloat(picture.width)
    let image = NSImage(size: NSSize(width: targetW, height: targetH))
    image.lockFocus()
    NSImage(cgImage: picture, size: NSSize(width: picture.width, height: picture.height))
        .draw(in: NSRect(x: 0, y: 0, width: targetW, height: targetH))
    image.unlockFocus()
    try? FileManager.default.createDirectory(at: URL(fileURLWithPath: dst).deletingLastPathComponent(),
                                             withIntermediateDirectories: true)
    writeImage(image, to: dst, asJPEG: true, quality: quality)
    let size = ((try? FileManager.default.attributesOfItem(atPath: dst))?[.size] as? Int) ?? 0
    print("背景图已生成：\(dst)｜\(Int(targetW))×\(Int(targetH))｜\(String(format: "%.0f", Double(size) / 1024)) KB")
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("参数不足，见文件顶部用法说明") }
let mode = args[1]

switch mode {
case "contact":
    let count = args.count > 4 ? (Int(args[4]) ?? 12) : 12
    makeContactSheet(src: args[2], dst: args[3], count: count)
case "clip":
    let parsed = parseFlags(Array(args.dropFirst(2)))
    guard parsed.positional.count >= 4,
          let start = Double(parsed.positional[2]),
          let dur = Double(parsed.positional[3]) else {
        fail("clip 需要：<源视频> <输出.mp4> <开始秒> <时长秒> [封面.jpg] [--speed 4] [--width 1280]")
    }
    let speed = parsed.flags["speed"].flatMap { Double($0) } ?? 1
    let outWidth = parsed.flags["width"].flatMap { Double($0) }.map { CGFloat($0) } ?? 1280
    let presetOverride = parsed.flags["preset"] ?? ""
    let maxMB = parsed.flags["max-mb"].flatMap { Double($0) } ?? 0
    exportClip(src: parsed.positional[0], dst: parsed.positional[1],
               start: start, duration: dur,
               poster: parsed.positional.count > 4 ? parsed.positional[4] : nil,
               speed: speed, width: outWidth, presetOverride: presetOverride, maxMB: maxMB)
case "frame":
    guard args.count >= 5, let sec = Double(args[4]) else {
        fail("frame 需要：<源视频> <输出.jpg> <秒> [宽度] [JPEG质量 0-1]")
    }
    let width = args.count > 5 ? (Double(args[5]).map { CGFloat($0) } ?? 2560) : 2560
    let quality = args.count > 6 ? (Double(args[6]) ?? 0.78) : 0.78
    let cropBottom = args.count > 7 ? (Double(args[7]) ?? 0) : 0
    exportFrame(src: args[2], dst: args[3], seconds: sec, targetW: width,
                quality: quality, cropBottomPercent: cropBottom)
case "motion":
    guard args.count >= 3 else { fail("motion 需要：<视频> [采样帧数]") }
    let samples = args.count > 3 ? (Int(args[3]) ?? 8) : 8
    let score = motionScore(src: args[2], samples: samples)
    print(String(format: "运动量 %.1f（低于 2 基本是固定机位空镜）", score))
default:
    fail("未知命令 \(mode)，只支持 contact / clip / frame / motion")
}
