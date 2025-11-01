FROM apify/actor-node:20

USER root
RUN set -eux; \
    apk add --no-cache ffmpeg ca-certificates curl bash python3; \
    update-ca-certificates; \
    # Add BOTH edge/main and edge/community, tagged as @edge for pinning
    echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories; \
    echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories; \
    apk update; \
    # Pull simdutf and deno from edge to satisfy libsimdutf.so.27
    apk add --no-cache simdutf@edge deno@edge; \
    deno --version; \
    # yt-dlp: use official Python zipapp (no pip → no PEP 668 issues)
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp; \
    chmod a+rx /usr/local/bin/yt-dlp; \
    yt-dlp --version; \
    ffmpeg -version

USER myuser
COPY --chown=myuser:myuser package.json package-lock.json* ./
RUN npm ci --omit=dev || true
COPY --chown=myuser:myuser main.js ./
CMD ["node", "main.js"]

