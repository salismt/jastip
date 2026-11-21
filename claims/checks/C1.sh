#!/usr/bin/env bash
# C1: An order is Paid only after a verified Midtrans notification and a server-side status check.
# Runs the C1 unit tests on lib/orders/settle.ts, and checks that nothing outside settle.ts (and the store it calls)
# moves an order to paid. The prototype test controls are excluded; they 404 outside PROTOTYPE_MODE.
set -u
out=$(NO_COLOR=1 npx vitest run tests/unit/settle.test.ts -t "C1" 2>&1) || { echo "C1 BREAK: settle C1 tests fail"; echo "$out" | grep -E "FAIL|AssertionError" | head -5; exit 1; }
echo "$out" | grep -qE "Tests +[0-9]+ passed" || { echo "C1 BREAK: no C1 tests ran"; exit 1; }
other=$(grep -rlE "\.transition\(|state *= *'paid'|state: *\"paid\"" app lib --include=*.ts --include=*.tsx \
  | grep -vE "^lib/orders/(settle|store)\.ts$" | grep -v "^app/api/prototype/")
[ -z "$other" ] || { echo "C1 BREAK: payment state changed outside lib/orders/settle.ts: $other"; exit 1; }
exit 0
