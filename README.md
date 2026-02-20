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

## Installation

1. Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/spotify-pulse.git
cd spotify-pulse
```

2. Install dependencies:

```bash
npm install
cd web-app && npm install && cd ..
```

3. Set up Spotify API credentials (needed for automatic syncing, metadata enrichment, and Now Playing):

   - Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Get `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
   - Set up a redirect URI and obtain a refresh token (see `scripts/setup-spotify-auth.ts`)
   - Add to `.env` in the project root:

   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   SPOTIFY_REFRESH_TOKEN=your_refresh_token
   ```

## Usage

### Step 1: Add Your Spotify History Data

Put your extracted `Streaming_History_Audio_*.json` files into `data/spotify-history/`:

```
data/
  spotify-history/
    Streaming_History_Audio_2009-2013_0.json
    Streaming_History_Audio_2013-2014_1.json
    ...
```

### Step 2: Merge Streaming History

Merge all streaming history files into one:

```bash
npm run merge-streaming-history
```

This reads all `Streaming_History_Audio_*.json` from `data/spotify-history/`, consolidates by song (play counts and listening time), and writes to `data/merged-streaming-history/merged-streaming-history-{timestamp}.json`.

### Step 3: Generate Cleaned Files

Generate cleaned data for the web app:

```bash
npm run generate-cleaned-files
```

This loads the merged history, builds cleaned songs/albums/artists and albums-with-songs, computes stats (yearly listening, top items, hourly distribution, country data), enriches with Spotify API metadata when configured, and saves to `data/cleaned-data/`.

### Step 4: (Optional) Add Podcast Data to Stats

If you have podcast streaming history in your export, add podcast hours into the detailed stats:

```bash
npm run add-podcast-data
```

This updates `detailed-stats-*.json` in `data/cleaned-data/` with podcast listening time per year. The dashboard shows music vs podcast in the yearly chart.

### Step 5: View Your Statistics

**Local development**

```bash
npm run web:dev
```

Open [http://localhost:3000](http://localhost:3000).

**Production build**

```bash
npm run web:build
npm run web:start
```

**Deploy to Vercel**

1. Push to GitHub and import the repo in [Vercel](https://vercel.com).
2. Configure environment variables (Spotify, optional GitHub token for Settings).
3. The app will be available at your Vercel URL.

### Step 6: Set Up Automatic Syncing (Optional)

The GitHub Action runs every 2 hours and can fetch recent plays, merge data, regenerate cleaned files, add podcast data, commit and push. Vercel redeploys automatically when the repo is updated.

1. **GitHub Secrets** (Settings → Secrets and variables → Actions):

   | Secret | Description |
   |--------|-------------|
   | `SPOTIFY_CLIENT_ID` | Spotify app Client ID |
   | `SPOTIFY_CLIENT_SECRET` | Spotify app Client Secret |
   | `SPOTIFY_REFRESH_TOKEN` | From `npm run setup-spotify-auth` |
   | `PERSONAL_ACCESS_TOKEN` | GitHub PAT with `repo` |

2. Enable Actions in the **Actions** tab.

**What runs automatically**

- Every 2 hours: check for new tracks, fetch recent plays, merge with existing history, run `generate-cleaned-files`, run `add-podcast-data`, commit and push. Vercel redeploys when the repo is updated.

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
│   └── merge-streaming-history.yml
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
| `GITHUB_TOKEN` | GitHub token (e.g. Actions token or PAT) | No (for Settings sync status) | Web app (sync-status) |
| `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` | Repo for workflow API calls | No (or use Vercel’s `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG`) | Web app (sync-status) |

For GitHub Actions, set Spotify credentials as **repository secrets**. Without Spotify credentials you can still process exported history; automatic sync and metadata enrichment will not work.

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
