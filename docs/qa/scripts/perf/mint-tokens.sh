#!/usr/bin/env bash
# Mint access tokens for a list of STAGING test numbers that map to a fixed test OTP.
# Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_OTP=... ./mint-tokens.sh phones.txt > tokens.json
# Respects GoTrue rate limits: ~1 verify per 2 s per IP. Tokens live 1 h (jwt_expiry) — mint
# right before the run, keep tokens.json out of git, delete it afterwards.
set -euo pipefail
: "${SUPABASE_URL:?}" "${SUPABASE_ANON_KEY:?}" "${TEST_OTP:?}"
echo "["; first=1
while read -r phone; do
  [ -z "$phone" ] && continue
  tok=$(curl -s -X POST "$SUPABASE_URL/auth/v1/verify" -H "apikey: $SUPABASE_ANON_KEY" \
    -H "content-type: application/json" -d "{\"type\":\"sms\",\"phone\":\"$phone\",\"token\":\"$TEST_OTP\"}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch{}})')
  [ -n "$tok" ] || { echo "mint failed for ${phone: -4}" >&2; continue; }
  [ $first -eq 1 ] || echo ","; first=0; printf '"%s"' "$tok"
  sleep 2
done < "$1"
echo "]"
