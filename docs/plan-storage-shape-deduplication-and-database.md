# Storage shape: avoid repeating image URLs (and when to use a database)

If we store `album.images` and artist metadata on **every** song, an album with 10 songs repeats the same image URLs 10 times; the same artist is repeated for every song. That inflates the file and is redundant. Three options:

---

## Option A — Single JSON file with deduplicated metadata (recommended if staying with JSON)

- Keep a **flat `songs[]`** array (each song has `songId`, `name`, `albumId`, `artistId`, `listeningEvents`, etc.) so merge and aggregation logic stay simple.
- Add **top-level lookup maps** so each album and artist is stored once:
  - `albums: { [albumId]: { id, name, images, release_date, ... } }`
  - `artists: { [artistId]: { id, name, genres, images, ... } }` (or key by stable name if no id yet)
- Each song stores only **ids** (e.g. `albumId`, `artistId`). When building API responses or aggregations, resolve `albumId` → `albums[albumId].images` etc. No repeated image URLs; file size stays much smaller (e.g. ~10k–20k unique albums, ~30k–50k unique artists instead of 58k × 2 copies of metadata).
- **Merge**: When new plays come in, for each new song/album/artist ensure an entry exists in `albums` / `artists` (create if missing); append or update the song in `songs` and add events. **Enrichment**: Update `albums[id]` and `artists[id]` with Spotify metadata; songs already reference those ids.
- **Pros**: One file, one place, minimal change to current flow (merge still appends to a list; you add a step that builds/updates the id maps). **Cons**: Still a single large JSON (parse once, cache aggregates).

---

## Option B — Restructure by artist → albums → songs

- Top-level structure becomes e.g. `artists: [ { id, name, genres, images, albums: [ { id, name, images, songs: [ { songId, listeningEvents } ] } ] } ]`. New artist = append to `artists`.
- **Downsides**: (1) JSON is not append-friendly — "append new artist at end" still requires reading the whole file, parsing, appending, and rewriting. (2) Merge logic is more complex (find or create artist, find or create album, find or create song, append events; deep updates). (3) APIs and aggregation must walk a tree instead of a flat list. (4) Deduplication is better (each album/artist once) but you pay with more complex code and full-file rewrites anyway.
- **Verdict**: Not clearly better than Option A. Option A gives the same deduplication with a simpler, flatter structure and smaller code changes.

---

## Option C — Use a real database

- **Schema**: Normalized tables — e.g. `artists` (id, name, genres, image_url, ...), `albums` (id, name, artist_id, images_json, ...), `songs` (id, name, album_id, ...), `listening_events` (id, song_id, played_at, ms_played, conn_country). No duplication; each album/artist row once.
- **Merge**: Insert new `listening_events`; insert or ignore new `songs` / `albums` / `artists` as needed. **Enrichment**: `UPDATE artists SET ...`, `UPDATE albums SET ...` for missing metadata. **APIs**: SQL (or ORM) queries; no giant JSON parse; can index by year, artist, etc. for fast aggregations.
- **Pros**: Scales well, no redundant data, efficient updates and queries, no "parse 80 MB on cold start". **Cons**: Migration effort — merge script, enrichment script, and every API route must switch from "read JSON file" to "query DB". You also need a hosted DB (e.g. Vercel Postgres, Neon, Supabase, or SQLite in repo/Vercel Blob if you want to stay file-like).
- **When it's worth it**: If you expect the history to keep growing (many more years, or multiple users later), or you want faster/cheaper API responses without a big in-memory cache, or you're already comfortable running a DB — **now is a reasonable time** to introduce one. You'd do it instead of (or as a follow-up to) the "single enriched JSON" approach: one-time migration from current merged JSON into the DB, then merge + enrichment + APIs all use the DB.

---

## Recommendation

- **Short term**: Use **Option A** (single JSON with `songs` + `albums` + `artists` maps). You avoid repeating image URLs, keep one file, and limit code changes to adding the maps and resolving ids when merging, enriching, and building API responses.
- **Later**, if the file or complexity grows: migrate to **Option C** (database). You can export the same structure (songs + albums + artists) into tables and then point merge, enrichment, and APIs at the DB.
