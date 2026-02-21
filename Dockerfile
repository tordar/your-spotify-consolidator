# Build the Next.js web app
FROM node:20-alpine AS builder

WORKDIR /app

COPY web-app/package.json web-app/package-lock.json ./web-app/
RUN cd web-app && npm ci

COPY web-app ./web-app
# Next.js expects public/; create if missing (e.g. no static assets in repo)
RUN mkdir -p web-app/public
RUN cd web-app && npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data

# Copy built app (run from web-app so cwd is /app/web-app; DATA_DIR /data => /data/cleaned-data, /data/merged-streaming-history)
COPY --from=builder /app/web-app/.next ./web-app/.next
COPY --from=builder /app/web-app/node_modules ./web-app/node_modules
COPY --from=builder /app/web-app/package.json ./web-app/
# public may be empty; ensure it exists in builder (see above)
COPY --from=builder /app/web-app/public ./web-app/public

WORKDIR /app/web-app
EXPOSE 3000

CMD ["npm", "run", "start"]
