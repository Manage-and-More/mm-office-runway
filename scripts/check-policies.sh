#!/usr/bin/env bash
# Checks the auth and data policies in supabase/migrations against a running LOCAL stack (`npx supabase start`).
# Uses the local service-role key only to create throwaway users; the policies are exercised with
# ordinary user JWTs and the anon key. Never point this at production.
set -euo pipefail
cd "$(dirname "$0")/.."

status=$(npx -y supabase@latest status -o json 2>/dev/null)
json() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(d'"$1"')'; }
API=$(echo "$status" | json '["API_URL"]')
ANON=$(echo "$status" | json '["ANON_KEY"]')
SERVICE=$(echo "$status" | json '["SERVICE_ROLE_KEY"]')
DOMAIN=manageandmore.de
PASS='local-test-password-123'

fail=0
check() { # check <label> <expected-substring> <actual>
  if [[ "$3" == *"$2"* ]]; then echo "✓ $1"; else echo "✗ $1 — expected '$2', got: $3"; fail=1; fi
}

# Admin API: create (or re-create) a confirmed user. Prints the HTTP body.
admin_create() {
  curl -s -X POST "$API/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$PASS\",\"email_confirm\":true}"
}
admin_delete_by_email() {
  local id
  id=$(curl -s "$API/auth/v1/admin/users?per_page=1000" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    | python3 -c "import json,sys; print(next((u['id'] for u in json.load(sys.stdin)['users'] if u['email']=='$1'), ''))")
  [[ -n "$id" ]] && curl -s -o /dev/null -X DELETE "$API/auth/v1/admin/users/$id" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
  true
}
token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | json '["access_token"]'
}
rest() { # rest <token> <method> <path> [json-body]
  curl -s -X "$2" "$API/rest/v1/$3" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H "Content-Type: application/json" \
    -H "Prefer: return=representation" ${4:+-d "$4"}
}

# Throwaway accounts, never the seeded ones (those must survive for people testing by hand).
EDITOR="policy-editor@$DOMAIN"; ADMIN="policy-admin@$DOMAIN"; OUTSIDER="outsider@gmail.com"
for u in "$EDITOR" "$ADMIN" "$OUTSIDER"; do admin_delete_by_email "$u"; done
psql_local() { docker exec -i "supabase_db_$(basename "$PWD")" psql -U postgres -d postgres -Atc "$1"; }
psql_local "insert into public.admins (email, added_by) values ('$ADMIN', 'check-policies') on conflict do nothing" >/dev/null

echo "— anonymous (public viewers)"
check "anon cannot read admins" "42501" "$(rest "$ANON" GET 'admins?select=*')"
check "anon cannot read domains" "42501" "$(rest "$ANON" GET 'allowed_email_domains?select=*')"
check "anon reads public_runway" '"monthly_cost"' "$(rest "$ANON" GET 'public_runway?select=funds,monthly_cost')"
check "anon reads public_avatars" '"consent"' "$(rest "$ANON" GET 'public_avatars?select=spec')"
for t in payments monthly_costs opening_balances avatars; do
  check "anon cannot read $t" "42501" "$(rest "$ANON" GET "$t?select=*")"
done
check "public_runway has no per-person fields" "" "$(rest "$ANON" GET 'public_runway?select=*' | grep -o payer_name || true)"

echo "— sign-up domain guard"
check "outsider@gmail.com is rejected" "limited to Manage and More" "$(admin_create "$OUTSIDER")"
check "$EDITOR is accepted" "\"email\":\"$EDITOR\"" "$(admin_create "$EDITOR")"
admin_create "$ADMIN" >/dev/null

T_EDITOR=$(token "$EDITOR"); T_ADMIN=$(token "$ADMIN")

echo "— editor (any signed-in MM account)"
check "sees who the admins are" "$ADMIN" "$(rest "$T_EDITOR" GET 'admins?select=email')"
check "cannot make themself admin" "42501" "$(rest "$T_EDITOR" POST admins "{\"email\":\"$EDITOR\"}")"
check "cannot remove an admin" "[]" "$(rest "$T_EDITOR" DELETE "admins?email=eq.$ADMIN")"
check "reads payments" '"payer_name"' "$(rest "$T_EDITOR" GET 'payments?select=payer_name&limit=1')"
check "adds a payment, created_by set" "\"created_by\":\"$EDITOR\"" "$(rest "$T_EDITOR" POST payments '{"amount":123.45,"payer_name":"Policy Check","kind":"donation"}')"
check "cannot add a negative payment" "check" "$(rest "$T_EDITOR" POST payments '{"amount":-5}')"
spec_for() { rest "$ANON" GET 'public_avatars?select=spec&limit=1' | python3 -c 'import json,sys; s=json.load(sys.stdin)[0]["spec"]; s["id"]=sys.argv[1]; print(json.dumps({"id":sys.argv[1],"spec":s,"owner_email":sys.argv[2]}))' "$1" "$2"; }
check "stores their own Mii" '"policy-check"' "$(rest "$T_EDITOR" POST avatars "$(spec_for policy-check "$EDITOR")")"
check "cannot store a second Mii" "duplicate key" "$(rest "$T_EDITOR" POST avatars "$(spec_for policy-check-2 "$EDITOR")")"
check "cannot store a Mii for someone else" "42501" "$(rest "$T_EDITOR" POST avatars "$(spec_for policy-check-3 "someone.else@$DOMAIN")")"
check "cannot store an invalid Mii" "does not match" "$(rest "$T_EDITOR" PATCH 'avatars?id=eq.policy-check' '{"spec":{"id":"policy-check"}}')"
check "admin can remove someone's Mii" "policy-check" "$(rest "$T_ADMIN" DELETE 'avatars?id=eq.policy-check')"
check "deletes the payment" "Policy Check" "$(rest "$T_EDITOR" DELETE 'payments?payer_name=eq.Policy%20Check')"
check "anon cannot read moments" "42501" "$(rest "$ANON" GET 'moments?select=*')"
check "adds their own moment" '"policy moment"' "$(rest "$T_EDITOR" POST moments '{"owner_email":"'"$EDITOR"'","emoji":"🎓","text":"policy moment"}')"
check "cannot add a moment for someone else" "42501" "$(rest "$T_EDITOR" POST moments '{"owner_email":"someone.else@'"$DOMAIN"'","text":"nope"}')"
check "admin can delete someone's moment" "policy moment" "$(rest "$T_ADMIN" DELETE 'moments?text=eq.policy%20moment')"

echo "— admin"
check "can add an admin" "\"added_by\":\"$ADMIN\"" "$(rest "$T_ADMIN" POST admins '{"email":"New@'"$DOMAIN"'"}')"
check "email is lower-cased" "\"email\":\"new@$DOMAIN\"" "$(rest "$T_ADMIN" GET "admins?email=eq.new@$DOMAIN&select=email")"
check "can remove an admin" "new@$DOMAIN" "$(rest "$T_ADMIN" DELETE "admins?email=eq.new@$DOMAIN")"
check "cannot remove themself" "[]" "$(rest "$T_ADMIN" DELETE "admins?email=eq.$ADMIN")"
check "can read domains" "$DOMAIN" "$(rest "$T_ADMIN" GET 'allowed_email_domains?select=domain')"

for u in "$EDITOR" "$ADMIN"; do admin_delete_by_email "$u"; done
psql_local "delete from public.admins where email = '$ADMIN'" >/dev/null
[[ $fail -eq 0 ]] && echo "✓ all policy checks passed" || { echo "✗ some checks failed"; exit 1; }
