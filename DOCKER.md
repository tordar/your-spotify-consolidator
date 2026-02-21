# Running with Docker

## Prerequisites

- Docker and Docker Compose
- A populated `data/` directory with:
  - `data/cleaned-data/` (output of `generate-cleaned-files` + `add-podcast-data`)
  - `data/merged-streaming-history/` (output of `merge-streaming-history`)

If you don’t have these yet, run the scripts locally once (or use GitHub Actions), then use the same `data/` folder with Docker.

## Quick start

1. **Create a `.env` file** in the repo root (same variables as Vercel/local):

   ```env
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REFRESH_TOKEN=...
   UPLOAD_SECRET=...
   GITHUB_TOKEN=...
   GITHUB_REPO_OWNER=...
   GITHUB_REPO_NAME=...
   ```

2. **Build and run:**

   ```bash
   docker compose up --build
   ```

3. Open **http://localhost:3000**.

## How it works

- **`web`** – Next.js app. **`DATA_DIR`** is set to `/data`; it reads `cleaned-data` and `merged-streaming-history` from the mounted `./data` volume.
- **`sync`** – Runs the same pipeline as GitHub Actions (fetch recent plays → merge → generate cleaned files → add podcast data) **every 2 hours**. It uses the same `./data` mount, so updated files are visible to the web app immediately. Requires **`.env`** with `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN`.
- Upload in Settings still pushes files to GitHub. You can turn off GitHub Actions if you rely on the Docker sync instead.

## Build / run individual services

```bash
# Web only
docker compose up --build web

# Sync only (e.g. for a one-off run)
docker compose run --rm sync ./docker-sync.sh
```

## Build only (no compose)

```bash
docker build -t spotify-pulse-web .
docker run -p 3000:3000 -v "$(pwd)/data:/data" --env-file .env spotify-pulse-web
```
