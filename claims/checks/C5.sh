#!/usr/bin/env bash
# C5: Use /integrate-midtrans-payments skills to integrate with Midtrans for payments.
# WEAK CHECK: a check cannot see which skill an agent used. It tests that the skill's integration rules hold in the code.
set -u
fail() { echo "C5 BREAK: $1"; exit 1; }
f=lib/midtrans.ts
[ -f $f ] || fail "$f missing"
others=$(grep -rlE "api(\.sandbox)?\.midtrans\.com|/snap/v1/transactions" app lib --include=*.ts --include=*.tsx | grep -v "^$f$")
[ -z "$others" ] || fail "Midtrans API called outside $f: $others"
grep -qF "credit_card: { secure: true }" $f || fail "3DS (credit_card.secure) not enforced"
grep -qF '/v2/${encodeURIComponent(orderId)}/status' $f || fail "no server-side status check"
grep -qF "timingSafeEqual" $f || fail "signature not compared in constant time"
grep -qF "getStatus(order.id)" lib/orders/settle.ts || fail "settle does not check status server-side"
exit 0
