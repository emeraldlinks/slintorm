#!/usr/bin/env sh
#
# SlintORM skill installer.
#
#   curl -fsSL https://raw.githubusercontent.com/emeraldlinks/slintorm/main/install.sh | sh
#
# Installs the `slintorm` skill into whichever agent directories exist:
#   ~/.claude/skills          (Claude Code)
#   ~/.config/opencode/skills (OpenCode)
#   ~/.agents/skills          (agents.md / generic)
#
# Flags: --dir <path>   install only into <path>
#        --force        overwrite an existing install
#        --verify       print the command to run the behavioural suite
#        --uninstall    remove installed copies
#
# NOTE: `curl … | sh` cannot take flags — the shell consumes them as its own
# options. For anything beyond the default auto-detect, download first:
#
#   curl -fsSL https://raw.githubusercontent.com/emeraldlinks/slintorm/main/install.sh -o install.sh
#   sh install.sh --force --verify
#
# No sudo. No writes outside the chosen directories. Exits non-zero on failure.

set -eu

REPO="emeraldlinks/slintorm"
BRANCH="main"
# Override for testing or mirrors: SLINTORM_SKILL_BASE=https://host/path
BASE="${SLINTORM_SKILL_BASE:-https://raw.githubusercontent.com/${REPO}/${BRANCH}/.opencode/skills/slintorm}"
INSTALLER_URL="${SLINTORM_INSTALLER_URL:-https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh}"

FILES="SKILL.md
reference/schema.md
reference/model-api.md
reference/query-builder.md
reference/drivers.md
reference/cli.md
examples/verified.ts"

FORCE=0
VERIFY=0
UNINSTALL=0
CUSTOM_DIR=""

# ── output helpers ──────────────────────────────────────────────────────────
# Defined BEFORE argument parsing: --dir and unknown flags call die().
if [ -t 1 ]; then G="\033[32m"; R="\033[31m"; Y="\033[33m"; D="\033[2m"; N="\033[0m"
else G=""; R=""; Y=""; D=""; N=""; fi
info() { printf '%s\n' "${D}  $1${N}"; }
ok()   { printf '%s\n' "${G}  ✓${N} $1"; }
warn() { printf '%s\n' "${Y}  !${N} $1"; }
die()  { printf '%s\n' "${R}  ✗ $1${N}" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --force)     FORCE=1; shift ;;
    --verify)    VERIFY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --dir)
      [ $# -ge 2 ] || die "--dir requires a path"
      CUSTOM_DIR="$2"; shift 2 ;;
    -h|--help)   sed -n '2,26p' "$0" | sed 's/^#\{1,\} \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" ;;
  esac
done

command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
  || die "need curl or wget"

fetch() { # fetch <url> <dest>
  _url="$1"; _dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$_url" -o "$_dest"
  else
    wget -qO "$_dest" "$_url"
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── targets ─────────────────────────────────────────────────────────────────
# Surveyed agent harnesses that use the <home>/skills/<name>/SKILL.md
# convention. Probed by parent-dir existence, so a harness that is installed
# but unused is simply skipped.
#
#   ~/.claude/skills              Claude Code
#   ~/.config/opencode/skills     OpenCode
#   ~/.gemini/antigravity/skills  Antigravity
#   ~/.pi/skills                  Pi
#   ~/.copilot/skills             GitHub Copilot CLI
#   ~/.kilo/skills                Kilo Code
#   ~/.qwen/skills                Qwen Code
#   ~/.codex/skills               Codex
#   ~/.agents/skills              agents.md / generic  ← SYMLINK FARM
#
# ~/.agents/skills is a mirror of ~/.claude/skills: every one of its entries is
# a symlink. It is installed as a symlink rather than a copy so it cannot drift
# from the canonical ~/.claude copy — the same convention the other 118 entries
# use.
#
# Deliberately NOT targeted — no skills/ directory, and inventing one would
# mean guessing at a convention these tools do not have:
#   ~/.aider   (uses .aider.conf.yml), ~/.cline, ~/.kiro,
#   ~/.hermes  (bin only), ~/.config/goose, ~/.cursor/rules

CANONICAL="$HOME/.claude/skills"
SYMLINK_TARGETS="$HOME/.agents/skills"

if [ -n "$CUSTOM_DIR" ]; then
  TARGETS="$CUSTOM_DIR"
else
  _t=""
  for d in \
    "$HOME/.claude/skills" \
    "$HOME/.config/opencode/skills" \
    "$HOME/.gemini/antigravity/skills" \
    "$HOME/.pi/skills" \
    "$HOME/.copilot/skills" \
    "$HOME/.kilo/skills" \
    "$HOME/.qwen/skills" \
    "$HOME/.codex/skills" \
    "$HOME/.agents/skills"
  do
    [ -d "$(dirname "$d")" ] && _t="${_t}${d}\n"
  done
  TARGETS=$(printf '%b' "$_t" | grep -v '^$' || true)
  [ -n "$TARGETS" ] || die "no agent skills directory found. Pass --dir <path>."
fi

# Normalise to newline-terminated. `read` returns non-zero on EOF without a
# trailing newline, which silently skips the loop body — and makes the script
# exit 0 having installed nothing.
TARGETS=$(printf '%s\n' "$TARGETS" | grep -v '^[[:space:]]*$' || true)
[ -n "$TARGETS" ] || die "no install target resolved"

# ── uninstall ───────────────────────────────────────────────────────────────
if [ "$UNINSTALL" -eq 1 ]; then
  printf '%s\n' "$TARGETS" | while IFS= read -r base; do
    [ -z "$base" ] && continue
    if [ -L "${base}/slintorm" ]; then
      rm -f "${base}/slintorm"
      ok "unlinked ${base}/slintorm"
    elif [ -d "${base}/slintorm" ]; then
      rm -rf "${base}/slintorm"
      ok "removed ${base}/slintorm"
    else
      info "not installed in $base"
    fi
  done
  printf '\n'
  exit 0
fi

# ── connectivity ────────────────────────────────────────────────────────────
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t slintorm)
trap 'rm -rf "$TMP"' EXIT INT TERM

info "checking connectivity to ${REPO}@${BRANCH} …"
fetch "${BASE}/SKILL.md" "${TMP}/SKILL.md" 2>/dev/null \
  || die "cannot reach ${BASE}/SKILL.md
  Check the branch name and your network. Private repo? Needs a token."
ok "reachable"

# Reject an HTML error page masquerading as markdown.
if ! head -1 "${TMP}/SKILL.md" | grep -q '^---'; then
  die "fetched SKILL.md is not a valid skill file (got HTML?)"
fi
info "$(grep -c '^' "${TMP}/SKILL.md") lines of SKILL.md"

# ── install ─────────────────────────────────────────────────────────────────
printf '\n'
COUNT=0
printf '%s\n' "$TARGETS" | while IFS= read -r base; do
  [ -z "$base" ] && continue
  dest="${base}/slintorm"

  # ~/.agents/skills is a mirror: link it, never copy it.
  if [ "$base" = "$SYMLINK_TARGETS" ] && [ "$CUSTOM_DIR" = "" ]; then
    if [ -L "$dest" ]; then
      if [ "$FORCE" -eq 0 ]; then warn "${dest} already linked — skipping"; continue; fi
      rm -f "$dest"
    elif [ -e "$dest" ]; then
      if [ "$FORCE" -eq 0 ]; then warn "${dest} exists and is not a symlink — skipping"; continue; fi
      rm -rf "$dest"
    fi
    if [ -d "$CANONICAL/slintorm" ] && ln -s "$CANONICAL/slintorm" "$dest" 2>/dev/null; then
      ok "${dest}  → symlink to ${CANONICAL}/slintorm"
      continue
    fi
    warn "could not link ${dest}; falling back to a copy"
  fi

  if [ -d "$dest" ] && [ "$FORCE" -eq 0 ]; then
    warn "${dest} exists — skipping (use --force to overwrite)"
    continue
  fi

  mkdir -p "$dest" || die "cannot create $dest"
  [ -d "$dest" ] && rm -rf "$dest.bak" && [ -e "$dest" ] && mv "$dest" "$dest.bak"

  n=0
  failed=""
  for f in $FILES; do
    mkdir -p "${dest}/$(dirname "$f")"
    if fetch "${BASE}/${f}" "${dest}/${f}"; then
      n=$((n + 1))
    else
      failed="${failed} ${f}"
    fi
  done

  if [ -n "$failed" ]; then
    rm -rf "$dest"
    [ -d "${dest}.bak" ] && mv "${dest}.bak" "$dest"
    die "install into ${base} failed for:${failed}"
  fi

  # The installer script itself, so updates are reproducible.
  if fetch "$INSTALLER_URL" "${dest}/install.sh" 2>/dev/null; then
    chmod +x "${dest}/install.sh" 2>/dev/null || true
    n=$((n + 1))
  fi

  [ -d "${dest}.bak" ] && rm -rf "${dest}.bak"
  ok "${base}/slintorm  (${n} files)"
  printf '    uninstall: rm -rf %s/slintorm\n' "$base"
done

# ── verify ──────────────────────────────────────────────────────────────────
if [ "$VERIFY" -eq 1 ]; then
  printf '\n'
  info "running behavioural verification …"
  printf '%s\n' "$TARGETS" | while IFS= read -r base; do
    [ -z "$base" ] && continue
    [ -f "${base}/slintorm/examples/verified.ts" ] || continue
    if have node; then
      info "install slintorm in a project that depends on it, then:"
      info "  npx tsx ${base}/slintorm/examples/verified.ts"
    else
      warn "node not found — skipped. The test needs Node 18+."
    fi
  done
fi

printf '\n'
ok "installed — restart your agent to load the skill"
printf '\n'
info "It triggers on: slintorm, defineModel, ORMManager, @softDelete,"
info "@relation, PostgREST, or edge-ORM questions."
info ""
info "The skill ships examples/verified.ts — 33 assertions covering schema,"
info "CRUD, soft delete, validation, and the PostgREST driver. Run it before"
info "telling anyone the code works:"
info "  npx tsx ~/.claude/skills/slintorm/examples/verified.ts"
printf '\n'