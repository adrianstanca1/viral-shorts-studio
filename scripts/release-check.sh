#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo '[1/11] Syntax checking all Node modules'
for file in app/*.mjs; do node --check "$file"; done

echo '[2/11] Syntax checking Python renderer'
python3 -m py_compile python/whiteboard_scene.py

echo '[3/11] Running self-tests'
npm test

echo '[4/11] Auditing production dependencies'
npm audit --omit=dev

echo '[5/11] Validating Docker Compose'
docker compose config -q

echo '[6/11] Validating Hermes safety configuration'
node hermes/validate.mjs

echo '[7/11] Testing Hermes approval and safety policy'
node hermes/policy-test.mjs

echo '[8/11] Checking repository hygiene, secret safety, and cost policy'
tracked_sensitive="$(git ls-files | grep -Ei '(^|/)(\.env($|\.)|.*\.(pem|key|p12|pfx|jks)$|id_rsa$|id_ed25519$|credentials[^/]*\.json$|service-account[^/]*\.json$|\.npmrc$|secrets(/|$))' | grep -vE '(^|/)\.env\.example$' || true)"
if [[ -n "$tracked_sensitive" ]]; then
  echo 'Tracked sensitive-looking files detected:' >&2
  echo "$tracked_sensitive" >&2
  exit 1
fi
secret_signature_files="$(git grep -IlE '(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|tvly-[A-Za-z0-9_-]{10,}|fc-[A-Za-z0-9_-]{8,}|hf_[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY)' HEAD -- ':!package-lock.json' 2>/dev/null | sort -u || true)"
if [[ -n "$secret_signature_files" ]]; then
  echo 'Possible committed secret signatures detected in:' >&2
  echo "$secret_signature_files" >&2
  exit 1
fi
policy_violation="$(grep -RInE 'paidFallback[[:space:]]*[:=][[:space:]]*true|freeOnly[[:space:]]*[:=][[:space:]]*false' app provider-registry.json || true)"
if [[ -n "$policy_violation" ]]; then
  echo 'Free-only policy violation detected:' >&2
  echo "$policy_violation" >&2
  exit 1
fi

echo '[9/11] Validating provider credential references'
python3 - <<'PY'
import json,re
with open('provider-registry.json',encoding='utf-8') as f: data=json.load(f)
if not isinstance(data,list): raise SystemExit('provider-registry.json must be a list')
env_name=re.compile(r'^[A-Z][A-Z0-9_]{2,79}$')
for i,item in enumerate(data):
    if not isinstance(item,dict): raise SystemExit(f'provider registry entry {i} must be an object')
    cv=item.get('credentialVariable')
    if cv is not None and not env_name.fullmatch(str(cv)): raise SystemExit(f'provider registry entry {i} has unsafe credentialVariable')
    for k,v in item.items():
        if k.lower() in {'apikey','api_key','token','secret','password','credential'} and str(v or '').strip():
            raise SystemExit(f'provider registry entry {i} contains literal credential field {k}')
print('provider credential references: ok')
PY

echo '[10/11] Checking whitespace'
git diff --check

echo '[11/11] Validating competitive differentiators'
node scripts/competitive-check.mjs

echo 'release-check: ok'
