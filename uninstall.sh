#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# coco — uninstaller
# ──────────────────────────────────────────────────────────────────────

COCO_INSTALL_DIR="${COCO_INSTALL_DIR:-$HOME/.coco}"
COCO_BIN_DIR="${COCO_BIN_DIR:-$HOME/.local/bin}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}▸${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}✔${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
err()   { printf "${RED}✖${RESET} %s\n" "$*" >&2; }

echo ""
printf "${BOLD}coco uninstaller${RESET}\n"
echo ""

# ── Remove symlink ────────────────────────────────────────────────────
LINK="${COCO_BIN_DIR}/coco"
if [ -L "$LINK" ] || [ -f "$LINK" ]; then
  rm -f "$LINK"
  ok "Removed symlink: ${LINK}"
else
  info "No symlink found at ${LINK}"
fi

# ── Remove installation directory ─────────────────────────────────────
if [ -d "$COCO_INSTALL_DIR" ]; then
  warn "This will remove: ${COCO_INSTALL_DIR}"
  warn "(Your ~/.coco/agent/ config will be preserved if it exists)"

  # Preserve agent config before removing
  AGENT_DIR="${COCO_INSTALL_DIR}/agent"
  if [ -d "$AGENT_DIR" ]; then
    BACKUP_DIR="${HOME}/.coco-config-backup-$(date +%s)"
    cp -a "$AGENT_DIR" "$BACKUP_DIR" 2>/dev/null || true
    info "Config backed up to: ${BACKUP_DIR}"
  fi

  rm -rf "$COCO_INSTALL_DIR"
  ok "Removed installation: ${COCO_INSTALL_DIR}"
else
  info "No installation found at ${COCO_INSTALL_DIR}"
fi

# ── Summary ───────────────────────────────────────────────────────────
echo ""
printf "${GREEN}✔ coco has been uninstalled.${RESET}\n"
echo ""
echo "  If you had custom API keys in ~/.coco/agent/auth.json,"
echo "  you may want to remove them manually:"
echo ""
echo "    rm -f ~/.coco/agent/auth.json"
echo ""
