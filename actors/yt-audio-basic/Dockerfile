FROM apify/actor-node:latest

# Switch to root to install system deps on Alpine
USER root
RUN set -eux; \
  apk add --no-cache ffmpeg curl; \
  if apk add --no-cache yt-dlp 2>/dev/null; then \
    echo "yt-dlp installed from Alpine repo"; \
  else \
    echo "yt-dlp not in repo, fetching static binary"; \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; \
    chmod a+rx /usr/local/bin/yt-dlp; \
  fi; \
  yt-dlp --version; ffmpeg -version

# Switch back to non-root user
USER myuser

# Install Node deps (apify SDK already present, keep placeholder for future deps)
COPY --chown=myuser:myuser package.json package-lock.json* ./
RUN npm ci --omit=dev || true

# App code
COPY --chown=myuser:myuser main.js ./

CMD ["node", "main.js"]
