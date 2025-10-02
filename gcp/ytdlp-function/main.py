import os
import re
import uuid
import time
import mimetypes
import datetime

import yt_dlp
from google.cloud import storage
import functions_framework
from flask import Request, jsonify


TMP_DIR = "/tmp/ytdl"
os.makedirs(TMP_DIR, exist_ok=True)


def _sanitize(s: str, default: str = "file") -> str:
    return re.sub(r"[^A-Za-z0-9 _.-]", "", (s or "")).strip() or default


def _format(audio_only: bool = True) -> str:
    # Avoid post-processing (no ffmpeg) by preferring native audio formats
    if audio_only:
        return "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"
    return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"


@functions_framework.http
def download(request: Request):
    started = time.time()
    try:
        body = request.get_json(silent=True) or {}
        url = (body.get("url") or body.get("youtubeUrl") or "").strip()
        if not url:
            return jsonify({"ok": False, "error": "Missing 'url'"}), 400

        audio_only = not bool(body.get("video") or body.get("preferVideo"))
        folder = _sanitize(body.get("folder") or "youtube")
        filename = _sanitize(body.get("filename") or "")

        bucket_name = os.environ.get("BUCKET_NAME")
        if not bucket_name:
            return jsonify({"ok": False, "error": "BUCKET_NAME env not set"}), 500

        outtmpl = f"{TMP_DIR}/%(id)s.%(ext)s"
        ydl_opts = {
            "outtmpl": outtmpl,
            "format": _format(audio_only),
            "quiet": True,
            "nocheckcertificate": True,
            "noplaylist": True,
            "retries": 3,
            "fragment_retries": 3,
            "skip_unavailable_fragments": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            file_path = ydl.prepare_filename(info)

        vid_id = info.get("id") or uuid.uuid4().hex[:8]
        title = info.get("title") or vid_id
        ext = os.path.splitext(file_path)[1].lstrip(".") or "bin"
        safe_title = _sanitize(title)
        object_name = _sanitize(filename or f"{safe_title}-{vid_id}.{ext}")
        object_path = f"{folder}/{vid_id}/{object_name}"

        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(object_path)

        ctype = mimetypes.guess_type(file_path)[0]
        if not ctype and ext == "m4a":
            ctype = "audio/mp4"
        if not ctype and ext == "webm":
            ctype = "audio/webm"
        ctype = ctype or "application/octet-stream"

        blob.upload_from_filename(file_path, content_type=ctype)

        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(hours=24),
            method="GET",
        )

        return jsonify({
            "ok": True,
            "bucket": bucket_name,
            "objectPath": object_path,
            "gsUri": f"gs://{bucket_name}/{object_path}",
            "signedUrl": signed_url,
            "video": {
                "id": vid_id,
                "title": title,
                "ext": ext,
                "duration": info.get("duration"),
                "webpage_url": info.get("webpage_url"),
            },
            "elapsedMs": int((time.time() - started) * 1000),
        })
    except yt_dlp.utils.DownloadError as de:
        return jsonify({"ok": False, "error": f"yt-dlp error: {str(de)}"}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

