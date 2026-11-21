#!/usr/bin/env bash
# C3: App credential such as server key never reaches the browser.
set -u
fail() { echo "C3 BREAK: $1"; exit 1; }
# 1. No secret is exposed through a NEXT_PUBLIC_ name.
hit=$(grep -rnE "NEXT_PUBLIC_[A-Z_]*(SERVER|SECRET|PASSWORD|POSTGRES|SIGNATURE)" app lib .env.example 2>/dev/null)
[ -z "$hit" ] || fail "a secret uses a NEXT_PUBLIC_ name: $hit"
# 2. Server secrets are read only in modules marked server-only.
for f in $(grep -rlE "MIDTRANS_SERVER_KEY|POSTGRES_URL|MIDTRANS_SIGNATURE_SECRET_KEY" app lib --include=*.ts --include=*.tsx); do
  grep -q '^import "server-only";' "$f" || fail "$f reads a server secret but does not import server-only"
done
# 3. No client component imports a server module (type-only imports are erased and allowed).
for f in $(grep -rl '^"use client"' app lib --include=*.ts --include=*.tsx); do
  bad=$(grep -nE "from \"@/lib/(midtrans|db|orders/(settle|store|create))\"" "$f" | grep -v "import type")
  [ -z "$bad" ] || fail "client component $f imports a server module"
done
# 4. If a production build exists, its browser bundles hold no server key.
if [ -d .next/static ]; then
  grep -rlqE "Mid-server-[A-Za-z0-9_-]{6,}" .next/static 2>/dev/null && fail "a Midtrans server key is in .next/static"
  if [ -n "${MIDTRANS_SERVER_KEY:-}" ]; then grep -rlqF "$MIDTRANS_SERVER_KEY" .next/static 2>/dev/null && fail "MIDTRANS_SERVER_KEY value is in .next/static"; fi
fi
exit 0
