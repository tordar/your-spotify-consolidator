# Spotify Pulse

Your Spotify listening: historic, current, and daily. Process and visualize your complete listening history, see what you’re playing now, and keep insights up to date with continuous syncing. Transform exported Spotify data (and optional recent plays) into statistics and a modern web dashboard.

## Features

- **Complete history processing** – Process your entire Spotify listening history from exported data
- **Smart consolidation** – Automatically consolidates duplicate songs, albums, and artists
- **Statistics dashboard** – Yearly listening trends (music + podcast), hourly distribution, total listening time, country breakdown
- **Daily listening heatmap** – Calendar heatmap of listening by day with drill-down into top artists/albums per day
- **Top Songs, Albums, Artists** – Browse with search and filtering; grid/list views
- **Albums with details** – Explore albums with track-by-track breakdowns
- **Genres** – Network graph of genre co-occurrence and top artists per genre
- **Now Playing (Mini Player)** – Live playback state from your Spotify account (when authorized)
- **Settings** – Recently played preview, sync status (last GitHub Actions run)
- **Rich metadata** – Album art, artist images, and genres via Spotify API (with MusicBrainz fallback for genres)
- **Automatic syncing** – GitHub Actions fetches recent plays every 2 hours and regenerates data
- **Podcast awareness** – Podcast listening is merged into stats and shown separately in yearly charts (via `add-podcast-data`)

## Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn
- Your Spotify Extended Streaming History data (see [Getting Your Data](#getting-your-spotify-data))

## Getting Your Spotify Data

1. Go to [Spotify's Privacy Settings](https://www.spotify.com/account/privacy/)
2. Scroll to **Download your data**
3. Click **Request data** and select **Extended streaming history**
4. Wait for Spotify to prepare your data (can take a few days)
5. Download the ZIP, extract it, and locate files named `Streaming_History_Audio_*.json`

## Setup (5 steps)

Follow this order to run your own instance with minimal friction: request data, fork and deploy, then add secrets and upload your history in the app.

### Step 1: Request your data from Spotify

You already have this from [Getting Your Data](#getting-your-spotify-data): request **Extended streaming history**, wait for the email, download the ZIP, and extract the `Streaming_History_Audio_*.json` files. You will upload them in Step 5.

### Step 2: Fork the repo and deploy to Vercel

1. [Fork the repository](https://github.com/tordar/spotify-pulse/fork) (or clone if you prefer: `git clone https://github.com/YOUR_USERNAME/spotify-pulse.git`).
2. In [Vercel](https://vercel.com), **Add New Project** and import your forked GitHub repo.
3. Deploy. The app will be live but without data until you complete the steps below.
4. In Vercel (Project → Settings → Environment Variables), add **SPOTIFY_OAUTH_STATE_SECRET** with any random string (e.g. run `openssl rand -hex 32`). This is required for the “Authorize with Spotify” button in Settings (step 3). Redeploy if the app was already live.

For local development instead:

```bash
cd spotify-pulse
npm install
cd web-app && npm install && cd ..
npm run web:dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (use 127.0.0.1 so the Spotify redirect URI matches).

### Step 3: Set up your Spotify Developer application

1. Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Note **Client ID** and **Client Secret**. In your Spotify app, go to **Settings** → **Redirect URIs** and add the exact URL(s) you will use:
   - **Production:** your live app URL, e.g. `https://your-app.vercel.app/callback` or `https://pulse.example.com/callback`
   - **Local dev:** `http://127.0.0.1:3000/callback` (use **127.0.0.1**, not localhost—Spotify often rejects localhost)
3. Get a refresh token: open your deployed app → **Settings**, enter Client ID and Client Secret in the Spotify section, then click **Authorize with Spotify**. You’ll be sent to Spotify to authorize, then back to the app to copy the refresh token. Add that token plus Client ID and Client Secret in the next step.
4. (Optional) If you prefer not to set SPOTIFY_OAUTH_STATE_SECRET (step 2), get a refresh token locally: run `npm run setup-spotify-auth` in the project root (add redirect URI `http://127.0.0.1:3847/callback` in your Spotify app) and use the printed values.

### Step 4: Add secrets and enable GitHub Actions

Add the same credentials in two places: **GitHub** (for Actions) and **Vercel** (for the live app and in-app upload).

**GitHub** (repo → Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `SPOTIFY_CLIENT_ID` | Spotify app Client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app Client Secret |
| `SPOTIFY_REFRESH_TOKEN` | From in-app Settings (Authorize with Spotify) or `npm run setup-spotify-auth` |
| `PERSONAL_ACCESS_TOKEN` | GitHub PAT with `repo` (for workflows to push) |

**Vercel** (Project → Settings → Environment Variables):

- **Required:** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` (Now Playing, recently played).
- **Required for Settings and upload:** `GITHUB_TOKEN` (same PAT with `repo` or `contents: write`) and `UPLOAD_SECRET` (a secret only you know; you enter it in the Settings upload form to authorize uploads). Repo owner/name are read from Vercel’s connection to your repo; you don’t need to set them.

Then enable **Actions** in the repo’s **Actions** tab. Workflows are already in the repo; they run on push to `data/spotify-history/` (merge + generate), on a schedule (sync recent plays every 2 hours), and **Sync upstream** (manual only) to pull the latest code from the original repo.

### Step 5: Upload your data in the app

1. Open your deployed app and go to **Settings**.
2. Use **Upload streaming history** to select or drag your `Streaming_History_Audio_*.json` files. They are uploaded to your repo at `data/spotify-history/`.
3. The **Merge Streaming History** workflow runs automatically on that push: it merges files, runs `generate-cleaned-files` and `add-podcast-data`, then commits merged and cleaned data. Vercel redeploys and your dashboard will show your stats.

Alternatively, you can add the files manually: put `Streaming_History_Audio_*.json` into `data/spotify-history/` in your repo and push; the same workflow will run.

### Staying up to date with upstream

Your fork will get ahead (sync commits with your data) and behind (new features in the original repo). To pull in updates while keeping your data:

1. **One-time:** Add the original repo as `upstream`:
   ```bash
   git remote add upstream https://github.com/tordar/spotify-pulse.git
   ```
2. **When you want new features:** Fetch and merge upstream, then push to your fork:
   ```bash
   git fetch upstream
   git merge upstream/master
   git push origin master
   ```
   (Or use `git pull upstream master` instead of fetch + merge.)

Your **data is safe**: the upstream repo does not contain `data/merged-streaming-history/` or `data/cleaned-data/`, so merging only adds or updates code. If you get merge conflicts, they will be in code (e.g. `package.json`, workflows, app files); resolve them locally and push.

You can also run the **Sync upstream** workflow from the Actions tab (manual trigger) to pull the latest code from upstream and push to your fork; if the merge has conflicts, the workflow fails and you resolve locally.

---

## Usage (local or reference)

If you develop locally or want to run scripts yourself:

**Merge streaming history** (after adding files to `data/spotify-history/`):

```bash
npm run merge-streaming-history
```

**Generate cleaned files:**

```bash
npm run generate-cleaned-files
```

**Add podcast data to stats:**

```bash
npm run add-podcast-data
```

**What runs automatically (GitHub Actions)**

- On push to `data/spotify-history/`: **Merge Streaming History** runs merge → generate-cleaned-files → add-podcast-data and commits.
- Every 2 hours: **Spotify Data Sync** fetches recent plays, merges, regenerates cleaned data, commits and push. Vercel redeploys when the repo is updated.

## Web App Overview

| Page | Description |
|------|-------------|
| **Stats** | Yearly listening (music + podcast), hourly distribution, country listening, daily listening heatmap, yearly top songs/artists/albums |
| **Top Songs** | Searchable list with play counts and metadata |
| **Top Albums** | Searchable albums with play counts |
| **Top Artists** | Searchable artists with play counts |
| **Genres** | Genre co-occurrence network and top artists per genre |
| **Settings** | Recently played, last sync status |

The app also includes a **Mini Player** (when playback state is available) that shows the current track and progress.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run merge-streaming-history` | Merge all `Streaming_History_Audio_*.json` into one file |
| `npm run generate-cleaned-files` | Generate cleaned songs, albums, artists, albums-with-songs, detailed stats, and all-artists-genres |
| `npm run add-podcast-data` | Add podcast listening time into detailed stats |
| `npm run setup-spotify-auth` | Obtain Spotify refresh token for API access |
| `npm run fetch-recent-plays` | Check for new plays and fetch recent plays from Spotify API (exits without fetching if none) |
| `npm run merge-recent-data` | Merge recent plays into merged streaming history |
| `npm run web:dev` | Start Next.js dev server |
| `npm run web:build` | Build Next.js for production |
| `npm run web:start` | Start Next.js production server |

## Project Structure

```
spotify-pulse/
├── data/
│   ├── spotify-history/          # Your Streaming_History_Audio_*.json files
│   ├── merged-streaming-history/ # Merged history (single file per run)
│   └── cleaned-data/             # Generated files for the web app
├── scripts/
│   ├── merge-streaming-history.ts
│   ├── merge-recent-data.ts
│   ├── fetch-recent-plays.ts
│   ├── add-podcast-data-to-stats.ts
│   ├── setup-spotify-auth.ts
│   ├── spotify-token-manager.ts
│   └── cleaner/
│       ├── generate-cleaned-files-from-history.ts
│       └── utils/
├── web-app/                      # Next.js app
│   ├── app/
│   │   ├── page.tsx              # Stats dashboard
│   │   ├── top-songs/
│   │   ├── top-albums/
│   │   ├── top-artists/
│   │   ├── genres/
│   │   ├── settings/
│   │   └── api/
│   │       ├── data/             # stats, songs, albums, artists, albums-with-songs, genres, daily-listening
│   │       ├── spotify/         # recently-played, playback-state
│   │       └── sync-status/
│   └── components/               # MiniPlayer, PlaybackContext, Heatmap, SpotifyStatsLayout, etc.
├── .github/workflows/
│   ├── sync-spotify.yml          # Scheduled + manual sync
│   ├── merge-streaming-history.yml
│   └── sync-upstream.yml         # Pull latest code from upstream (manual)
└── README.md
```

## Data Files Generated

After `generate-cleaned-files`, `data/cleaned-data/` contains:

| File | Description |
|------|-------------|
| `cleaned-songs-{timestamp}.json` | Top songs with play counts and metadata |
| `cleaned-albums-{timestamp}.json` | Top albums with play counts |
| `cleaned-artists-{timestamp}.json` | Top artists with play counts |
| `cleaned-albums-with-songs-{timestamp}.json` | Top albums with track-level breakdowns |
| `detailed-stats-{timestamp}.json` | Yearly trends, hourly distribution, country data, yearly top items |
| `all-artists-genres-{timestamp}.json` | Artists with genres (for Genres page) |

After `add-podcast-data`, `detailed-stats-*.json` also includes podcast listening time per year.

## Configuration

### Environment Variables

| Variable | Description | Required | Used by |
|----------|-------------|----------|---------|
| `SPOTIFY_CLIENT_ID` | Spotify app Client ID | Yes (for sync / metadata / Now Playing) | Scripts, web app API, GitHub Actions |
| `SPOTIFY_CLIENT_SECRET` | Spotify app Client Secret | Yes (for sync / metadata) | Scripts, GitHub Actions |
| `SPOTIFY_REFRESH_TOKEN` | Spotify refresh token | Yes (for sync / metadata) | Scripts, GitHub Actions |
| `SPOTIFY_OAUTH_STATE_SECRET` | Random secret used to encrypt the temporary Spotify OAuth cookie (e.g. `openssl rand -hex 32`) | Only for in-app “Authorize with Spotify” in Settings | Web app (spotify-auth start + callback) |
| `GITHUB_TOKEN` | GitHub PAT with `repo` or `contents: write` | Yes (for Settings sync status and in-app upload) | Web app (sync-status, upload-history) |
| `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` | Repo owner and name | No (Vercel sets these when you connect the repo) | Web app (sync-status, upload-history) |
| `UPLOAD_SECRET` | Secret you enter in Settings to authorize uploads (only you should know it) | Yes (for in-app upload) | Web app (upload-history) |

For **GitHub Actions**, set Spotify credentials and `PERSONAL_ACCESS_TOKEN` as **repository secrets**. For the **Vercel** app, set the same Spotify vars plus `GITHUB_TOKEN` and `UPLOAD_SECRET` so the Settings page and in-app upload work. To use the in-app “Authorize with Spotify” form, add **SPOTIFY_OAUTH_STATE_SECRET** in Vercel first (any random string); then you can get the refresh token in Settings. Without it, use `npm run setup-spotify-auth` locally to get the token. Without Spotify credentials you can still process exported history; automatic sync and metadata enrichment will not work.

## Troubleshooting

**"No Streaming_History_Audio_*.json files found"**

- Extract the Spotify data ZIP and place all `Streaming_History_Audio_*.json` files in `data/spotify-history/`.
- Names must start with `Streaming_History_Audio_` and end with `.json`.

**Web app shows "No data available"**

- Run `npm run generate-cleaned-files` first.
- Ensure `data/cleaned-data/` exists and contains the generated JSON files.
- If the app runs from `web-app/`, API routes resolve `data/` from the repo root (parent of `web-app/`).

**Metadata or genres missing**

- Confirm Spotify credentials in `.env`. Run `npm run setup-spotify-auth` to refresh the refresh token.
- The pipeline uses MusicBrainz as a fallback for artist genres when Spotify has few or none.

**Now Playing / Mini Player not working**

- Playback state requires the same Spotify app and refresh token; the web app calls the Spotify Web API for current playback. Check `/api/spotify/playback-state` and that the user has played something recently with that account.

**GitHub Actions not syncing**

- Ensure repository secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `PERSONAL_ACCESS_TOKEN`.
- In the Actions tab, check the latest workflow run logs.
- Re-run `npm run setup-spotify-auth` if the refresh token may have been revoked.

## License

MIT
