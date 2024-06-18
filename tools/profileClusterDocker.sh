#!/usr/bin/env bash
set -euo pipefail

renderCount=${1:-10}

cd "$(dirname "$0")/.."

# shellcheck disable=SC2002
eval "$(
  cat .env.local | awk '!/^\s*#/' | awk '!/^\s*$/' | while IFS='' read -r line; do
    key=$(echo "$line" | cut -d '=' -f 1)
    value=$(echo "$line" | cut -d '=' -f 2-)
    echo "export $key=\"$value\""
  done
)"

VSN=$(date +%Y%m%d%H%M%S%N)
TAG=ghcr.io/dzfranklin/profile-static-map-api:$VSN
docker build -t "$TAG" --platform="${PLATFORM:-arm64}" --push .

kubectl create namespace profile-static-map-api-"$VSN"

kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: results
  namespace: profile-static-map-api-$VSN
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 2Gi
EOF

kubectl run profile-static-map-api \
  --image="$TAG" \
  --namespace=profile-static-map-api-"$VSN" \
  --rm=false \
  --attach \
  --pod-running-timeout=5m \
  --overrides='{
    "spec": {
      "restartPolicy": "Never",
      "containers": [
        {
          "name": "profile-static-map-api",
          "image": "'"$TAG"'",
          "command": ["/app/tools/profile.ts", "'"$renderCount"'"],
          "env": [
            { "name": "LOG_LEVEL", "value": "'"${LOG_LEVEL:-info}"'"},
            { "name": "MAPBOX_ACCESS_TOKEN", "value": "'"$MAPBOX_ACCESS_TOKEN"'"}
          ],
          "volumeMounts": [
            {
              "name": "results",
              "mountPath": "/app/build"
            }
          ]
        }
      ],
      "volumes": [
        {
          "name": "results",
          "persistentVolumeClaim": {
            "claimName": "results"
          }
        }
      ]
    }
  }'

echo "Copying results to /tmp/profile-static-map-api-$VSN"

kubectl run results --image=bash \
  --overrides='{
    "spec": {
      "restartPolicy": "Never",
      "containers": [
        {
          "name": "results",
          "image": "bash",
          "command": ["sleep", "infinity"],
          "volumeMounts": [
            {
              "name": "results",
              "mountPath": "/results"
            }
          ]
        }
      ],
      "volumes": [
        {
          "name": "results",
          "persistentVolumeClaim": {
            "claimName": "results"
          }
        }
      ]
    }
  }' \
  --namespace=profile-static-map-api-"$VSN" \
  --rm=false \
  -- sleep infinity

kubectl wait --namespace=profile-static-map-api-"$VSN" --for=condition=Ready pod/results
kubectl cp --namespace=profile-static-map-api-"$VSN" results:results /tmp/profile-static-map-api-"$VSN"

open /tmp/profile-static-map-api-"$VSN"/profile

kubectl delete namespace profile-static-map-api-"$VSN"
