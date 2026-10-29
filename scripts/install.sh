#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Bible-App
npm ci --cache /tmp/word-within-npm
node scripts/verify-data.mjs
npm run build
