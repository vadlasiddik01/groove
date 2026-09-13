#!/usr/bin/env bash
set -euo pipefail

COUNT="${1:-100}"
URL="${API_URL:-http://localhost:30080/orders}"

for i in $(seq 1 "$COUNT"); do
  curl -sS -X POST "$URL" \
    -H 'content-type: application/json' \
    -d "{\"product\":\"SKU-$((i % 10))\",\"quantity\":1}" >/dev/null &
done

wait
echo "Queued $COUNT orders."
