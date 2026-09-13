#!/usr/bin/env bash
set -euo pipefail

echo "Edit charts/northwind/values.yaml:"
echo "  worker:"
echo "    chaos:"
echo "      memoryLeak: true"
echo
echo "Then commit and push:"
echo "git add charts/northwind/values.yaml"
echo "git commit -m 'chaos: enable worker memory leak'"
echo "git push"
