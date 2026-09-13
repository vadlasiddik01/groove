#!/usr/bin/env bash
set -euo pipefail

POD="$(kubectl -n northwind get pods -l app=worker -o jsonpath='{.items[0].metadata.name}')"

if [[ -z "$POD" ]]; then
  echo "No worker pod found."
  exit 1
fi

echo "Killing worker pod: $POD"
kubectl -n northwind delete pod "$POD"

echo
echo "Watch recovery with:"
echo "kubectl -n northwind get pods -w"
