#!/bin/sh
# Runs the Spotify sync pipeline once: fetch recent plays; if new tracks, merge + generate + add-podcast.
# Expects to run from repo root with data/ mounted (and temp/ writable).

set -e

echo "[sync] Starting pipeline at $(date -Iseconds)"
npm run fetch-recent-plays

if grep -q 'HAS_NEW_TRACKS=true' temp/fetch-result.txt 2>/dev/null; then
  echo "[sync] New tracks found, merging and regenerating..."
  npm run merge-recent-data
  npm run generate-cleaned-files
  npm run add-podcast-data
  echo "[sync] Completed at $(date -Iseconds)"
else
  echo "[sync] No new tracks at $(date -Iseconds)"
fi
