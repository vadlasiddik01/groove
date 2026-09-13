#!/usr/bin/env bash
set -euo pipefail

: "${GITEA_USER:?Set GITEA_USER}"
: "${GITEA_PASSWORD:?Set GITEA_PASSWORD}"

REPO_URL="http://host.k3d.internal:3000/${GITEA_USER}/northwind-logistics.git"

kubectl -n argocd create secret generic northwind-git \
  --from-literal=type=git \
  --from-literal=url="$REPO_URL" \
  --from-literal=username="$GITEA_USER" \
  --from-literal=password="$GITEA_PASSWORD" \
  --dry-run=client -o yaml |
  kubectl label --local -f - argocd.argoproj.io/secret-type=repository -o yaml |
  kubectl apply -f -

sed -i "s|CHANGE_ME|${GITEA_USER}|g" gitops/argocd/application.yaml
kubectl apply -f gitops/argocd/application.yaml
echo "Argo CD repository configured for $REPO_URL"
