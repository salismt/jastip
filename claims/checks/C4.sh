#!/usr/bin/env bash
# C4: This app should never log sensitive information such as credit card info or phone number.
# All logging goes through lib/log.ts. Its allowlist drops every other field; its tests prove card and phone fields are dropped.
set -u
direct=$(grep -rnE "console\.(log|info|warn|error|debug|trace)\(" app lib --include=*.ts --include=*.tsx | grep -v "^lib/log.ts:")
[ -z "$direct" ] || { echo "C4 BREAK: logging outside lib/log.ts: $direct"; exit 1; }
grep -qE '"(buyer_wa|wa|phone|buyer_name|masked_card|card_number|card_token|saved_token_id|signature_key|token|body|payload)"' lib/log.ts \
  && { echo "C4 BREAK: lib/log.ts allowlists a sensitive field"; exit 1; }
out=$(npx vitest run tests/unit/log.test.ts 2>&1) || { echo "C4 BREAK: log redaction tests fail"; echo "$out" | grep -E "FAIL|AssertionError" | head -5; exit 1; }
exit 0
