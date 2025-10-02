#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
BUCKET_NAME="${BUCKET_NAME:-}"
FUNC_NAME="${FUNC_NAME:-download_youtube}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required (export PROJECT_ID=<your-project>)" >&2
  exit 1
fi

if [[ -z "${BUCKET_NAME}" ]]; then
  echo "BUCKET_NAME is required (export BUCKET_NAME=your-bucket)" >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com

gcloud functions deploy "${FUNC_NAME}" \
  --gen2 \
  --runtime python312 \
  --region "${REGION}" \
  --source . \
  --entry-point download \
  --trigger-http \
  --allow-unauthenticated \
  --timeout 3600 \
  --memory 1024Mi \
  --set-env-vars "BUCKET_NAME=${BUCKET_NAME}"

echo "Function URL:"
gcloud functions describe "${FUNC_NAME}" --region "${REGION}" --format='value(serviceConfig.uri)'

