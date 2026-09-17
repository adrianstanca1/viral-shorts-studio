#!/bin/bash
# provider-verifier.sh — verify all provider API keys from .env
# Usage: source .env && bash scripts/provider-verifier.sh
# Or: bash scripts/provider-verifier.sh (reads .env.example for structure)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env if available
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  source "$REPO_DIR/.env"
  set +a
fi

echo "============================================"
echo "Viral Shorts Studio — Provider Verification"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%S+00:00)"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; }
fail() { echo -e "${RED}❌ FAIL${NC}: $1 — $2"; }
skip() { echo -e "${YELLOW}⏭ SKIP${NC}: $1 — $2"; }

# Test functions
test_tavily() {
  local key="${TAVILY_API_KEY:-${TAVILY_KEY:-}}"
  if [ -z "$key" ]; then skip "Tavily" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://api.tavily.com/search" \
    -H "Content-Type: application/json" \
    -d "{\"api_key\":\"$key\",\"query\":\"test\",\"search_depth\":\"basic\",\"max_results\":1}" 2>/dev/null) || { fail "Tavily" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'results' in d" 2>/dev/null; then
    pass "Tavily — research working"
  else
    fail "Tavily" "$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null || echo "invalid response")"
  fi
}

test_firecrawl() {
  local key="${FIRECRAWL_API_KEY:-}"
  if [ -z "$key" ]; then skip "Firecrawl" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://api.firecrawl.dev/v1/search" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $key" \
    -H "Firecrawl-Api-Key: $key" \
    -d '{"query":"test","limit":1}' 2>/dev/null) || { fail "Firecrawl" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
    pass "Firecrawl — web scraping working (api.firecrawl.dev, Firecrawl-Api-Key header)"
  else
    fail "Firecrawl" "$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null || echo "invalid response")"
  fi
}

test_brave() {
  local key="${BRAVE_API_KEY:-}"
  if [ -z "$key" ]; then skip "Brave Search" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://api.search.brave.com/res/v1/web/search" \
    -H "Content-Type: application/json" \
    -H "X-Subscription-Token: $key" \
    -d '{"q":"test","search_lang":"en","count":1}' 2>/dev/null) || { fail "Brave Search" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'web' in d" 2>/dev/null; then
    pass "Brave Search — working (X-Subscription-Token header, not Authorization)"
  else
    fail "Brave Search" "$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); errors=d.get('errors',[]); print(errors[0].get('message','unknown') if errors else 'unknown')" 2>/dev/null || echo "invalid response")"
  fi
}

test_openrouter() {
  local key="${OPENROUTER_API_KEY:-}"
  if [ -z "$key" ]; then skip "OpenRouter" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://openrouter.ai/api/v1/chat/completions" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -H "HTTP-Referer: https://cortexbuildpro.tech" \
    -H "X-Title: Viral Shorts Studio" \
    -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"OK"}],"max_tokens":5}' 2>/dev/null) || { fail "OpenRouter" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('choices') and d['choices'][0].get('message',{}).get('content')" 2>/dev/null; then
    local model
    model=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('model','?'))" 2>/dev/null)
    pass "OpenRouter — generation working (model: $model)"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('error',{}); print(f'{e.get(\"message\",\"?\")} (code: {e.get(\"code\",\"?\")})')" 2>/dev/null || echo "invalid response")
    fail "OpenRouter" "$err"
  fi
}

test_huggingface() {
  local key="${HF_TOKEN:-}"
  if [ -z "$key" ]; then skip "HuggingFace" "no key"; return; fi
  # Test auth first
  local auth_resp
  auth_resp=$(curl -s --max-time 10 -H "Authorization: Bearer $key" "https://api.huggingface.co/api/whoami-v2" 2>/dev/null) || { fail "HuggingFace" "connection error"; return; }
  if echo "$auth_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'id' in d" 2>/dev/null; then
    local user
    user=$(echo "$auth_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','?'))" 2>/dev/null)
    # Check credits
    local credits_resp
    credits_resp=$(curl -s --max-time 10 -H "Authorization: Bearer $key" "https://api.huggingface.co/api/whoami" 2>/dev/null) || true
    local has_credits="unknown"
    if echo "$credits_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('gated_secret_credentials') is not None" 2>/dev/null; then
      has_credits="yes"
    else
      has_credits="depleted/unknown"
    fi
    if [ "$has_credits" = "yes" ]; then
      pass "HuggingFace — authenticated as $user, credits available"
    else
      fail "HuggingFace" "authenticated as $user but credits depleted or unavailable"
    fi
  else
    fail "HuggingFace" "authentication failed"
  fi
}

test_nvidia() {
  local key="${NVIDIA_API_KEY:-}"
  if [ -z "$key" ]; then skip "NVIDIA" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"OK"}],"max_tokens":5}' 2>/dev/null) || { fail "NVIDIA" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('choices')" 2>/dev/null; then
    pass "NVIDIA — generation working"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown')[:100])" 2>/dev/null || echo "invalid response")
    fail "NVIDIA" "$err"
  fi
}

test_sendgrid() {
  local key="${SENDGRID_API_KEY:-}"
  if [ -z "$key" ]; then skip "SendGrid" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -H "Authorization: Bearer $key" "https://api.sendgrid.com/v3/account" 2>/dev/null) || { fail "SendGrid" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'account' in d or 'error' not in d" 2>/dev/null; then
    pass "SendGrid — authenticated"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errors',[{}])[0].get('message','?') if d.get('errors') else 'unknown')" 2>/dev/null || echo "invalid")
    fail "SendGrid" "$err"
  fi
}

test_vercel() {
  local key="${VERCEL_API_KEY:-}"
  if [ -z "$key" ]; then skip "Vercel" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -H "Authorization: Bearer $key" "https://api.vercel.com/v2/user" 2>/dev/null) || { fail "Vercel" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'user' in d or isinstance(d, list)" 2>/dev/null; then
    local account
    account=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('username','?') if isinstance(d,dict) else 'account list')" 2>/dev/null)
    pass "Vercel — authenticated as $account"
  else
    fail "Vercel" "authentication failed"
  fi
}

test_parallel() {
  local key="${PARALLEL_API_KEY:-}"
  if [ -z "$key" ]; then skip "Parallel.ai" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -H "Authorization: Bearer $key" "https://api.parallel.ai/v1/user" 2>/dev/null) || { fail "Parallel.ai" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'user' in d or 'error' not in d" 2>/dev/null; then
    pass "Parallel.ai — accessible"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?')[:100] if d.get('error') else 'unknown')" 2>/dev/null || echo "invalid")
    fail "Parallel.ai" "$err"
  fi
}

test_together() {
  local key="${TOGETHER_API_KEY:-}"
  if [ -z "$key" ]; then skip "Together AI" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://api.together.ai/v1/chat/completions" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d '{"model":"google/gemma-2-27b-it","messages":[{"role":"user","content":"OK"}],"max_tokens":5}' 2>/dev/null) || { fail "Together AI" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('choices')" 2>/dev/null; then
    pass "Together AI — generation working"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','?')[:100] if d.get('error') else 'unknown')" 2>/dev/null || echo "invalid")
    fail "Together AI" "$err"
  fi
}

test_moonshot() {
  local key="${MOONSHOT_API_KEY:-}"
  if [ -z "$key" ]; then skip "Moonshot" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://api.moonshot.ai/v1/chat/completions" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d '{"model":"moonshot-v1-128k","messages":[{"role":"user","content":"OK"}],"max_tokens":5}' 2>/dev/null) || { fail "Moonshot" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('choices')" 2>/dev/null; then
    pass "Moonshot — generation working"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','?')[:100] if d.get('error') else 'unknown')" 2>/dev/null || echo "invalid")
    fail "Moonshot" "$err"
  fi
}

test_xai() {
  local key="${XAI_API_KEY:-}"
  if [ -z "$key" ]; then skip "XAI/Grok" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://api.x.ai/v1/chat/completions" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d '{"model":"grok-2-1212","messages":[{"role":"user","content":"OK"}],"max_tokens":5}' 2>/dev/null) || { fail "XAI/Grok" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('choices')" 2>/dev/null; then
    pass "XAI/Grok — generation working"
  else
    local err
    err=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','?')[:100] if d.get('error') else 'unknown')" 2>/dev/null || echo "invalid")
    fail "XAI/Grok" "$err"
  fi
}

test_one_com() {
  local key="${ONE_COM_API_KEY:-}"
  if [ -z "$key" ]; then skip "One.com Web Shop" "no key"; return; fi
  local resp
  resp=$(curl -s --max-time 10 -X POST "https://webshop.one.com/api/v2/auth/token/validate" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null) || { fail "One.com" "connection error"; return; }
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'valid' in d" 2>/dev/null; then
    local valid
    valid=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('valid','?'))" 2>/dev/null)
    if [ "$valid" = "true" ]; then
      pass "One.com Web Shop — token valid"
    else
      fail "One.com Web Shop" "token invalid (validate: $valid)"
    fi
  else
    fail "One.com Web Shop" "token validation failed — needs clientId+clientSecret exchange"
  fi
}

# Run all tests
echo "--- Text Generation ---"
test_openrouter
test_huggingface
test_nvidia
test_together
test_moonshot
test_xai

echo ""
echo "--- Research ---"
test_tavily
test_firecrawl
test_brave

echo ""
echo "--- Publishing / Services ---"
test_sendgrid
test_vercel
test_parallel

echo ""
echo "--- One.com ---"
test_one_com

echo ""
echo "============================================"
echo "Verification complete"
echo "============================================"
