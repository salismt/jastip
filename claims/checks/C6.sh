#!/usr/bin/env bash
# C6: Use /prd-to-prototype skills before starting each PRD to validate what we built is correct.
# WEAK CHECK: it proves the prototype contract, red baseline and passing evidence exist for every AC; it cannot prove timing.
set -u
c=prototype/coverage-contract.json
r=prototype/evidence/scenario-results.json
[ -f "$c" ] && [ -f "$r" ] || { echo "C6 BREAK: prototype contract or evidence missing"; exit 1; }
[ -f prototype/baseline-evidence/scenario-results.json ] || { echo "C6 BREAK: no red baseline evidence"; exit 1; }
python3 - "$c" "$r" <<'PY'
import json, os, sys
c = json.load(open(sys.argv[1])); r = json.load(open(sys.argv[2]))
want = {a["id"] for a in c["acceptance"]}
passed = {x["id"] for x in r["results"] if x["status"] == "passed"}
missing = sorted(want - passed)
if r["prd_id"] != c["prd_id"] or missing:
    print("C6 BREAK: ACs without a passing prototype run:", missing or r["prd_id"]); sys.exit(1)
for x in r["results"]:
    for p in [x["recording"], *x["screenshots"]]:
        if not os.path.isfile(os.path.join("prototype", p)):
            print("C6 BREAK: evidence file missing:", p); sys.exit(1)
PY
