# Production image for the slidekit HTTP service.
# NOTE: /render executes code in uploaded decks — run this isolated and behind
# auth (set SLIDEKIT_API_KEYS). See SECURITY.md.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4030

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# App sources (themes, fonts, docs, src, server entry, vite config).
COPY . .

EXPOSE 4030
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4030)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
