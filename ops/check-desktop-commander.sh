#!/usr/bin/env bash
set -euo pipefail

SERVICE="${DESKTOP_COMMANDER_SERVICE:-desktop-commander.service}"
LOG_FILE="${DESKTOP_COMMANDER_LOG:-/home/administrator/dc-service.log}"
REMOTE_URL="${DESKTOP_COMMANDER_REMOTE_URL:-https://mcp.desktopcommander.app/mcp}"

active="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
enabled="$(systemctl is-enabled "$SERVICE" 2>/dev/null || true)"
printf 'service=%s enabled=%s active=%s\n' "$SERVICE" "$enabled" "$active"

if [[ "$enabled" != "enabled" || "$active" != "active" ]]; then
  echo "Desktop Commander service is not both enabled and active." >&2
  exit 1
fi

http_code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 15 "$REMOTE_URL" || true)"
printf 'remote_http=%s\n' "$http_code"
if [[ -z "$http_code" || "$http_code" == "000" ]]; then
  echo "Remote Desktop Commander endpoint is unreachable." >&2
  exit 1
fi

if [[ -f "$LOG_FILE" ]]; then
  recent="$(tail -n 250 "$LOG_FILE")"
  if grep -Eqi 'Invalid Refresh Token|Persisted session invalid|Device code has expired' <<<"$recent"; then
    echo "Desktop Commander requires device re-authorization." >&2
    echo "Restart the service if needed, then approve the fresh device code shown in the service log." >&2
    exit 2
  fi
fi

echo "Desktop Commander local service and remote endpoint checks passed."
