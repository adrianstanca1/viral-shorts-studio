#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "production runtime preflight: missing $ENV_FILE" >&2
  exit 1
fi

mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"
if [[ -z "$mode" ]]; then
  echo "production runtime preflight: unable to read permissions for $ENV_FILE" >&2
  exit 1
fi

# Reject any group/world permission bits. 600 and 400 are acceptable.
perm=$((8#$mode))
if (( perm & 077 )); then
  echo "production runtime preflight: $ENV_FILE must not be group/world accessible (mode=$mode)" >&2
  exit 1
fi

python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import sys

path=Path(sys.argv[1])
values={}
for raw in path.read_text(encoding='utf-8').splitlines():
    line=raw.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key,value=line.split('=',1)
    values[key.strip()]=value.strip()

def truthy(name, default='false'):
    return values.get(name,default).strip().lower() in {'1','true','yes','on'}

def fail(msg):
    print(f'production runtime preflight: {msg}', file=sys.stderr)
    raise SystemExit(1)

public_launch=truthy('PUBLIC_LAUNCH')
secure_cookie=truthy('FORCE_SECURE_COOKIE')
auth_secret=values.get('APP_AUTH_SECRET','')
worker_token=values.get('PROVIDER_WORKER_TOKEN','')
public_url=values.get('PUBLIC_APP_URL','https://cortexbuildpro.tech').strip()

if public_launch and len(auth_secret) < 24:
    fail('PUBLIC_LAUNCH requires APP_AUTH_SECRET with at least 24 characters')
if public_launch and not secure_cookie:
    fail('PUBLIC_LAUNCH over HTTPS requires FORCE_SECURE_COOKIE=true')
if len(worker_token) < 24:
    fail('PROVIDER_WORKER_TOKEN must contain at least 24 characters')
if auth_secret and worker_token and auth_secret == worker_token:
    fail('APP_AUTH_SECRET and PROVIDER_WORKER_TOKEN must be different values')
if public_launch and not public_url.lower().startswith('https://'):
    fail('PUBLIC_APP_URL must use https:// when PUBLIC_LAUNCH is enabled')

print('production runtime preflight: ok')
print(f'  public_launch={str(public_launch).lower()}')
print(f'  secure_cookie={str(secure_cookie).lower()}')
print(f'  app_auth_secret_length={len(auth_secret)}')
print(f'  provider_worker_token_length={len(worker_token)}')
PY
