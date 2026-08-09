#!/usr/bin/env bash
set -euo pipefail

umask 077

die() { printf 'coco offline installer: %s\n' "$*" >&2; exit 1; }
info() { printf 'coco offline installer: %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
HOME_DIR="${HOME:?HOME is not set}"
COCO_INSTALL_DIR="${COCO_INSTALL_DIR:-$HOME_DIR/.coco}"
if [ -z "${COCO_BIN_DIR:-}" ]; then
  if [ "$(id -u)" = "0" ]; then COCO_BIN_DIR="/usr/local/bin"; else COCO_BIN_DIR="$HOME_DIR/.local/bin"; fi
fi
COCO_AGENT_DIR="${COCO_AGENT_DIR:-${COCO_CODING_AGENT_DIR:-$HOME_DIR/.coco/agent}}"
INSTALL_PARENT="$(dirname -- "$COCO_INSTALL_DIR")"
INSTALL_NAME="$(basename -- "$COCO_INSTALL_DIR")"
TMP=""; CANDIDATE="${INSTALL_PARENT}/.${INSTALL_NAME}.coco-candidate-$$"; ROLLBACK="${INSTALL_PARENT}/.${INSTALL_NAME}.coco-rollback-$$"
AGENT_BACKUP=""; PREVIOUS_LINK=""; HAD_INSTALL=0; HAD_AGENT=0; HAD_LINK=0; SWAPPED=0; LINKED=0; COMMITTED=0
STATE_BACKUP=""

cleanup() {
  local status=$?
  trap - EXIT
  if [ "$COMMITTED" -ne 1 ]; then
    [ "$LINKED" -ne 1 ] || rm -f -- "$COCO_BIN_DIR/coco"
    [ "$HAD_LINK" -ne 1 ] || mv -- "$PREVIOUS_LINK" "$COCO_BIN_DIR/coco"
    if [ "$SWAPPED" -eq 1 ]; then
      if [ "$HAD_AGENT" -eq 1 ] && [ -e "$COCO_AGENT_DIR" ]; then mv -- "$COCO_AGENT_DIR" "$AGENT_BACKUP"; fi
      rm -rf -- "$COCO_INSTALL_DIR"
    fi
    [ "$HAD_INSTALL" -ne 1 ] || [ ! -e "$ROLLBACK" ] || mv -- "$ROLLBACK" "$COCO_INSTALL_DIR"
    if [ "$HAD_AGENT" -eq 1 ] && [ -e "$AGENT_BACKUP" ]; then
      rm -rf -- "$COCO_AGENT_DIR"; mkdir -p -- "$(dirname -- "$COCO_AGENT_DIR")"; mv -- "$AGENT_BACKUP" "$COCO_AGENT_DIR"
    fi
    if [ -n "$STATE_BACKUP" ] && [ -d "$STATE_BACKUP" ]; then
      mkdir -p -- "$COCO_AGENT_DIR"
      for name in models.json auth.json settings.json; do
        if [ -f "$STATE_BACKUP/$name" ]; then cp -p -- "$STATE_BACKUP/$name" "$COCO_AGENT_DIR/$name"; else rm -f -- "$COCO_AGENT_DIR/$name"; fi
      done
    fi
  fi
  [ -z "$TMP" ] || rm -rf -- "$TMP"
  rm -rf -- "$CANDIDATE" "$ROLLBACK"
  exit "$status"
}
trap cleanup EXIT

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d ' ' -f1
  else die "Neither sha256sum nor shasum was found"; fi
}

validate_paths() {
  [ "$HOME_DIR" != "/" ] || die "Refusing HOME=/"
  [ "$COCO_INSTALL_DIR" != "/" ] || die "Refusing COCO_INSTALL_DIR=/"
  [ "$COCO_AGENT_DIR" != "$COCO_INSTALL_DIR" ] || die "Agent directory must not equal install directory"
  [ ! -L "$COCO_INSTALL_DIR" ] || die "Refusing symlinked install directory"
  [ ! -L "$COCO_AGENT_DIR" ] || die "Refusing symlinked agent directory"
  for path in "$COCO_AGENT_DIR/models.json" "$COCO_AGENT_DIR/auth.json" "$COCO_AGENT_DIR/settings.json"; do
    [ ! -L "$path" ] || die "Refusing symlinked configuration: $path"
    [ ! -e "$path" ] || [ -f "$path" ] || die "Refusing non-regular configuration: $path"
  done
}

validate_bundle() {
  need tar
  [ -f "$SCRIPT_DIR/SHA256SUMS" ] || die "SHA256SUMS is missing"
  [ -f "$SCRIPT_DIR/coco-package.tgz" ] || die "coco-package.tgz is missing"
  [ -f "$SCRIPT_DIR/node-runtime.tar.gz" ] || die "node-runtime.tar.gz is missing"
  [ -f "$SCRIPT_DIR/platform.txt" ] || die "platform.txt is missing"
  local expected_platform actual_platform expected actual file
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64|Linux-amd64) actual_platform="linux-x64" ;;
    Linux-arm64|Linux-aarch64) actual_platform="linux-arm64" ;;
    Darwin-x86_64|Darwin-amd64) actual_platform="darwin-x64" ;;
    Darwin-arm64|Darwin-aarch64) actual_platform="darwin-arm64" ;;
    *) die "Unsupported platform: $(uname -s)-$(uname -m)" ;;
  esac
  expected_platform="$(<"$SCRIPT_DIR/platform.txt")"
  [ "$actual_platform" = "$expected_platform" ] || die "Bundle is for $expected_platform, host is $actual_platform"
  while read -r expected file; do
    [ -n "$expected" ] || continue
    [ -f "$SCRIPT_DIR/$file" ] || die "Bundle member is missing: $file"
    actual="$(checksum "$SCRIPT_DIR/$file")"
    [ "$actual" = "$expected" ] || die "SHA-256 mismatch: $file"
  done < "$SCRIPT_DIR/SHA256SUMS"
}

extract_candidate() {
  mkdir -p -- "$INSTALL_PARENT"
  TMP="$(mktemp -d "${INSTALL_PARENT}/.${INSTALL_NAME}.offline.XXXXXX")"
  AGENT_BACKUP="$TMP/agent-backup"; PREVIOUS_LINK="$TMP/previous-link"
  local package_extract="$TMP/package" node_extract="$TMP/node"
  mkdir -p -- "$package_extract" "$node_extract"
  tar --no-same-owner --no-same-permissions -xzf "$SCRIPT_DIR/coco-package.tgz" -C "$package_extract"
  [ -d "$package_extract/package" ] || die "Invalid CoCo package archive"
  mv -- "$package_extract/package" "$CANDIDATE"
  mkdir -p -- "$CANDIDATE/runtime/node"
  tar --no-same-owner --no-same-permissions -xzf "$SCRIPT_DIR/node-runtime.tar.gz" -C "$CANDIDATE/runtime/node"
  [ -x "$CANDIDATE/runtime/node/bin/node" ] || die "Bundled Node runtime is missing"
  [ -x "$CANDIDATE/bin/coco" ] || die "CoCo executable is missing"
  [ -d "$CANDIDATE/node_modules" ] || die "Bundled dependencies are missing"
  PI_OFFLINE=1 "$CANDIDATE/runtime/node/bin/node" "$CANDIDATE/bin/coco" --version >/dev/null || die "Candidate startup verification failed"
  printf '%s\n' 'coco-install-v1' > "$CANDIDATE/.coco-install-owner"
}

swap_runtime() {
  case "${COCO_AGENT_DIR}/" in
    "${COCO_INSTALL_DIR}/"*) if [ -e "$COCO_AGENT_DIR" ]; then mv -- "$COCO_AGENT_DIR" "$AGENT_BACKUP"; HAD_AGENT=1; fi ;;
  esac
  if [ -e "$COCO_INSTALL_DIR" ]; then mv -- "$COCO_INSTALL_DIR" "$ROLLBACK"; HAD_INSTALL=1; fi
  mv -- "$CANDIDATE" "$COCO_INSTALL_DIR"; SWAPPED=1
  if [ "$HAD_AGENT" -eq 1 ]; then mkdir -p -- "$(dirname -- "$COCO_AGENT_DIR")"; mv -- "$AGENT_BACKUP" "$COCO_AGENT_DIR"; fi
}

configure_state() {
  STATE_BACKUP="$TMP/state-backup"; mkdir -p -- "$STATE_BACKUP"
  for name in models.json auth.json settings.json; do [ ! -f "$COCO_AGENT_DIR/$name" ] || cp -p -- "$COCO_AGENT_DIR/$name" "$STATE_BACKUP/$name"; done
  mkdir -p -- "$COCO_AGENT_DIR/sessions" "$COCO_AGENT_DIR/languages"; chmod 700 "$COCO_AGENT_DIR" "$COCO_AGENT_DIR/sessions" "$COCO_AGENT_DIR/languages"
  [ -e "$COCO_AGENT_DIR/models.json" ] || (umask 077; printf '{"providers":{}}\n' > "$COCO_AGENT_DIR/models.json")
  [ -e "$COCO_AGENT_DIR/auth.json" ] || (umask 077; printf '{}\n' > "$COCO_AGENT_DIR/auth.json")
  [ -e "$COCO_AGENT_DIR/settings.json" ] || (umask 077; printf '{}\n' > "$COCO_AGENT_DIR/settings.json")
  chmod 600 "$COCO_AGENT_DIR/models.json" "$COCO_AGENT_DIR/auth.json" "$COCO_AGENT_DIR/settings.json"
  if [ -n "${COCO_INTRANET_BASE_URL:-}" ] || [ -n "${COCO_INTRANET_MODEL_ID:-}" ]; then
    [ -n "${COCO_INTRANET_BASE_URL:-}" ] && [ -n "${COCO_INTRANET_MODEL_ID:-}" ] || die "Set both COCO_INTRANET_BASE_URL and COCO_INTRANET_MODEL_ID"
    local key_file=""
    if [ "${COCO_INTRANET_KEY_STDIN:-0}" = "1" ]; then
      key_file="$TMP/intranet.key"; IFS= read -r key || die "Could not read intranet API key from stdin"; printf '%s\n' "$key" > "$key_file"; unset key
    fi
    "$COCO_INSTALL_DIR/runtime/node/bin/node" "$COCO_INSTALL_DIR/scripts/configure-intranet-model.mjs" "$COCO_AGENT_DIR" "$key_file"
    [ -z "$key_file" ] || rm -f -- "$key_file"
  fi
}

install_launcher() {
  mkdir -p -- "$COCO_BIN_DIR"
  if [ -L "$COCO_BIN_DIR/coco" ] || [ -f "$COCO_BIN_DIR/coco" ]; then mv -- "$COCO_BIN_DIR/coco" "$PREVIOUS_LINK"; HAD_LINK=1
  elif [ -e "$COCO_BIN_DIR/coco" ]; then die "Refusing non-regular launcher path"; fi
  printf '#!/usr/bin/env bash\nexport PI_OFFLINE=1\nexport COCO_CODING_AGENT_DIR=%q\nexec %q %q "$@"\n' \
    "$COCO_AGENT_DIR" "$COCO_INSTALL_DIR/runtime/node/bin/node" "$COCO_INSTALL_DIR/bin/coco" > "$COCO_BIN_DIR/coco"
  chmod 700 "$COCO_BIN_DIR/coco"; LINKED=1
  "$COCO_BIN_DIR/coco" --version >/dev/null || die "Installed launcher verification failed"
}

main() {
  validate_paths; validate_bundle; extract_candidate; swap_runtime; configure_state; install_launcher
  COMMITTED=1; rm -rf -- "$ROLLBACK"
  info "Installed CoCo from the offline bundle"
  [ -z "${COCO_INTRANET_BASE_URL:-}" ] || info "Configured ${COCO_INTRANET_PROVIDER:-intranet}/${COCO_INTRANET_MODEL_ID}"
  info "Run: $COCO_BIN_DIR/coco"
}

main "$@"
