#!/bin/bash
# 栖旅 · 生成上线上传包
# 用法：bash tools/package.sh
# 产物（默认放 ~/Documents/栖旅部署包/）：
#   栖旅-完整版-时间戳.zip   含实拍短片，约 90MB，用于正式上线
#   栖旅-轻量版-时间戳.zip   不含视频（城市画面自动回落到实时绘制），约 7MB，用于先试通流程
# 同时保留解包好的文件夹，方便用「拖拽文件夹」的方式上传。

set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${HOME}/Documents/栖旅部署包"
STAMP="$(date +%Y-%m-%d-%H%M)"

mkdir -p "$DEST"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 只挑网站真正需要的东西
build_into() {
  local out="$1"
  mkdir -p "$out/assets"
  cp "$SRC/index.html" "$out/"
  cp -R "$SRC/assets/css" "$out/assets/"
  cp -R "$SRC/assets/js" "$out/assets/"
  cp -R "$SRC/assets/img" "$out/assets/"
  cp -R "$SRC/assets/video" "$out/assets/" 2>/dev/null || mkdir -p "$out/assets/video"
  # 本地预览用的服务脚本也带上，方便别人下载后直接跑起来
  cp "$SRC/serve.py" "$out/" 2>/dev/null || true
  rm -f "$out/assets/video/"*.mp4/*.mp4 2>/dev/null || true
}

FULL_DIR="$WORK/栖旅-完整版"
LITE_DIR="$WORK/栖旅-轻量版"

build_into "$FULL_DIR"
build_into "$LITE_DIR"

# 轻量版去掉视频文件（保留封面图，页面会自动回落到实时绘制画面）
find "$LITE_DIR/assets/video" -name '*.mp4' -delete

# 打包 + 保留解包目录
rm -rf "$DEST/栖旅-完整版-$STAMP" "$DEST/栖旅-轻量版-$STAMP"
rm -f "$DEST/栖旅-完整版-$STAMP.zip" "$DEST/栖旅-轻量版-$STAMP.zip"
cp -R "$FULL_DIR" "$DEST/栖旅-完整版-$STAMP"
cp -R "$LITE_DIR" "$DEST/栖旅-轻量版-$STAMP"
# 注意：压缩包内 index.html 必须在根目录，托管平台才认
(cd "$FULL_DIR" && zip -qr "$DEST/栖旅-完整版-$STAMP.zip" .)
(cd "$LITE_DIR" && zip -qr "$DEST/栖旅-轻量版-$STAMP.zip" .)

echo "输出目录：$DEST"
echo
du -sh "$DEST/栖旅-完整版-$STAMP.zip" "$DEST/栖旅-轻量版-$STAMP.zip"
echo
echo "文件数："
echo "  完整版 $(find "$FULL_DIR" -type f | wc -l | tr -d ' ') 个文件"
echo "  轻量版 $(find "$LITE_DIR" -type f | wc -l | tr -d ' ') 个文件"
echo
echo "单个文件最大："
find "$FULL_DIR" -type f -exec du -k {} + | sort -nr | head -3
