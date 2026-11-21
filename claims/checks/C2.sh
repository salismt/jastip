#!/usr/bin/env bash
# C2: One payment fills one slot. The same notification twice never counts twice.
# Runs the C2 unit tests (repeat, late expire/cancel, 10 concurrent copies), and checks the Postgres
# transition keeps its "only a pending row moves" guard, which the unit tests cannot reach.
set -u
out=$(NO_COLOR=1 npx vitest run tests/unit/settle.test.ts -t "C2" 2>&1) || { echo "C2 BREAK: settle C2 tests fail"; echo "$out" | grep -E "FAIL|AssertionError" | head -5; exit 1; }
echo "$out" | grep -qE "Tests +[0-9]+ passed" || { echo "C2 BREAK: no C2 tests ran"; exit 1; }
grep -qF "where id = \${id} and state = 'pending' returning id" lib/orders/store.ts \
  || { echo "C2 BREAK: Postgres transition lost its state = 'pending' guard"; exit 1; }
exit 0
