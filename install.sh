#!/usr/bin/env bash
set -euo pipefail

API_URL="${COCO_RELEASES_API_URL:-https://api.github.com/repos/bit-cook/coco/releases?per_page=100}"
ROOT_URL="${COCO_INSTALL_ROOT_URL:-https://raw.githubusercontent.com/bit-cook/coco}"
TMP_ROOT="${TMPDIR:-/tmp}"
metadata="$(mktemp "${TMP_ROOT%/}/coco-releases.XXXXXX")"
installer="$(mktemp "${TMP_ROOT%/}/coco-install.XXXXXX")"
cleanup() { rm -f "$metadata" "$installer"; }
trap cleanup EXIT

if ! curl -fsSL --retry 3 --retry-delay 2 "$API_URL" -o "$metadata"; then
  printf 'coco: could not query public releases\n' >&2
  exit 1
fi

version="$(awk '
  BEGIN { RS="}"; FS="\n" }
  /"draft"[[:space:]]*:[[:space:]]*false/ && /"prerelease"[[:space:]]*:[[:space:]]*false/ {
    record = $0
    if (match(record, /"tag_name"[[:space:]]*:[[:space:]]*"v[0-9]+\.[0-9]+\.[0-9]+"/)) {
      tag = substr(record, RSTART, RLENGTH)
      sub(/^.*"v/, "", tag)
      sub(/"$/, "", tag)
      print tag
    }
  }
' "$metadata" | sort -V | tail -n 1)"
[ -n "$version" ] || { printf 'coco: release metadata contained no stable semver tag\n' >&2; exit 1; }

tag="v${version}"
if ! curl -fsSL --retry 3 --retry-delay 2 -o "$installer" "${ROOT_URL}/${tag}/install.sh"; then
  printf 'coco: could not download installer for %s\n' "$tag" >&2
  exit 1
fi
grep -Eq '^#!/usr/bin/env bash$' "$installer" || { printf 'coco: downloaded installer has invalid metadata\n' >&2; exit 1; }
COCO_VERSION="$version" exec bash "$installer"
