#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

good="$tmp/good.env"
cat > "$good" <<'EOF'
PUBLIC_LAUNCH=true
FORCE_SECURE_COOKIE=true
PUBLIC_APP_URL=https://example.test
APP_AUTH_SECRET=12345678901234567890123456789012
PROVIDER_WORKER_TOKEN=abcdefghijklmnopqrstuvwxyz123456
EOF
chmod 600 "$good"
bash ops/check-production-runtime.sh "$good" >/dev/null

bad="$tmp/bad.env"
cat > "$bad" <<'EOF'
PUBLIC_LAUNCH=true
FORCE_SECURE_COOKIE=true
PUBLIC_APP_URL=https://example.test
APP_AUTH_SECRET=too-short
PROVIDER_WORKER_TOKEN=abcdefghijklmnopqrstuvwxyz123456
EOF
chmod 600 "$bad"
if bash ops/check-production-runtime.sh "$bad" >/dev/null 2>&1; then
  echo "expected weak APP_AUTH_SECRET to fail" >&2
  exit 1
fi

same="$tmp/same.env"
cat > "$same" <<'EOF'
PUBLIC_LAUNCH=true
FORCE_SECURE_COOKIE=true
PUBLIC_APP_URL=https://example.test
APP_AUTH_SECRET=12345678901234567890123456789012
PROVIDER_WORKER_TOKEN=12345678901234567890123456789012
EOF
chmod 600 "$same"
if bash ops/check-production-runtime.sh "$same" >/dev/null 2>&1; then
  echo "expected shared auth/worker secret to fail" >&2
  exit 1
fi

chmod 644 "$good"
if bash ops/check-production-runtime.sh "$good" >/dev/null 2>&1; then
  echo "expected permissive env file mode to fail" >&2
  exit 1
fi

echo "production runtime preflight tests: ok"
