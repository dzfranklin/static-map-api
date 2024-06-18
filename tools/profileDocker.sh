#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TAG=$(date +%Y%m%d%H%M%S%N)

docker build -t profile-static-map-api:"$TAG" --quiet .
docker run --entrypoint /app/tools/profile.ts profile-static-map-api:"$TAG"
