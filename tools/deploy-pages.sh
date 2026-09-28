#!/bin/bash
# 栖旅 · 一键发布到 GitHub Pages（免费子域名，形如 https://用户名.github.io/qilv/）
#
# 前置：本机 gh 已登录（gh auth status 显示正常）
# 用法：bash tools/deploy-pages.sh [仓库名，默认 qilv]
#
# 它做三件事：
#   1. main 分支（代码，轻量）推到 GitHub
#   2. 组装一份"含实拍短片"的网站，推到 gh-pages 分支
#   3. 在仓库设置里打开 Pages，指向 gh-pages

set -euo pipefail

REPO="${1:-qilv}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

# 本机连不上 github.com:443，只能用 SSH 的 443 端口端口复用地址
SSH_CMD="ssh -o StrictHostKeyChecking=accept-new"

gh auth status >/dev/null 2>&1 || { echo "还没登录 GitHub，先跑：gh auth login"; exit 1; }
OWNER="$(gh api user -q .login)"
echo "发布到：$OWNER/$REPO"

SSH_URL="ssh://git@ssh.github.com:443/$OWNER/$REPO.git"

cd "$SRC"

# 1) 建仓库（已存在就跳过）+ 推 main
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$OWNER/$REPO" --public \
    --description "栖旅 · 一个中国旅居社区（画廊式城市浏览 + 城市页 + 社区）" >/dev/null
  git remote add origin "$SSH_URL"
fi
git -c core.sshCommand="$SSH_CMD" push -u origin "$(git branch --show-current)"

# 2) 组装网站（含 69 座城市的实拍短片）并推到 gh-pages
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SITE="$WORK/site"
mkdir -p "$SITE/assets"
cp "$SRC/index.html" "$SITE/"
cp -R "$SRC/assets/css" "$SRC/assets/js" "$SRC/assets/img" "$SRC/assets/video" "$SITE/assets/"
cp "$SRC/serve.py" "$SITE/" 2>/dev/null || true
touch "$SITE/.nojekyll"

# 给 css/js 换个版本号：每次都换，浏览器就不会拿着上一个版本的脚本不放
STAMP="$(date '+%Y%m%d%H%M')"
sed -i '' -E "s/\?v=[0-9A-Za-z]+/?v=$STAMP/g" "$SITE/index.html"
echo "资源版本号：$STAMP"

cd "$WORK"
git init -q
git checkout -q -b gh-pages
cp -R "$SITE/." .
git add -A
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" \
    commit -q -m "部署：$(date '+%Y-%m-%d %H:%M')"
git remote add origin "$SSH_URL"
git -c core.sshCommand="$SSH_CMD" push -f origin gh-pages

# 3) 打开 Pages
gh api "repos/$OWNER/$REPO/pages" -X POST \
  -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true

echo
echo "已推送。等 GitHub 构建（首次 1–3 分钟），然后打开："
gh api "repos/$OWNER/$REPO/pages" -q '.html_url' 2>/dev/null \
  || echo "  https://$OWNER.github.io/$REPO/"
