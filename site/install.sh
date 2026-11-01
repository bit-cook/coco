#!/usr/bin/env bash
# 本引导器同时兼容 bash 与 POSIX sh（dash）：不得使用数组等 bash 专用语法。
# 历史 bug：曾用 bash 数组（GH_PROXIES=(...) / urls+=(...)），AgentBoot 等
# 以 sh 执行安装脚本的调用方在第一个数组赋值处即 Syntax error，安装必败。
# 下载到的安装器本体仍是 bash 脚本（下方以 shebang 校验），由 bash 执行。
set -eu

# coco 快速引导器（发布于 site/install.sh → bit-cook.github.io/coco/install.sh）
# 提速设计：
#   1. 默认直接使用烘焙的最新稳定版（发布时更新），不查 API；
#   2. 安装器本体从 jsDelivr CDN / gh 加速镜像获取，raw.githubusercontent 仅作兜底；
#   3. COCO_VERSION 环境变量仍可强制指定任意版本。

DEFAULT_VERSION="0.8.2"
API_URL="${COCO_RELEASES_API_URL:-https://api.github.com/repos/bit-cook/coco/releases?per_page=100}"
GH_PROXIES="https://gh-proxy.com/ https://ghfast.top/ https://ghproxy.net/"
TMP_ROOT="${TMPDIR:-/tmp}"
installer="$(mktemp "${TMP_ROOT%/}/coco-install.XXXXXX")"
metadata="$(mktemp "${TMP_ROOT%/}/coco-meta.XXXXXX")"
cleanup() { rm -f "$installer" "$metadata"; }
trap cleanup EXIT

info() { printf 'coco: %s\n' "$*"; }
die() { printf 'coco: %s\n' "$*" >&2; exit 1; }

if [ -n "${COCO_VERSION:-}" ]; then
  version="$COCO_VERSION"
else
  version="$DEFAULT_VERSION"
  # 后台并行探测更新的稳定版（4 秒内无响应就按烘焙版本走，绝不阻塞）
  if command -v curl >/dev/null 2>&1; then
    if curl -fsSL --connect-timeout 2 --max-time 4 "$API_URL" -o "$metadata" 2>/dev/null; then
      discovered="$(awk '
        BEGIN { RS="}"; FS="\n" }
        /"draft"[[:space:]]*:[[:space:]]*false/ && /"prerelease"[[:space:]]*:[[:space:]]*false/ {
          if (match($0, /"tag_name"[[:space:]]*:[[:space:]]*"v[0-9]+\.[0-9]+\.[0-9]+"/)) {
            tag = substr($0, RSTART, RLENGTH); sub(/^.*"v/, "", tag); sub(/"$/, "", tag); print tag
          }
        }
      ' "$metadata" | sort -V | tail -n 1)"
      [ -n "$discovered" ] && version="$discovered"
    fi
  fi
fi
case "$version" in
  *[!0-9.]*) die "invalid version: $version" ;;
esac
tag="v${version}"
info "installing coco v${version}"

RAW_URL="https://raw.githubusercontent.com/bit-cook/coco/${tag}/install.sh"
# 镜像源列表（空格分隔；URL 不含空格，可安全分词）
urls="https://cdn.jsdelivr.net/gh/bit-cook/coco@${tag}/install.sh"
if [ -n "${COCO_GH_MIRRORS:-}" ]; then
  for p in ${COCO_GH_MIRRORS}; do urls="$urls ${p%/}/${RAW_URL}"; done
else
  # 中国网络探测：npmmirror 可达即启用加速前缀（安装器内部还有更精细的选路）
  if curl -fsI --connect-timeout 2 --max-time 4 -o /dev/null https://registry.npmmirror.com 2>/dev/null \
     || wget -q -T 4 -O /dev/null https://registry.npmmirror.com 2>/dev/null; then
    for p in $GH_PROXIES; do urls="$urls ${p}${RAW_URL}"; done
  fi
fi
urls="$urls $RAW_URL"

ok=0
for u in $urls; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 --retry-delay 1 --connect-timeout 8 -o "$installer" "$u" 2>/dev/null || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 20 -t 2 -O "$installer" "$u" 2>/dev/null || true
  else
    die "Neither curl nor wget found."
  fi
  if grep -Eq '^#!/usr/bin/env bash$' "$installer" 2>/dev/null && [ -s "$installer" ]; then
    ok=1
    break
  fi
  info "source unreachable: ${u}; trying next mirror …"
done
[ "$ok" = 1 ] || die "could not download installer for ${tag} from any mirror"

COCO_VERSION="$version" exec bash "$installer"
