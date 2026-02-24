#!/bin/bash
# common.sh — Shared utilities for autonomous scripts
# Provides: logging, locking, error handling, config loading

set -euo pipefail

# --- Paths ---
AUTONOMOUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAWD_DIR="${WORKSPACE:-$(cd "$AUTONOMOUS_DIR/../.." && pwd)}"
LOG_DIR="$CLAWD_DIR/logs"
LOCK_DIR="/tmp/clawd-autonomous"
CONFIG_FILE="$AUTONOMOUS_DIR/config.json"

mkdir -p "$LOG_DIR" "$LOCK_DIR"

# --- Logging ---
log() {
  local level="${1:-INFO}"
  shift
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $*" >> "$LOG_DIR/autonomous.log"
  if [ "$level" = "ERROR" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $*" >&2
  fi
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }
log_debug() {
  if [ "${DEBUG:-0}" = "1" ]; then
    log "DEBUG" "$@"
  fi
}

# --- Locking (prevent concurrent runs) ---
acquire_lock() {
  local name="$1"
  local lockfile="$LOCK_DIR/${name}.lock"
  local pidfile="$LOCK_DIR/${name}.pid"

  if [ -f "$lockfile" ]; then
    local old_pid
    old_pid=$(cat "$pidfile" 2>/dev/null || echo "")
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      log_warn "Lock '$name' held by PID $old_pid — skipping"
      return 1
    else
      log_info "Removing stale lock '$name' (PID $old_pid no longer running)"
      rm -f "$lockfile" "$pidfile"
    fi
  fi

  echo "$$" > "$pidfile"
  touch "$lockfile"
  log_debug "Acquired lock '$name' (PID $$)"
  return 0
}

release_lock() {
  local name="$1"
  rm -f "$LOCK_DIR/${name}.lock" "$LOCK_DIR/${name}.pid"
  log_debug "Released lock '$name'"
}

# --- Config loading ---
config_get() {
  local key="$1"
  local default="${2:-}"
  if [ -f "$CONFIG_FILE" ]; then
    local val
    val=$(python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    d = json.load(f)
keys = '$key'.split('.')
for k in keys:
    if isinstance(d, dict) and k in d:
        d = d[k]
    else:
        print('$default')
        sys.exit(0)
v = d if not isinstance(d, (dict, list)) else json.dumps(d)
# Normalize Python bools to lowercase for bash compatibility
if isinstance(v, bool):
    print('true' if v else 'false')
else:
    print(v)
" 2>/dev/null)
    echo "${val:-$default}"
  else
    echo "$default"
  fi
}

# --- .env loading ---
load_env() {
  local env_file="$CLAWD_DIR/.env"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    log_debug "Loaded .env from $env_file"
  else
    log_warn ".env not found at $env_file"
  fi
}

# --- Error handling ---
on_error() {
  local exit_code=$?
  local line_no=$1
  log_error "Script failed at line $line_no with exit code $exit_code"
  # Release any locks held by this process
  for lockpid in "$LOCK_DIR"/*.pid; do
    if [ -f "$lockpid" ] && [ "$(cat "$lockpid")" = "$$" ]; then
      local lockname
      lockname=$(basename "$lockpid" .pid)
      release_lock "$lockname"
    fi
  done
}

trap 'on_error $LINENO' ERR

# --- Claude CLI wrapper ---
run_claude() {
  local prompt="$1"
  shift
  local max_turns="${1:-10}"
  shift || true
  local allowed_tools="${1:-Read}"
  shift || true
  local system_prompt="${1:-}"
  shift || true
  local max_budget="${1:-$(config_get 'max_budget_usd' '0.50')}"

  local args=(
    -p
    --output-format json
    --max-turns "$max_turns"
  )

  if [ -n "$allowed_tools" ]; then
    args+=(--allowedTools "$allowed_tools")
  fi

  if [ -n "$system_prompt" ]; then
    args+=(--append-system-prompt "$system_prompt")
  fi

  log_info "Running claude -p (max_turns=$max_turns, budget=$max_budget)"
  log_debug "Prompt: ${prompt:0:200}..."

  local result
  # Unset CLAUDECODE to allow nested claude -p calls from within Claude Code sessions
  result=$(env -u CLAUDECODE claude "${args[@]}" "$prompt" 2>>"$LOG_DIR/autonomous-claude-stderr.log") || {
    log_error "claude -p failed with exit code $?"
    echo "{}"
    return 1
  }

  echo "$result"
}

# --- JSON helpers ---
json_length() {
  echo "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('$2',[])))" 2>/dev/null || echo "0"
}

json_get() {
  echo "$1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
keys = '$2'.split('.')
for k in keys:
    if isinstance(d, dict) and k in d:
        d = d[k]
    else:
        print('')
        sys.exit(0)
if isinstance(d, (dict, list)):
    print(json.dumps(d))
else:
    print(d)
" 2>/dev/null || echo ""
}

# --- Timestamp helpers ---
now_epoch() { date +%s; }
now_iso()   { date '+%Y-%m-%dT%H:%M:%S%z'; }
hours_ago() { date -v-"${1}"H +%s; }
