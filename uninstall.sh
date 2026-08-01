#!/usr/bin/env bash
set -euo pipefail

HOME_DIR="${HOME:?HOME is not set}"
COCO_INSTALL_DIR="${COCO_INSTALL_DIR:-${HOME_DIR}/.coco}"
COCO_SYSTEM_BIN="${COCO_SYSTEM_BIN:-/usr/local/bin/coco}"

die() { printf 'coco: %s\n' "$*" >&2; exit 1; }
info() { printf 'coco: %s\n' "$*"; }

[ "$HOME_DIR" != "/" ] || die "Refusing to uninstall with HOME=/"
[ -n "$COCO_INSTALL_DIR" ] || die "COCO_INSTALL_DIR is empty"
[ "$COCO_INSTALL_DIR" != "/" ] || die "Refusing to remove COCO_INSTALL_DIR=/"

info "Removing Coco completely"

rm -rf -- \
  "$COCO_INSTALL_DIR" \
  "$HOME_DIR/.config/coco" \
  "$HOME_DIR/.cache/coco" \
  "$HOME_DIR/.local/share/coco" \
  "$HOME_DIR/.local/state/coco"

rm -f -- "$HOME_DIR/.local/bin/coco"

for path in \
  "$HOME_DIR"/.coco-config-backup-* \
  "$HOME_DIR"/.coco.install.* \
  "$HOME_DIR"/.coco.coco-candidate-* \
  "$HOME_DIR"/.coco.coco-rollback-*
do
  [ -e "$path" ] || [ -L "$path" ] || continue
  rm -rf -- "$path"
done

if [ -e "$COCO_SYSTEM_BIN" ] || [ -L "$COCO_SYSTEM_BIN" ]; then
  if [ -w "$(dirname "$COCO_SYSTEM_BIN")" ]; then
    rm -f -- "$COCO_SYSTEM_BIN"
  elif command -v sudo >/dev/null 2>&1; then
    sudo rm -f -- "$COCO_SYSTEM_BIN"
  else
    die "Run as root to remove $COCO_SYSTEM_BIN"
  fi
fi

hash -r 2>/dev/null || true

if command -v coco >/dev/null 2>&1; then
  die "Another Coco executable remains at $(command -v coco)"
fi

info "Coco has been completely removed"
