#!/usr/bin/env bash
set -euo pipefail

CLUSTER="northwind"
REGISTRY="northwind-registry.localhost"
REGISTRY_PORT="5111"

if k3d cluster get "$CLUSTER" >/dev/null 2>&1; then
  echo "Cluster already exists."
else
  k3d registry create "$REGISTRY" --port "$REGISTRY_PORT" || true
  k3d cluster create "$CLUSTER" \
    --servers 1 \
    --agents 2 \
    --registry-use "$REGISTRY:$REGISTRY_PORT" \
    --wait
fi

kubectl create namespace northwind --dry-run=client -o yaml | kubectl apply -f -
kubectl config use-context "k3d-$CLUSTER"

echo "Cluster ready."
kubectl get nodes
