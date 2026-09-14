#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo '[1/7] Syntax checking all Node modules'
for file in app/*.mjs; do node --check "$file"; done

echo '[2/7] Syntax checking Python renderer'
python3 -m py_compile python/whiteboard_scene.py

echo '[3/7] Running self-tests'
npm test

echo '[4/7] Auditing production dependencies'
npm audit --omit=dev

echo '[5/7] Validating Docker Compose'
docker compose config -q

echo '[6/7] Checking repository hygiene and cost policy'
tracked_sensitive="$(git ls-files | grep -E '(^|/)(\.env($|\.)|.*\.(pem|key)$|credentials|secrets)' | grep -vE '(^|/)\.env\.example$' || true)"
if [[ -n "$tracked_sensitive" ]]; then
  echo 'Tracked sensitive-looking files detected:' >&2
  echo "$tracked_sensitive" >&2
  exit 1
fi
policy_violation="$(grep -RInE 'paidFallback[[:space:]]*[:=][[:space:]]*true|freeOnly[[:space:]]*[:=][[:space:]]*false' app provider-registry.json || true)"
if [[ -n "$policy_violation" ]]; then
  echo 'Free-only policy violation detected:' >&2
  echo "$policy_violation" >&2
  exit 1
fi

echo '[7/7] Checking whitespace'
git diff --check

echo 'release-check: ok'
