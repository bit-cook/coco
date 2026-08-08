#!/usr/bin/env bash
set -euo pipefail

umask 077

COCO_VERSION="${COCO_VERSION:-0.1.8}"
printf '%s\n' "$COCO_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { printf 'coco: COCO_VERSION must be a stable X.Y.Z version\n' >&2; exit 1; }
COCO_RELEASE_BASE="https://github.com/aithernexus/coco/releases/download/v${COCO_VERSION}"
AGNES_KEY_URL="https://github.com/aithernexus/coco/releases/download/installer-v0.1.1.1/agnes.key"
AGNES_KEY_SIZE=52
AGNES_KEY_SHA256="4d78028a0a60a7d752e6e57cbcb3113e9de99ab81bde608a0b9610a83cd42f6e"
COCO_INSTALL_DIR="${COCO_INSTALL_DIR:-$HOME/.coco}"
if [ -z "${COCO_BIN_DIR:-}" ]; then
  if [ "$(id -u)" = "0" ]; then COCO_BIN_DIR="/usr/local/bin"; else COCO_BIN_DIR="$HOME/.local/bin"; fi
fi
COCO_AGENT_DIR="${COCO_AGENT_DIR:-${COCO_CODING_AGENT_DIR:-$HOME/.coco/agent}}"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=19
NODE_VERSION="22.23.2"
MAX_ARCHIVE_MEMBERS=100000
MAX_ARCHIVE_BYTES=2147483648
NODE_BIN=""
NODE_RUNTIME_SOURCE=""

info() { printf 'coco: %s\n' "$*"; }
die() { printf 'coco: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

INSTALL_PARENT="$(dirname "$COCO_INSTALL_DIR")"
INSTALL_NAME="$(basename "$COCO_INSTALL_DIR")"
mkdir -p "$INSTALL_PARENT"
TMPDIR_install="$(mktemp -d "${INSTALL_PARENT}/.${INSTALL_NAME}.install.XXXXXX")"
CANDIDATE_DIR="${INSTALL_PARENT}/.${INSTALL_NAME}.coco-candidate-$$"
ROLLBACK_DIR="${INSTALL_PARENT}/.${INSTALL_NAME}.coco-rollback-$$"
AGENT_BACKUP="${TMPDIR_install}/agent-backup"
PREVIOUS_LINK="${TMPDIR_install}/previous-link"
HAD_INSTALL=0
HAD_AGENT=0
HAD_LINK=0
SWAPPED=0
LINKED=0
COMMITTED=0
CREATED_MODELS=0
CREATED_AUTH=0

cleanup() {
  local status=$?
  trap - EXIT
  if [ "$COMMITTED" -ne 1 ]; then
    if [ "$CREATED_MODELS" -eq 1 ]; then rm -f "$COCO_AGENT_DIR/models.json"; fi
    if [ "$CREATED_AUTH" -eq 1 ]; then rm -f "$COCO_AGENT_DIR/auth.json"; fi
    if [ "$LINKED" -eq 1 ]; then rm -f "$COCO_BIN_DIR/coco"; fi
    if [ "$HAD_LINK" -eq 1 ]; then mv "$PREVIOUS_LINK" "$COCO_BIN_DIR/coco"; fi
    if [ "$SWAPPED" -eq 1 ]; then
      if [ "$HAD_AGENT" -eq 1 ] && [ -e "$COCO_AGENT_DIR" ]; then
        mv "$COCO_AGENT_DIR" "$AGENT_BACKUP"
      fi
      rm -rf "$COCO_INSTALL_DIR"
    fi
    if [ "$HAD_INSTALL" -eq 1 ] && [ -e "$ROLLBACK_DIR" ]; then mv "$ROLLBACK_DIR" "$COCO_INSTALL_DIR"; fi
    if [ "$HAD_AGENT" -eq 1 ] && [ -e "$AGENT_BACKUP" ]; then
      rm -rf "$COCO_AGENT_DIR"
      mkdir -p "$(dirname "$COCO_AGENT_DIR")"
      mv "$AGENT_BACKUP" "$COCO_AGENT_DIR"
    fi
  fi
  rm -rf "$CANDIDATE_DIR" "$ROLLBACK_DIR" "$TMPDIR_install"
  exit "$status"
}
trap cleanup EXIT

detect_platform() {
  case "$(uname -s)" in Linux*|Darwin*) ;; *) die "Unsupported OS: $(uname -s). coco supports macOS and Linux." ;; esac
  case "$(uname -m)" in arm64|aarch64|x86_64|amd64) ;; *) die "Unsupported architecture: $(uname -m). coco supports arm64 and amd64." ;; esac
}

node_is_usable() {
  command -v node >/dev/null 2>&1 || return 1
  local version major minor
  version="$(node --version 2>/dev/null)" || return 1
  version="${version#v}"; major="${version%%.*}"; minor="${version#*.}"; minor="${minor%%.*}"
  [ "$major" -gt "$NODE_MIN_MAJOR" ] || { [ "$major" -eq "$NODE_MIN_MAJOR" ] && [ "$minor" -ge "$NODE_MIN_MINOR" ]; }
}

prepare_node() {
  if node_is_usable; then
    NODE_BIN="$(command -v node)"
    return
  fi

  local os arch platform filename base archive checksums expected actual extract
  case "$(uname -s)" in Linux*) os="linux" ;; Darwin*) os="darwin" ;; esac
  case "$(uname -m)" in x86_64|amd64) arch="x64" ;; arm64|aarch64) arch="arm64" ;; esac
  platform="${os}-${arch}"
  filename="node-v${NODE_VERSION}-${platform}.tar.gz"
  base="https://nodejs.org/dist/v${NODE_VERSION}"
  archive="${TMPDIR_install}/${filename}"
  checksums="${TMPDIR_install}/node-SHASUMS256.txt"
  extract="${TMPDIR_install}/node-runtime"
  info "Node.js >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} not found; installing private Node.js v${NODE_VERSION}"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --retry 3 --retry-delay 2 -o "$archive" "${base}/${filename}"
    curl -fSL --retry 3 --retry-delay 2 -o "$checksums" "${base}/SHASUMS256.txt"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=3 -O "$archive" "${base}/${filename}"
    wget -q --tries=3 -O "$checksums" "${base}/SHASUMS256.txt"
  else
    die "Neither curl nor wget found. Install one and retry."
  fi
  expected="$(grep "  ${filename}$" "$checksums" | cut -d ' ' -f1)"
  [ -n "$expected" ] || die "Node.js checksum not found for ${filename}"
  if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$archive" | cut -d ' ' -f1)"; elif command -v shasum >/dev/null 2>&1; then actual="$(shasum -a 256 "$archive" | cut -d ' ' -f1)"; else die "Neither sha256sum nor shasum found. Install one and retry."; fi
  [ "$actual" = "$expected" ] || die "Node.js SHA-256 verification failed"
  mkdir -p "$extract"
  tar -xzf "$archive" -C "$extract" --strip-components=1
  NODE_RUNTIME_SOURCE="$extract"
  NODE_BIN="$extract/bin/node"
  [ -x "$NODE_BIN" ] || die "Private Node.js installation failed"
}

download() {
  local filename="coco-${COCO_VERSION}.tgz" sidecar line expected actual
  TARBALL="${TMPDIR_install}/${filename}"; sidecar="${TARBALL}.sha256"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --retry 3 --retry-delay 2 -o "$TARBALL" "${COCO_RELEASE_BASE}/${filename}"
    curl -fSL --retry 3 --retry-delay 2 -o "$sidecar" "${COCO_RELEASE_BASE}/${filename}.sha256"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=3 -O "$TARBALL" "${COCO_RELEASE_BASE}/${filename}"; wget -q --tries=3 -O "$sidecar" "${COCO_RELEASE_BASE}/${filename}.sha256"
  else die "Neither curl nor wget found. Install one and retry."; fi
  line="$(cat "$sidecar")"
  printf '%s\n' "$line" | grep -Eq "^[0-9a-fA-F]{64}  ${filename}$" || die "Invalid SHA-256 sidecar for ${filename}"
  expected="${line%%  *}"
  if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$TARBALL" | cut -d ' ' -f1)"; elif command -v shasum >/dev/null 2>&1; then actual="$(shasum -a 256 "$TARBALL" | cut -d ' ' -f1)"; else die "Neither sha256sum nor shasum found. Install one and retry."; fi
  [ "$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')" ] || die "SHA-256 verification failed for ${filename}"
}

download_agnes_key() {
  local key_path="${TMPDIR_install}/agnes.key" actual size
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --retry 3 --retry-delay 2 -o "$key_path" "$AGNES_KEY_URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=3 -O "$key_path" "$AGNES_KEY_URL"
  else die "Neither curl nor wget found. Install one and retry."; fi
  size="$(wc -c < "$key_path" | tr -d '[:space:]')"
  [ "$size" = "$AGNES_KEY_SIZE" ] || die "Agnes API key size verification failed"
  if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$key_path" | cut -d ' ' -f1)"; elif command -v shasum >/dev/null 2>&1; then actual="$(shasum -a 256 "$key_path" | cut -d ' ' -f1)"; else die "Neither sha256sum nor shasum found. Install one and retry."; fi
  [ "$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')" = "$AGNES_KEY_SHA256" ] || die "Agnes API key SHA-256 verification failed"
  printf '%s' "$key_path"
}

validate_archive() {
  "$NODE_BIN" - "$TARBALL" "$MAX_ARCHIVE_MEMBERS" "$MAX_ARCHIVE_BYTES" <<'NODE' || die "Unsafe or unexpected release archive"
const { spawn } = require("node:child_process");
const [archive, maxMembersArgument, maxBytesArgument] = process.argv.slice(2);
const MAX_LIST_LINE_BYTES = 4096; // Bounds streamed tar metadata per member.
const maxMembers = Number(maxMembersArgument), maxBytes = Number(maxBytesArgument);
async function* lines(args) {
  const child = spawn("tar", args, { stdio: ["ignore", "pipe", "ignore"] });
  const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error("tar failed"))); });
  let line = Buffer.alloc(0);
  try {
    for await (const chunk of child.stdout) for (let offset = 0; offset < chunk.length;) {
      const newline = chunk.indexOf(10, offset), end = newline === -1 ? chunk.length : newline, segment = chunk.subarray(offset, end);
      if (line.length + segment.length > MAX_LIST_LINE_BYTES) throw new Error("tar list line too long");
      line = Buffer.concat([line, segment]);
      if (newline === -1) break;
      yield line.toString("utf8").replace(/\r$/, ""); line = Buffer.alloc(0); offset = newline + 1;
    }
    if (line.length > 0) yield line.toString("utf8").replace(/\r$/, "");
    await exited;
  } finally { child.kill(); await exited.catch(() => {}); }
}
async function validate() {
  if (!Number.isSafeInteger(maxMembers) || !Number.isSafeInteger(maxBytes) || maxMembers < 1 || maxBytes < 0) return false;
  const names = lines(["-tzf", archive]), details = lines(["-tzvf", archive]), paths = new Set();
  let bytes = 0, members = 0, root = null;
  try {
    while (true) {
      const [name, detail] = await Promise.all([names.next(), details.next()]);
      if (name.done || detail.done) return name.done && detail.done && members > 0 && root === "package";
      const fields = detail.value.trim().split(/\s+/), size = Number(fields[2]), member = name.value.replace(/\/$/, ""), parts = member.split("/");
      if (++members > maxMembers || !Number.isSafeInteger(size) || size < 0 || (detail.value[0] !== "-" && detail.value[0] !== "d")) return false;
      bytes += size;
      if (bytes > maxBytes || !member || member.startsWith("/") || member.includes("\\") || /^[A-Za-z]:/.test(member) || parts.some((part) => part === "" || part === "." || part === "..") || paths.has(member) || (root !== null && root !== parts[0])) return false;
      paths.add(member); root = parts[0];
    }
  } finally { await Promise.allSettled([names.return(), details.return()]); }
}
validate().then((valid) => { if (!valid) process.exitCode = 1; }, () => { process.exitCode = 1; });
NODE
}

validate_candidate() {
  [ -x "$CANDIDATE_DIR/bin/coco" ] || die "Candidate binary not found or not executable"
  [ -f "$CANDIDATE_DIR/resources/provider-registry.v1.json" ] || die "Candidate is missing provider registry"
  [ -d "$CANDIDATE_DIR/node_modules" ] || die "Candidate is missing bundled node_modules"
  PATH="$(dirname "$NODE_BIN"):$PATH" "$CANDIDATE_DIR/bin/coco" --version >/dev/null 2>&1 || die "Candidate did not pass its version check"
  printf '%s\n' 'coco-install-v1' > "$CANDIDATE_DIR/.coco-install-owner"
}

validate_regular_path() {
  local path=$1 label=$2
  if [ -L "$path" ]; then die "Refusing symlinked ${label}: ${path}"; fi
  if [ -e "$path" ] && [ ! -f "$path" ]; then die "Refusing non-regular ${label}: ${path}"; fi
}

validate_directory_ancestors() {
  local path="$(dirname "$1")"
  while [ "$path" != "/" ]; do
    if [ -L "$path" ]; then die "Refusing symlinked configuration ancestor: ${path}"; fi
    if [ -e "$path" ] && [ ! -d "$path" ]; then die "Refusing non-directory configuration ancestor: ${path}"; fi
    path="$(dirname "$path")"
  done
}

validate_agent_path() {
  [ "$COCO_AGENT_DIR" != "$COCO_INSTALL_DIR" ] || die "Agent directory must not equal install directory"
  validate_directory_ancestors "$COCO_AGENT_DIR"
  if [ -L "$COCO_AGENT_DIR" ]; then die "Refusing symlinked agent directory: ${COCO_AGENT_DIR}"; fi
  if [ -e "$COCO_AGENT_DIR" ] && [ ! -d "$COCO_AGENT_DIR" ]; then die "Refusing non-directory agent path: ${COCO_AGENT_DIR}"; fi
  validate_regular_path "$COCO_AGENT_DIR/models.json" "models configuration"
  validate_regular_path "$COCO_AGENT_DIR/auth.json" "auth configuration"
  validate_regular_path "$COCO_AGENT_DIR/settings.json" "settings configuration"
}

fail_at_test_seam() {
  local seam=$1 message=$2
  [ -z "${!seam:-}" ] && return
  [ "${COCO_INSTALL_TEST_MODE:-}" = "1" ] || die "${seam} is reserved for the installer test harness"
  die "$message"
}

prepare_agent_backup() {
  case "${COCO_AGENT_DIR}/" in
    "${COCO_INSTALL_DIR}/"*)
      if [ -e "$COCO_AGENT_DIR" ]; then mv "$COCO_AGENT_DIR" "$AGENT_BACKUP"; HAD_AGENT=1; fi
      ;;
  esac
}

install_coco() {
  local extract="${TMPDIR_install}/extract"
  validate_archive
  mkdir -p "$extract" "$INSTALL_PARENT"
  tar --no-same-owner --no-same-permissions -xzf "$TARBALL" -C "$extract"
  mv "$extract/package" "$CANDIDATE_DIR"
  if [ -n "$NODE_RUNTIME_SOURCE" ]; then
    mkdir -p "$CANDIDATE_DIR/runtime"
    mv "$NODE_RUNTIME_SOURCE" "$CANDIDATE_DIR/runtime/node"
    NODE_BIN="$CANDIDATE_DIR/runtime/node/bin/node"
  fi
  validate_candidate
  validate_agent_path
  prepare_agent_backup
  if [ -e "$COCO_INSTALL_DIR" ]; then mv "$COCO_INSTALL_DIR" "$ROLLBACK_DIR"; HAD_INSTALL=1; fi
  mv "$CANDIDATE_DIR" "$COCO_INSTALL_DIR"; SWAPPED=1
  if [ -x "$COCO_INSTALL_DIR/runtime/node/bin/node" ]; then NODE_BIN="$COCO_INSTALL_DIR/runtime/node/bin/node"; fi
  if [ "$HAD_AGENT" -eq 1 ]; then
    mkdir -p "$(dirname "$COCO_AGENT_DIR")"
    mv "$AGENT_BACKUP" "$COCO_AGENT_DIR"
  fi
  fail_at_test_seam COCO_INSTALL_TEST_FAIL_AFTER_SWAP "Injected failure after candidate swap"
}

write_config() {
  local achai_key_path="" agnes_key_path=""
  mkdir -p "$COCO_AGENT_DIR"
  [ ! -L "$COCO_AGENT_DIR" ] || die "Refusing symlinked agent directory: ${COCO_AGENT_DIR}"
  chmod 700 "$COCO_AGENT_DIR"
  mkdir -p "$COCO_AGENT_DIR/sessions"
  chmod 700 "$COCO_AGENT_DIR/sessions"
  validate_regular_path "$COCO_AGENT_DIR/models.json" "models configuration"
  validate_regular_path "$COCO_AGENT_DIR/auth.json" "auth configuration"
  validate_regular_path "$COCO_AGENT_DIR/settings.json" "settings configuration"
  if [ ! -e "$COCO_AGENT_DIR/models.json" ]; then
    "$NODE_BIN" -e '
      const fs = require("fs"); const registry = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const providers = {};
      for (const [id, entry] of Object.entries(registry.providers)) providers[id] = { api: entry.api, authHeader: entry.authHeader, baseUrl: entry.baseUrl, compat: entry.compat, models: [] };
      const target = process.argv[2]; const handle = fs.openSync(target, "wx", 0o600); fs.writeFileSync(handle, JSON.stringify({ providers }) + "\n"); fs.closeSync(handle);
    ' "$COCO_INSTALL_DIR/resources/provider-registry.v1.json" "$COCO_AGENT_DIR/models.json"
    CREATED_MODELS=1
  fi
  if [ ! -e "$COCO_AGENT_DIR/auth.json" ]; then
    if [ -z "${AGNES_API_KEY:-}" ]; then agnes_key_path="$(download_agnes_key)"; fi
    if [ -z "${ACHAI_API_KEY:-}" ] && [ -f "$HOME/.config/opencode/secrets/achai-api-key" ] && [ ! -L "$HOME/.config/opencode/secrets/achai-api-key" ]; then
      achai_key_path="$HOME/.config/opencode/secrets/achai-api-key"
    fi
    (umask 077; set -C; printf '{}\n' > "$COCO_AGENT_DIR/auth.json") || die "Could not create auth configuration exclusively"
    CREATED_AUTH=1
  fi
  if [ "$CREATED_MODELS" -eq 1 ]; then chmod 600 "$COCO_AGENT_DIR/models.json"; fi
  if [ "$CREATED_AUTH" -eq 1 ]; then chmod 600 "$COCO_AGENT_DIR/auth.json"; fi
  if [ "$CREATED_AUTH" -eq 1 ] && { [ -n "${AGNES_API_KEY:-}" ] || [ -n "$agnes_key_path" ] || [ -n "${ACHAI_API_KEY:-}" ] || [ -n "$achai_key_path" ] || [ -n "${DEEPSEEK_API_KEY:-}" ]; }; then
    "$NODE_BIN" - "$COCO_AGENT_DIR/auth.json" "$agnes_key_path" "$achai_key_path" <<'NODE'
const fs = require("fs");
const [authPath, agnesKeyPath, achaiKeyPath] = process.argv.slice(2);
const key = process.env.AGNES_API_KEY || fs.readFileSync(agnesKeyPath, "utf8").replace(/\r?\n$/, "");
const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
auth.agnes = { type: "api_key", key };
const achaiKey = process.env.ACHAI_API_KEY || (achaiKeyPath ? fs.readFileSync(achaiKeyPath, "utf8").replace(/\r?\n$/, "") : "");
if (achaiKey) auth.achai = { type: "api_key", key: achaiKey };
if (process.env.DEEPSEEK_API_KEY) auth.deepseek = { type: "api_key", key: process.env.DEEPSEEK_API_KEY };
fs.writeFileSync(authPath, JSON.stringify(auth) + "\n", { mode: 0o600 });
NODE
  fi
  if [ "${COCO_INSTALL_TEST_MODE:-0}" = "1" ]; then
    return
  fi
  "$NODE_BIN" - "$COCO_AGENT_DIR" "$COCO_INSTALL_DIR/resources/provider-registry.v1.json" "$agnes_key_path" "$CREATED_MODELS" <<'NODE'
const fs = require("fs");
const [agentDir, registryPath, , createdModels] = process.argv.slice(2);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const modelsPath = `${agentDir}/models.json`;
const settingsPath = `${agentDir}/settings.json`;
const agnes = registry.providers.agnes;
if (createdModels === "1") {
const models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
const achai = registry.providers.achai;
const deepseek = registry.providers.deepseek;
const idepub = registry.providers.idepub;
const stepfun = registry.providers.stepfun;
const standard = (id, name, reasoning = false) => ({ id, name, reasoning, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 });
models.providers.achai = {
  api: achai.api,
  authHeader: achai.authHeader,
  baseUrl: achai.baseUrl,
  compat: achai.compat,
  models: [
    standard("deepseek-v4-flash", "DeepSeek V4 Flash"),
    standard("grok-4.20-0309", "Grok 4.20"),
    standard("grok-4.20-0309-reasoning", "Grok 4.20 Reasoning", true),
    standard("grok-4.20-multi-agent-0309", "Grok 4.20 Multi-Agent"),
    standard("grok-4.3", "Grok 4.3", true),
    standard("grok-4.5", "Grok 4.5", true),
    standard("grok-build-0.1", "Grok Build 0.1"),
    standard("grok-chat-fast", "Grok Chat Fast"),
    standard("mimo-v2.5", "Mimo v2.5"),
    standard("nemotron-3-ultra", "Nemotron 3 Ultra"),
    standard("north-mini-code", "North Mini Code")
  ]
};
models.providers.agnes = {
  api: agnes.api,
  authHeader: true,
  baseUrl: agnes.baseUrl,
  compat: agnes.compat,
  models: [{
    id: "agnes-2.5-flash",
    name: "Agnes 2.5 Flash",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384
  }]
};
models.providers.deepseek = {
  api: deepseek.api,
  authHeader: deepseek.authHeader,
  baseUrl: deepseek.baseUrl,
  compat: deepseek.compat,
  models: [
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"], cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" }, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" } },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true, input: ["text"], cost: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" }, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" } }
  ]
};
models.providers.idepub = {
  api: idepub.api,
  authHeader: idepub.authHeader,
  baseUrl: idepub.baseUrl,
  compat: idepub.compat,
  models: [
    { id: "gpt-5.6", name: "GPT-5.6 Sol", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 }
  ]
};
models.providers.stepfun = {
  api: stepfun.api,
  authHeader: stepfun.authHeader,
  baseUrl: stepfun.baseUrl,
  compat: stepfun.compat,
  models: [
    { id: "step-3.7-flash", name: "Step 3.7 Flash", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
    { id: "step-3.5-flash-2603", name: "Step 3.5 Flash 2603", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
    { id: "step-3.5-flash", name: "Step 3.5 Flash", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 }
  ]
};
fs.writeFileSync(modelsPath, JSON.stringify(models) + "\n", { mode: 0o600 });
}
const settingsExisted = fs.existsSync(settingsPath);
const settings = settingsExisted ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : {};
settings.defaultProvider = "agnes";
settings.defaultModel = "agnes-2.5-flash";
settings.defaultThinkingLevel = "max";
if (!fs.existsSync(settingsPath)) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings) + "\n", { mode: 0o600 });
}
if (createdModels === "1" && !settingsExisted && !fs.existsSync(`${agentDir}/ownership.json`)) {
  const crypto = require("crypto"); const path = require("path");
  const appendPath = `${agentDir}/APPEND_SYSTEM.md`;
  const appendSource = fs.readFileSync(path.join(path.dirname(registryPath), "append-system-v1.md"));
  if (!fs.existsSync(appendPath)) fs.writeFileSync(appendPath, appendSource, { mode: 0o600, flag: "wx" });
  const providerFields = ["baseUrl", "api", "authHeader", "compat", "models"];
  const providerPointers = Object.keys(registry.providers).flatMap((provider) => providerFields.map((field) => `/providers/${provider}/${field}`));
  const ownership = { managedFiles: {
    "APPEND_SYSTEM.md": { ownedJsonPointers: [], sourceSha256: crypto.createHash("sha256").update(appendSource).digest("hex") },
    "models.json": { ownedJsonPointers: providerPointers },
    "settings.json": { ownedJsonPointers: ["/defaultProvider", "/defaultModel", "/defaultThinkingLevel"] }
  }, schemaVersion: 1 };
  fs.writeFileSync(`${agentDir}/ownership.json`, JSON.stringify(ownership) + "\n", { mode: 0o600, flag: "wx" });
}
NODE
  chmod 600 "$COCO_AGENT_DIR/models.json" "$COCO_AGENT_DIR/settings.json" "$COCO_AGENT_DIR/auth.json"
  [ ! -e "$COCO_AGENT_DIR/ownership.json" ] || chmod 600 "$COCO_AGENT_DIR/ownership.json"
  [ ! -e "$COCO_AGENT_DIR/APPEND_SYSTEM.md" ] || chmod 600 "$COCO_AGENT_DIR/APPEND_SYSTEM.md"
}

verify_config() {
  "$NODE_BIN" -e '
    const fs = require("fs"); const dir = process.argv[1];
    const models = JSON.parse(fs.readFileSync(dir + "/models.json", "utf8")); const auth = JSON.parse(fs.readFileSync(dir + "/auth.json", "utf8"));
    if (models === null || typeof models !== "object" || Array.isArray(models) || models.providers === null || typeof models.providers !== "object" || Array.isArray(models.providers) || auth === null || typeof auth !== "object" || Array.isArray(auth)) process.exit(1);
  ' "$COCO_AGENT_DIR" || die "Configuration verification failed"
}

link_binary() {
  mkdir -p "$COCO_BIN_DIR"
  if [ -L "$COCO_BIN_DIR/coco" ] || [ -f "$COCO_BIN_DIR/coco" ]; then mv "$COCO_BIN_DIR/coco" "$PREVIOUS_LINK"; HAD_LINK=1; elif [ -e "$COCO_BIN_DIR/coco" ]; then die "Refusing non-regular binary link path"; fi
  if [ -x "$COCO_INSTALL_DIR/runtime/node/bin/node" ]; then
    cat > "$COCO_BIN_DIR/coco" <<EOF
#!/usr/bin/env bash
exec "$COCO_INSTALL_DIR/runtime/node/bin/node" "$COCO_INSTALL_DIR/bin/coco" "\$@"
EOF
    chmod 700 "$COCO_BIN_DIR/coco"
  else
    ln -s "$COCO_INSTALL_DIR/bin/coco" "$COCO_BIN_DIR/coco"
  fi
  LINKED=1
  fail_at_test_seam COCO_INSTALL_TEST_FAIL_AFTER_LINK "Injected failure after binary link"
}

main() {
  detect_platform; prepare_node; download; install_coco; write_config; verify_config; link_binary
  COMMITTED=1
  rm -rf "$ROLLBACK_DIR"
  info "Installed coco v${COCO_VERSION}"
}

main "$@"
