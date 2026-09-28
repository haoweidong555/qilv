#!/bin/bash
# 栖旅 · 一键备份
# 用法：bash tools/backup.sh
# 产物：~/Documents/栖旅备份/栖旅-YYYY-MM-DD-HHMM.tar.gz（含全部素材，默认留最近 8 份）

set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Documents/栖旅备份"
KEEP=8

mkdir -p "$DEST"
STAMP="$(date +%Y-%m-%d-%H%M)"
OUT="$DEST/栖旅-$STAMP.tar.gz"

echo "正在打包：$SRC"
echo "输出：$OUT"

# 排除版本库自身和临时产物，其余（含视频素材）全部打包
tar --exclude='.git' \
    --exclude='.backups' \
    --exclude='node_modules' \
    --exclude='.DS_Store' \
    -czf "$OUT" \
    -C "$(dirname "$SRC")" "$(basename "$SRC")"

echo "完成：$(du -h "$OUT" | cut -f1)"

# 只留最近 $KEEP 份
COUNT=$(ls -1 "$DEST"/栖旅-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$DEST"/栖旅-*.tar.gz | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "清理旧备份：$old"
    rm -f "$old"
  done
fi

echo
echo "现有备份："
ls -lht "$DEST" | head -10
