#!/usr/bin/env bash
# Thin wrapper around the manifest-driven JSON/BSON extractor.
set -euo pipefail
cd "$(dirname "$0")"
exec python3 extract-mod.py extract "$@"
