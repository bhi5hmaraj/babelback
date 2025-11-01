# yt-audio-basic (Apify Actor)

Minimal Apify Actor that downloads YouTube audio with yt-dlp and exposes the file via the run’s Key‑Value Store.

Inputs
- `youtubeUrl` (string, required)
- `audioFormat` (m4a|mp3, default m4a)
- `cookiesTxt` (string, Netscape cookies.txt, optional)
- `useProxy` (boolean, default false)
- `proxyGroups` (array, default ["RESIDENTIAL"]) – requires Apify Proxy
- `apifyProxyCountry` (string, default "IN") – 2-letter ISO code, e.g., IN, US, GB
- `formatExpr` (string, default `bestaudio[ext=m4a]/140/234/bestaudio`)

Output
- Saves the audio file to the default Key‑Value Store with key `audio`.
- Pushes a dataset item: `{ status, contentType, size, key, downloadUrl }`.

Direct‑to‑GCS (recommended)
- Provide `uploadUrl` (a V4 signed PUT minted by your backend) and the Actor will upload directly to GCS.
- Optionally set `callbackUrl` (+ `callbackSecret`) and the Actor will POST `{ jobId, status, bytes, contentType }` when done.
- If `uploadUrl` is absent or fails, the Actor falls back to saving in KVS (key `audio`).

Build and run locally
```bash
apify login
cd actors/yt-audio-basic
apify push   # builds/pushes the actor

# Run with cookies (recommended when YouTube challenges)
apify run -i '{
  "youtubeUrl": "https://www.youtube.com/watch?v=IdveDKCYtI8",
  "audioFormat": "m4a",
  "cookiesTxt": "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t...",
  "useProxy": false
}'
```

Notes
- Cookies must be in Netscape format and include both `.google.com` and `.youtube.com` entries when YouTube requires login/anti‑bot verification.
- `m4a` (AAC) is the recommended default for browser playback. Use `mp3` only if you need legacy compatibility.
- If `yt-dlp` fails due to recent YouTube changes, change the Dockerfile to install from HEAD temporarily:
  - Replace `pip3 install yt-dlp` with
    `pip3 install "yt-dlp @ https://github.com/yt-dlp/yt-dlp/archive/refs/heads/master.zip"`

Example run with Apify Residential proxy and direct GCS upload
```bash
apify call yt-audio-basic -i '{
  "youtubeUrl": "https://www.youtube.com/watch?v=IdveDKCYtI8",
  "audioFormat": "m4a",
  "formatExpr": "bestaudio[ext=m4a]/140/234/bestaudio",
  "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"], "apifyProxyCountry": "IN" },
  "uploadUrl": "<signed-GCS-PUT-URL>",
  "callbackUrl": "https://your.api/app/api/downloads/<jobId>/callback",
  "callbackSecret": "<hmac-secret>",
  "jobId": "<jobId>"
}'
```

Production
- Wire this actor into your existing job flow: your API starts a run via Apify API and polls or uses Apify webhooks; on success, read `downloadUrl` or the KVS item `audio`.
- If you want GCS uploads instead of storing in Apify KVS, extend `main.js` to upload and return the GCS URL.
