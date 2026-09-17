#!/bin/bash
# provider-verifier.sh — verify all providers and update registry
# Run: bash scripts/provider-verifier.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "=== Viral Shorts Studio — Provider Verification ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%S+00:00)"
echo ""

# Helper: test an API key
test_key() {
  local name="$1"
  local url="$2"
  local header="$3"
  local body="$4"
  local method="${5:-POST}"
  
  case "$method" in
    GET)
      response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "$header" "$url" 2>/dev/null || echo "000")
      ;;
    POST)
      response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST -H "$header" -H "Content-Type: application/json" \
        -d "$body" "$url" 2>/dev/null || echo "000")
      ;;
  esac
  
  if [ "$response" = "200" ]; then
    echo "  ✅ $name: OK (HTTP $response)"
    return 0
  else
    echo "  ❌ $name: FAIL (HTTP $response)"
    return 1
  fi
}

# Test each provider
echo "--- Text Generation ---"
test_key "OpenRouter" \
  "https://openrouter.ai/api/v1/chat/completions" \
  "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"OK"}],"max_tokens":5}'

test_key "HuggingFace (auth)" \
  "https://api.huggingface.co/api/whoami" \
  "Authorization: Bearer ${HF_TOKEN}" \
  "" "GET"

test_key "NVIDIA (auth)" \
  "https://integrate.api.nvidia.com/v1/chat/completions" \
  "Authorization: Bearer ${NVIDIA_API_KEY}" \
  '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"OK"}],"max_tokens":5}'

echo ""
echo "--- Research ---"
test_key "Tavily" \
  "https://api.tavily.com/search" \
  "Content-Type: application/json" \
  "{\"api_key\":\"${TAVILY_API_KEY}\",\"query\":\"test\",\"search_depth\":\"basic\",\"max_results\":1}"

test_key "Firecrawl" \
  "https://api.firecrawl.dev/v1/search" \
  "Authorization: Bearer ${FIRECRAWL_API_KEY}" \
  '{"query":"test","limit":1}'

test_key "Brave Search" \
  "https://api.search.brave.com/res/v1/web/search" \
  "X-Subscription-Token: ${BRAVE_API_KEY}" \
  '{"q":"test","search_lang":"en","count":1}'

echo ""
echo "--- Publishing ---"
test_key "SendGrid (auth)" \
  "https://api.sendgrid.com/v3/segments" \
  "Authorization: Bearer ${SENDGRID_API_KEY}" \
  "" "GET"

test_key "Vercel (auth)" \
  "https://api.vercel.com/v2/user" \
  "Authorization: Bearer ${VERCEL_API_KEY}" \
  "" "GET"

echo ""
echo "=== Verification Complete ==="
