"""Quick local test for yt-dlp extraction (module form).

Run from workers/ytdlp-worker directory:
  python -m src.test_ytdlp --url "https://www.youtube.com/watch?v=..." --format m4a

Respects env vars:
  YTDLP_COOKIES_FILE, YTDLP_USER_AGENT, PROXY_URL
"""

import argparse
from pathlib import Path

from ytdlp_runner import download_audio


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="YouTube (or supported) URL")
    parser.add_argument("--format", default="m4a", help="Audio format: m4a|opus|mp3|webm")
    args = parser.parse_args()

    file_path, content_type, basename = download_audio(args.url, "/tmp", args.format)
    size = Path(file_path).stat().st_size
    print("OK")
    print(f"file={file_path}")
    print(f"mime={content_type}")
    print(f"name={basename}")
    print(f"size={size}")


if __name__ == "__main__":
    main()
