"""Cloud Run worker: yt-dlp + ffmpeg → GCS + webhook

This FastAPI app exposes a minimal API to download audio from supported
platforms (via yt-dlp), upload the result to Google Cloud Storage (GCS),
generate a time-limited V4 signed URL, and notify the application backend
via an HMAC-signed webhook. Intended to be deployed to Cloud Run.

Key endpoints
- POST /download: starts a background job and returns immediately.
- GET  /healthz: liveness check for load balancers.

Environment variables
- GCS_BUCKET (required): target bucket name.
- GCS_SIGNED_URL_TTL_SECONDS (optional, default 7200): signed URL TTL.
- CALLBACK_SECRET (required): shared HMAC secret for webhook signing.
- OBJECT_PREFIX (optional, default "downloads"): prefix for object names.
- YTDLP_NO_UPDATE (recommended = 1): disable yt-dlp self-updates.
- XDG_CACHE_HOME (recommended): cache dir to speed up repeated downloads.
"""

import hashlib
import hmac
import json
import os
import time
from datetime import timedelta
from typing import Optional, Dict, Any
import logging

import requests
from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from google.cloud import storage

from .ytdlp_runner import download_audio
from dotenv import load_dotenv


load_dotenv()  # Load .env if present (local/dev convenience)
app = FastAPI(title="yt-dlp GCS Worker", version="0.1.0")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ytdlp-worker")


class DownloadRequest(BaseModel):
    """Request body for the download job.

    Attributes
    - jobId: Correlation ID assigned by the API layer; also used in the
      GCS object path by default.
    - sourceUrl: Public URL supported by yt-dlp (YouTube, etc.).
    - callbackUrl: Hono webhook that will receive job completion/failure.
    - objectName: Optional absolute GCS object path; when omitted, a
      deterministic path is derived from `OBJECT_PREFIX` and `jobId`.
    - contentType: Optional override for detected MIME type.
    - audioFormat: Target audio format for extraction (opus|m4a|mp3).
    """
    jobId: str = Field(..., description="Job identifier from the API layer")
    sourceUrl: HttpUrl = Field(..., description="URL to download (YouTube or supported site)")
    callbackUrl: Optional[HttpUrl] = Field(None, description="Hono webhook to call upon completion; optional when using `track=true` for polling")
    objectName: Optional[str] = Field(None, description="Optional GCS object path override")
    contentType: Optional[str] = Field(None, description="Override detected MIME type")
    audioFormat: Optional[str] = Field("opus", description="Output audio format: opus|m4a|mp3")


BUCKET = os.environ.get("GCS_BUCKET")
TTL_SECONDS = int(os.environ.get("GCS_SIGNED_URL_TTL_SECONDS", "7200"))
CALLBACK_SECRET = os.environ.get("CALLBACK_SECRET", "")
OBJECT_PREFIX = os.environ.get("OBJECT_PREFIX", "downloads")

# Ephemeral in-process job store (dev/testing only). In production, rely on
# the application backend + webhooks or an external store.
JOBS: Dict[str, Dict[str, Any]] = {}


def _hmac_signature(secret: str, body: bytes) -> str:
    """Compute a hex HMAC-SHA256 signature over the raw request body.

    Parameters
    - secret: Shared secret (bytes will be derived with UTF-8).
    - body: Raw JSON payload.

    Returns
    - Hex-encoded signature suitable for an `X-Signature` header.
    """
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _safe_object_name(object_name: str) -> str:
    """Normalize an object path to avoid leading slashes."""
    return object_name.lstrip("/")


def _upload_and_sign(local_path: str, object_name: str, content_type: str) -> dict:
    """Upload a file to GCS and return metadata with a V4 signed URL.

    Parameters
    - local_path: Path to the local file on disk.
    - object_name: Destination path within `GCS_BUCKET`.
    - content_type: MIME type to set on the blob.

    Returns
    - Dict with keys: bucket, path, url (signed), contentType, size (bytes).
    """
    client = storage.Client()
    bucket = client.bucket(BUCKET)
    blob = bucket.blob(object_name)
    blob.cache_control = "private, max-age=0"
    blob.content_type = content_type
    blob.upload_from_filename(local_path, content_type=content_type)
    url = blob.generate_signed_url(expiration=timedelta(seconds=TTL_SECONDS), method="GET", version="v4")
    size = os.path.getsize(local_path)
    return {
        "bucket": BUCKET,
        "path": object_name,
        "url": url,
        "contentType": content_type,
        "size": size,
    }


def _post_webhook(callback_url: str, job_id: str, payload: dict) -> None:
    """POST a webhook to Hono with simple retries and HMAC header.

    The JSON `payload` is serialized compactly and signed with the
    `CALLBACK_SECRET`. On transient network errors or 5xx responses,
    the call is retried with exponential backoff a few times.
    """
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Job-Id": job_id,
        "X-Signature": _hmac_signature(CALLBACK_SECRET, raw) if CALLBACK_SECRET else "",
    }
    # Simple retry
    for i in range(4):
        try:
            resp = requests.post(callback_url, data=raw, headers=headers, timeout=15)
            if resp.status_code // 100 == 2:
                logger.info("webhook ok: jobId=%s status=%s", job_id, payload.get("status"))
                return
            else:
                logger.warning(
                    "webhook non-2xx: jobId=%s http=%s body=%s",
                    job_id,
                    resp.status_code,
                    (resp.text[:512] if hasattr(resp, "text") else ""),
                )
        except requests.RequestException as exc:
            logger.warning("webhook error: jobId=%s err=%s", job_id, exc)
        time.sleep(2 ** i)


def _run_job(req: DownloadRequest, track: bool = False) -> None:
    """Execute the download→upload→callback workflow for a single request.

    Any raised exception is caught and translated into a `failed` webhook
    with an `error.message` payload; the function attempts to clean up the
    temporary file before returning.
    """
    try:
        logger.info("job start: jobId=%s url=%s", req.jobId, req.sourceUrl)
        file_path, detected_mime, basename = download_audio(str(req.sourceUrl), "/tmp", req.audioFormat or "opus")
        mime = req.contentType or detected_mime
        object_name = _safe_object_name(
            req.objectName
            or f"{OBJECT_PREFIX}/{req.jobId}/{basename}"
        )

        gcs_obj = _upload_and_sign(file_path, object_name, mime)

        if track:
            JOBS[req.jobId] = {
                "status": "completed",
                "url": gcs_obj["url"],
                "gcsObject": {
                    "bucket": gcs_obj["bucket"],
                    "path": gcs_obj["path"],
                    "contentType": gcs_obj["contentType"],
                    "size": gcs_obj["size"],
                },
            }

        payload = {
            "status": "completed",
            "url": gcs_obj["url"],
            "gcsObject": {
                "bucket": gcs_obj["bucket"],
                "path": gcs_obj["path"],
                "contentType": gcs_obj["contentType"],
                "size": gcs_obj["size"],
            },
        }
        logger.info(
            "job completed: jobId=%s gcs=%s/%s size=%s",
            req.jobId,
            gcs_obj["bucket"],
            gcs_obj["path"],
            gcs_obj["size"],
        )
        if req.callbackUrl:
            _post_webhook(str(req.callbackUrl), req.jobId, payload)
    except Exception as e:  # noqa: BLE001
        logger.exception("job failed: jobId=%s url=%s err=%s", req.jobId, req.sourceUrl, e)
        if track:
            JOBS[req.jobId] = {
                "status": "failed",
                "error": {"message": str(e)},
            }
        payload = {
            "status": "failed",
            "error": {"message": str(e)},
        }
        if req.callbackUrl:
            _post_webhook(str(req.callbackUrl), req.jobId, payload)
    finally:
        # Best-effort cleanup
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass


@app.get("/healthz")
def healthz():
    """Liveness/readiness check used by Cloud Run health probes."""
    if not BUCKET:
        logger.error("healthz: GCS_BUCKET not set")
        raise HTTPException(status_code=500, detail="GCS_BUCKET not set")
    return {"ok": True}


@app.post("/download")
def download(req: DownloadRequest, bg: BackgroundTasks, track: bool = False, wait: bool = False):
    """Start a background audio download job and return immediately.

    Returns a simple acknowledgement `{ jobId, started: true }` while the
    work continues asynchronously. Upon completion, the worker will POST to
    the provided `callbackUrl` with a `completed` or `failed` status.
    """
    if not BUCKET:
        logger.error("download: GCS_BUCKET not set")
        raise HTTPException(status_code=500, detail="GCS_BUCKET not set")
    # CALLBACK_SECRET is only required if a callbackUrl is provided.
    if track:
        JOBS[req.jobId] = {"status": "working"}
    if wait:
        _run_job(req, track=track)
        # Return whatever is in the job store if tracked, else an ack
        return JOBS.get(req.jobId, {"jobId": req.jobId, "started": True})
    bg.add_task(_run_job, req, track)
    return {"jobId": req.jobId, "started": True}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    """Return ephemeral job status for dev/testing when `track=true` was used.

    Response shape mirrors the webhook payload where possible.
    """
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="job not found or not tracked")
    return {"jobId": job_id, **JOBS[job_id]}
