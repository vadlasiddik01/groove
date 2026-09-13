#!/usr/bin/env bash
set -euo pipefail
k3d cluster delete northwind || true
docker compose -f gitea-compose.yml down -v || true
