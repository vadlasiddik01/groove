#!/usr/bin/env bash
set -euo pipefail
kubectl apply -f gitops/argocd/application.yaml
echo "Application object created. Watch:"
echo "kubectl -n argocd get applications"
