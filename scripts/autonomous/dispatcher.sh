#!/bin/bash
# dispatcher.sh — Entry point for autonomous agent system
# Called by launchd, cron, or manually
# Usage: dispatcher.sh [triage|heal|quality|morning|bridge|all]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
load_env

MODE="${1:-triage}"

log_info "=========================================="
log_info "Dispatcher started: mode=$MODE pid=$$"
log_info "=========================================="

# --- Ensure claude CLI is available ---
if ! command -v claude &>/dev/null; then
  # Try common paths
  for p in "$HOME/.local/bin/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
    if [ -x "$p" ]; then
      export PATH="$(dirname "$p"):$PATH"
      break
    fi
  done
fi

if ! command -v claude &>/dev/null; then
  log_error "claude CLI not found in PATH"
  exit 1
fi

# --- Ensure gog is available ---
if ! command -v gog &>/dev/null; then
  for p in "$HOME/.local/bin/gog" /opt/homebrew/bin/gog /usr/local/bin/gog; do
    if [ -x "$p" ]; then
      export PATH="$(dirname "$p"):$PATH"
      break
    fi
  done
fi

# --- Lock and run ---
run_mode() {
  local mode="$1"
  local script="$SCRIPT_DIR/${mode}.sh"

  if [ ! -f "$script" ]; then
    log_error "Script not found: $script"
    return 1
  fi

  if ! acquire_lock "autonomous-$mode"; then
    log_warn "Could not acquire lock for $mode — already running"
    return 0
  fi

  local start_time
  start_time=$(now_epoch)

  log_info "Running $mode..."
  bash "$script" >> "$LOG_DIR/autonomous-${mode}.log" 2>&1 || {
    local exit_code=$?
    log_error "$mode failed with exit code $exit_code"
    release_lock "autonomous-$mode"

    # Notify on failure (if notify.sh is available)
    if [ -f "$SCRIPT_DIR/notify.sh" ]; then
      bash "$SCRIPT_DIR/notify.sh" --escalate "$mode failed with exit code $exit_code" 2>/dev/null || true
    fi

    return $exit_code
  }

  local elapsed=$(( $(now_epoch) - start_time ))
  log_info "$mode completed in ${elapsed}s"

  release_lock "autonomous-$mode"
}

case "$MODE" in
  triage)
    run_mode "triage"
    ;;
  quality)
    run_mode "quality"
    ;;
  morning)
    run_mode "morning-briefing"
    ;;
  bridge)
    run_mode "slack-bridge"
    ;;
  today)
    run_mode "today"
    ;;
  invest)
    run_mode "invest"
    ;;
  all)
    run_mode "today"
    run_mode "quality"
    ;;
  *)
    echo "Usage: dispatcher.sh [triage|today|quality|morning|bridge|invest|all]"
    echo ""
    echo "Modes:"
    echo "  today    — 5-channel triage (email/slack/LINE/messenger) + briefing"
    echo "  triage   — Email/Slack classification and auto-archive (legacy)"
    echo "  quality  — Pre-push quality gate (test, lint, AI review)"
    echo "  morning  — Morning briefing (calendar, todos, overnight triage)"
    echo "  bridge   — Slack DM → claude -p → reply bridge"
    echo "  invest   — Investment screening and analysis"
    echo "  all      — Run today + quality sequentially"
    exit 1
    ;;
esac

log_info "Dispatcher finished: mode=$MODE"
