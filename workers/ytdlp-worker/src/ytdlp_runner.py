"""yt-dlp helper utilities.

Contains a thin wrapper around yt-dlp to extract audio to a requested
format and helpers to infer a reasonable MIME type from the file
extension. The output file is written to a provided temporary directory
(`/tmp` by default) for subsequent upload to object storage.
"""

import os
from typing import Tuple

from yt_dlp import YoutubeDL
import shutil
import tempfile


def _mime_for_ext(ext: str) -> str:
    """Map a common audio file extension to a MIME type.

    This function intentionally prefers widely supported types for
    web playback (e.g., `audio/ogg`, `audio/mpeg`). Unknown extensions
    fall back to `application/octet-stream`.
    """
    e = (ext or "").lower()
    if e in ("opus", "ogg"):
        return "audio/ogg"
    if e in ("m4a", "mp4"):
        return "audio/mp4"
    if e in ("mp3",):
        return "audio/mpeg"
    if e in ("webm",):
        return "audio/webm"
    return "application/octet-stream"


def download_audio(
    source_url: str,
    tmp_dir: str = "/tmp",
    audio_format: str = "m4a",
) -> Tuple[str, str, str]:
    """Download and extract audio from `source_url` using yt-dlp.

    Parameters
    - source_url: Public URL supported by yt-dlp (YouTube, etc.).
    - tmp_dir: Directory to place the downloaded/extracted file (default /tmp).
    - audio_format: Preferred output codec/container (e.g., opus, m4a, mp3).

    Behavior
    - Uses bestaudio/best format, disables playlists, and extracts audio via
      FFmpeg to the requested `audio_format` when possible.
    - The output filename is based on yt-dlp’s `id` field to simplify lookup.

    Returns
    - Tuple `(file_path, content_type, basename)` where `content_type` is a
      best-effort MIME inferred from file extension.

    Raises
    - FileNotFoundError if yt-dlp succeeds but an output file cannot be found.
    - Any exceptions raised by yt-dlp for invalid/unsupported URLs.
    """
    os.makedirs(tmp_dir, exist_ok=True)
    outtmpl = os.path.join(tmp_dir, "%(id)s.%(ext)s")

    # Env-driven knobs for tricky situations (optional in dev)
    # Prefer iOS/TV/web clients which often avoid 403 on opus/webm
    client_env = os.environ.get("YTDLP_YT_CLIENTS", "ios,tv,web")
    player_clients = [c.strip() for c in client_env.split(",") if c.strip()]
    cookies_file = os.environ.get("YTDLP_COOKIES_FILE") or os.environ.get("COOKIES_FILE")
    proxy_url = os.environ.get("PROXY_URL")
    user_agent = os.environ.get("YTDLP_USER_AGENT")
    format_expr = os.environ.get("YTDLP_FORMAT_EXPR")  # Optional override
    force_ipv4 = os.environ.get("YTDLP_FORCE_IPV4") in ("1", "true", "TRUE", "True")

    # Prefer audio-only, single item
    ydl_opts = {
        "outtmpl": outtmpl,
        # Favor m4a first (format 140) since it works more reliably than opus 251 on some clients
        "format": format_expr or "bestaudio[ext=m4a]/140/bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "restrictfilenames": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": audio_format,
                "preferredquality": "0",
            }
        ],
        "extractor_args": {"youtube": {"player_client": player_clients}},
    }
    if cookies_file and os.path.exists(cookies_file):
        # Copy to a writable temp file so yt-dlp can update cookies if needed
        tmp_cookie = os.path.join(tempfile.gettempdir(), f"yt_cookies_{os.getpid()}.txt")
        try:
            shutil.copyfile(cookies_file, tmp_cookie)
            ydl_opts["cookiefile"] = tmp_cookie
        except Exception:
            # Fall back to original path if copy fails
            ydl_opts["cookiefile"] = cookies_file
    if proxy_url:
        ydl_opts["proxy"] = proxy_url
    if user_agent:
        # Prefer http_headers to force UA consistently
        ydl_opts["http_headers"] = {"User-Agent": user_agent}
    if force_ipv4:
        # Force IPv4 by using an IPv4-only source address
        ydl_opts["source_address"] = "0.0.0.0"

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(source_url, download=True)

    base_id = info.get("id")
    candidates = [
        os.path.join(tmp_dir, f"{base_id}.{audio_format}"),
        os.path.join(tmp_dir, f"{base_id}.m4a"),
        os.path.join(tmp_dir, f"{base_id}.mp3"),
        os.path.join(tmp_dir, f"{base_id}.webm"),
        os.path.join(tmp_dir, f"{base_id}.ogg"),
    ]
    file_path = next((p for p in candidates if os.path.exists(p)), None)
    if not file_path:
        # Fallback: enumerate tmp_dir
        for name in os.listdir(tmp_dir):
            if name.startswith(base_id + "."):
                file_path = os.path.join(tmp_dir, name)
                break
    if not file_path or not os.path.exists(file_path):
        raise FileNotFoundError("yt-dlp finished but output file not found")

    ext = os.path.splitext(file_path)[1].lstrip(".")
    content_type = _mime_for_ext(ext)
    return file_path, content_type, os.path.basename(file_path)
