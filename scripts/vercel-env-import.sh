#!/usr/bin/env bash
set -euo pipefail

# Import KEY=VALUE lines from an .env file into Vercel envs.
# - Skips comments/blank lines
# - Supports lines starting with "export "
# - Trims surrounding single/double quotes from values
# - Defaults to targets: preview,production
# - Optional --force to remove existing key before adding
# - Optional --allow-empty to add even when value is empty
#
# Prereqs:
#   - vercel CLI installed and logged-in:  vercel login
#   - Project linked in this directory:    vercel link
#
# Examples:
#   scripts/vercel-env-import.sh -f .env.local
#   scripts/vercel-env-import.sh -f .env.local -t preview
#   scripts/vercel-env-import.sh -f .env.local -t preview,production --force
#   scripts/vercel-env-import.sh -f .env.local --dry-run

ENV_FILE=".env.local"
TARGETS=("preview" "production")
FORCE=0
DRY=0
ALLOW_EMPTY=0
SKIP_EXISTING=1

usage() {
  echo "Usage: $0 [-f env_file] [-t envs] [--force] [--dry-run] [--allow-empty]"
  echo "  -f, --file         Path to .env file (default: .env.local)"
  echo "  -t, --targets      Comma-separated envs (preview,production,development)"
  echo "      --force        Remove var first (non-interactive) before adding"
  echo "      --dry-run      Print actions but do not call vercel"
  echo "      --allow-empty  Add variables even when value is empty"
  echo "      --no-skip      Do not skip existing keys (default skips)"
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)
      ENV_FILE="${2:-}"; shift 2;;
    -t|--targets)
      IFS=',' read -r -a TARGETS <<< "${2:-}"; shift 2;;
    --force)
      FORCE=1; shift;;
    --dry-run)
      DRY=1; shift;;
    --allow-empty)
      ALLOW_EMPTY=1; shift;;
    --no-skip)
      SKIP_EXISTING=0; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: vercel CLI not found. Install: npm i -g vercel"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  exit 1
fi

# Trim helper
trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Ensure project is linked (non-fatal if already linked)
if (( ! DRY )); then
  vercel link --confirm >/dev/null 2>&1 || true
fi

echo "Importing envs from: $ENV_FILE"
echo "Targets: ${TARGETS[*]}"
(( FORCE )) && echo "Force replace: enabled"
(( DRY )) && echo "Dry run: enabled"
(( ALLOW_EMPTY )) && echo "Allow empty: enabled"
(( SKIP_EXISTING )) && echo "Skip existing: enabled"

# Cache env keys per target (requires vercel CLI and jq). If jq missing, pre-check is disabled.
declare -A TARGET_KEYS
have_jq=0
if command -v jq >/dev/null 2>&1; then have_jq=1; fi

load_keys_for_target() {
  local target="$1"
  [[ $SKIP_EXISTING -eq 0 ]] && return 0
  [[ $have_jq -eq 0 ]] && return 0
  if [[ -n "${TARGET_KEYS[$target]:-}" ]]; then return 0; fi
  # vercel env ls <target> --json prints a JSON with envs[]
  local json
  if ! json=$(vercel env ls "$target" --json 2>/dev/null); then
    return 0
  fi
  local keys
  keys=$(printf '%s' "$json" | jq -r '.envs[]?.key' | tr '\n' ' ')
  TARGET_KEYS[$target]="$keys"
}

key_exists_in_target() {
  local key="$1" target="$2"
  [[ $SKIP_EXISTING -eq 0 ]] && return 1
  [[ $have_jq -eq 0 ]] && return 1
  load_keys_for_target "$target"
  local keys="${TARGET_KEYS[$target]:-}"
  [[ " $keys " == *" $key "* ]]
}

# Read file line-by-line
while IFS= read -r raw || [[ -n "${raw}" ]]; do
  # Normalize CRLF
  line="${raw%$'\r'}"

  # Skip blanks
  if [[ -z "${line//[[:space:]]/}" ]]; then
    continue
  fi

  # Skip comments (after trimming leading spaces)
  ltrimmed="${line#"${line%%[![:space:]]*}"}"
  if [[ "${ltrimmed}" == \#* ]]; then
    continue
  fi

  # Strip optional 'export '
  line="${ltrimmed#export }"

  # Require KEY=VALUE
  if [[ "$line" != *"="* ]]; then
    echo "Skip (no '='): $line"
    continue
  fi

  key="${line%%=*}"
  val="${line#*=}"

  key="$(trim "$key")"
  val="$(trim "$val")"

  # Validate var name
  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Skip (invalid var name): $key"
    continue
  fi

  # Strip matching outer quotes
  if [[ ${#val} -ge 2 ]]; then
    first="${val:0:1}"
    last="${val: -1}"
    if [[ "$first" == "'" && "$last" == "'" ]] || [[ "$first" == '"' && "$last" == '"' ]]; then
      val="${val:1:-1}"
    fi
  fi

  # Skip empty unless allowed
  if [[ -z "$val" && $ALLOW_EMPTY -eq 0 ]]; then
    echo "Skip (empty value): $key"
    continue
  fi

  for target in "${TARGETS[@]}"; do
    if (( DRY )); then
      echo "[DRY] vercel env add $key $target  (value length: ${#val})"
      continue
    fi

    # Skip if key already exists and not forcing
    if key_exists_in_target "$key" "$target" && (( FORCE == 0 )); then
      echo "Skip (exists) $key in $target"
      continue
    fi

    # Remove existing var if forcing (non-interactive)
    if (( FORCE )); then
      vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    fi

    # Pipe value via stdin to avoid interactive prompt; tolerate "already added" errors
    add_out="$(printf '%s' "$val" | vercel env add "$key" "$target" 2>&1 || true)"
    if grep -qi "has already been added" <<< "$add_out"; then
      echo "Skip (exists) $key in $target"
    elif grep -qi "already exists" <<< "$add_out"; then
      echo "Skip (exists) $key in $target"
    elif grep -qi "added\|Created Variable" <<< "$add_out"; then
      echo "Added $key to $target"
    else
      echo "$add_out"
      echo "Failed to add $key to $target"
      exit 1
    fi

    # brief delay to avoid rate limiting
    sleep 0.1
  done
done < "$ENV_FILE"

echo "Done."
