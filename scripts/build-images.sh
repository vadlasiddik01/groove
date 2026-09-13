#!/usr/bin/env bash
set -euo pipefail

REGISTRY="k3d-northwind-registry.localhost:5111"

docker build -t "$REGISTRY/northwind-api:dev" services/api
docker build -t "$REGISTRY/northwind-worker:dev" services/worker
docker build -t "$REGISTRY/northwind-remediation:dev" services/remediation

docker push "$REGISTRY/northwind-api:dev"
docker push "$REGISTRY/northwind-worker:dev"
docker push "$REGISTRY/northwind-remediation:dev"

echo "Images pushed."
