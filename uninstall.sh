#!/usr/bin/env bash
set -euo pipefail

HOME_DIR="${HOME:?HOME is not set}"
COCO_INSTALL_DIR="${COCO_INSTALL_DIR:-${HOME_DIR}/.coco}"
COCO_SYSTEM_BIN="${COCO_SYSTEM_BIN:-/usr/local/bin/coco}"
COCO_BIN_DIR="${COCO_BIN_DIR:-}"
COCO_AGENT_DIR="${COCO_AGENT_DIR:-${COCO_CODING_AGENT_DIR:-${HOME_DIR}/.coco/agent}}"

die() { printf 'coco: %s\n' "$*" >&2; exit 1; }
info() { printf 'coco: %s\n' "$*"; }

canonical_path() {
  local path=$1 parent name
  parent="$(dirname "$path")"; name="$(basename "$path")"
  [ -d "$parent" ] || return 1
  (cd -P -- "$parent" && printf '%s/%s\n' "$(pwd -P)" "$name")
}

path_contains() {
  local parent=$1 child=$2
  [ "$parent" = "$child" ] || [ "${child#"$parent"/}" != "$child" ]
}

is_owned_install() {
  [ -d "$COCO_INSTALL_DIR" ] && [ ! -L "$COCO_INSTALL_DIR" ] || return 1
  [ -x "$COCO_INSTALL_DIR/bin/coco" ] &&
    [ -f "$COCO_INSTALL_DIR/resources/provider-registry.v1.json" ] &&
    [ -d "$COCO_INSTALL_DIR/node_modules" ] || return 1
  if [ -f "$COCO_INSTALL_DIR/.coco-install-owner" ] && [ ! -L "$COCO_INSTALL_DIR/.coco-install-owner" ]; then
    [ "$(<"$COCO_INSTALL_DIR/.coco-install-owner")" = "coco-install-v1" ]
    return
  fi
  # v0.1.7 did not write a marker, so retain one-click removal for its default layout only.
  [ "$COCO_INSTALL_DIR" = "$HOME_DIR/.coco" ]
}

is_managed_launcher() {
  local path=$1 target="$COCO_INSTALL_DIR/bin/coco"
  if [ -L "$path" ]; then
    [ "$(readlink -- "$path")" = "$target" ]
    return
  fi
  [ -f "$path" ] || return 1
  if printf '%s\n' '#!/usr/bin/env bash' "exec \"$COCO_INSTALL_DIR/runtime/node/bin/node\" \"$target\" \"\$@\"" | cmp -s - "$path"; then return 0; fi
  printf '#!/usr/bin/env bash\nexport PI_OFFLINE=1\nexport COCO_CODING_AGENT_DIR=%q\nexec %q %q "$@"\n' \
    "$COCO_AGENT_DIR" "$COCO_INSTALL_DIR/runtime/node/bin/node" "$target" | cmp -s - "$path"
}

remove_managed_launcher() {
  local path=$1
  ( [ -e "$path" ] || [ -L "$path" ] ) && is_managed_launcher "$path" || return 0
  if [ -w "$(dirname "$path")" ]; then rm -f -- "$path"
  elif command -v sudo >/dev/null 2>&1; then sudo rm -f -- "$path"
  else die "Run as root to remove $path"
  fi
}

[ "$HOME_DIR" != "/" ] || die "Refusing to uninstall with HOME=/"
[ -n "$COCO_INSTALL_DIR" ] || die "COCO_INSTALL_DIR is empty"
[ "$COCO_INSTALL_DIR" != "/" ] || die "Refusing to remove COCO_INSTALL_DIR=/"
[ "$COCO_BIN_DIR" != "/" ] || die "Refusing to remove COCO_BIN_DIR=/"

CANONICAL_HOME="$(canonical_path "$HOME_DIR")" || die "Cannot resolve HOME"
CANONICAL_INSTALL="$(canonical_path "$COCO_INSTALL_DIR")" || die "Cannot resolve COCO_INSTALL_DIR"
[ "$CANONICAL_INSTALL" != "$CANONICAL_HOME" ] || die "Refusing to remove HOME"
path_contains "$CANONICAL_INSTALL" "$CANONICAL_HOME" && die "Refusing to remove an ancestor of HOME"
if [ -e "$COCO_AGENT_DIR" ] || [ -L "$COCO_AGENT_DIR" ]; then
  CANONICAL_AGENT="$(canonical_path "$COCO_AGENT_DIR")" || die "Cannot resolve COCO_AGENT_DIR"
  if path_contains "$CANONICAL_INSTALL" "$CANONICAL_AGENT" && [ "$CANONICAL_AGENT" != "$CANONICAL_INSTALL/agent" ]; then
    die "Refusing to remove an ancestor of COCO_AGENT_DIR"
  fi
fi
if [ -e "$COCO_INSTALL_DIR" ] || [ -L "$COCO_INSTALL_DIR" ]; then
  is_owned_install || die "Refusing to remove an unrecognized Coco installation: $COCO_INSTALL_DIR"
fi

info "Removing Coco completely"

rm -rf -- \
  "$COCO_INSTALL_DIR" \
  "$HOME_DIR/.config/coco" \
  "$HOME_DIR/.cache/coco" \
  "$HOME_DIR/.local/share/coco" \
  "$HOME_DIR/.local/state/coco"

remove_managed_launcher "$HOME_DIR/.local/bin/coco"

if [ -n "$COCO_BIN_DIR" ]; then
  remove_managed_launcher "$COCO_BIN_DIR/coco"
fi

for path in \
  "$HOME_DIR"/.coco-config-backup-* \
  "$HOME_DIR"/.coco.install.* \
  "$HOME_DIR"/.coco.coco-candidate-* \
  "$HOME_DIR"/.coco.coco-rollback-*
do
  [ -e "$path" ] || [ -L "$path" ] || continue
  rm -rf -- "$path"
done

remove_managed_launcher "$COCO_SYSTEM_BIN"

hash -r 2>/dev/null || true

if command -v coco >/dev/null 2>&1; then
  die "Another Coco executable remains at $(command -v coco)"
fi

info "Coco has been completely removed"
