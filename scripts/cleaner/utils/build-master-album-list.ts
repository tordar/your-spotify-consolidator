/**
 * Builds the master album list JSON from a deduplicated streaming history file.
 * Used by build-deduplicated-history.ts after writing the dedup file.
 * Output: data/cleaned-data/master-album-list-<timestamp>.json (timestamp matches dedup file).
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadHistory } from '../../../web-app/lib/streaming-history';
import { aggregateToAlbumsWithSongs } from '../../../web-app/lib/aggregate-albums-with-songs';

const MASTER_ALBUM_LIST_PREFIX = 'master-album-list';

/**
 * Load deduplicated history from path and aggregate to albums with songs (all albums, no limit).
 * Writes result to outputDir as master-album-list-<timestamp>.json.
 * Timestamp is extracted from the dedup filename (e.g. deduplicated-streaming-history-1770741975126.json → 1770741975126).
 *
 * @param dedupFilePath - Full path to the deduplicated history JSON file
 * @param outputDir - Directory to write the master album list (e.g. data/cleaned-data)
 * @returns Path to the written file
 */
export async function buildMasterAlbumList(
  dedupFilePath: string,
  outputDir: string
): Promise<string> {
  const resolvedDedupPath = path.isAbsolute(dedupFilePath)
    ? dedupFilePath
    : path.resolve(process.cwd(), dedupFilePath);

  const basename = path.basename(resolvedDedupPath);
  const match = basename.match(/-(\d+)\.json$/);
  const timestamp = match ? match[1] : Date.now().toString();

  console.log('📋 Building master album list from ' + basename + '...');
  const history = await loadHistory(resolvedDedupPath);
  const { albums, originalCount, consolidatedCount } = aggregateToAlbumsWithSongs(history, {
    limit: Infinity,
  });

  const totalListeningEvents = history.songs.reduce(
    (sum, s) => sum + (s.listeningEvents?.length ?? 0),
    0
  );
  const metadata = {
    sourceDeduplicatedFile: basename,
    timestamp,
    totalAlbums: albums.length,
    originalAlbumCount: originalCount,
    consolidatedAlbumCount: consolidatedCount,
    totalListeningEvents,
    generatedAt: new Date().toISOString(),
  };

  const payload = { metadata, albums };

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filename = `${MASTER_ALBUM_LIST_PREFIX}-${timestamp}.json`;
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`💾 Saved master album list: ${outputPath} (${albums.length} albums)`);
  return outputPath;
}
