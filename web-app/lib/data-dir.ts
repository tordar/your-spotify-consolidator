import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Base directory for app data (cleaned-data and merged-streaming-history).
 * - Set DATA_DIR in Docker (e.g. /data) to point at a mounted volume.
 * - Unset: resolves relative to cwd (Vercel/local: ../data or data from repo root).
 */
function getDataBaseDir(): string {
  const envDir = process.env.DATA_DIR?.trim()
  if (envDir) return envDir
  const fromWebApp = join(process.cwd(), '..', 'data')
  const fromRepoRoot = join(process.cwd(), 'data')
  if (existsSync(fromWebApp)) return fromWebApp
  if (existsSync(fromRepoRoot)) return fromRepoRoot
  return fromWebApp
}

export function getCleanedDataDir(): string {
  return join(getDataBaseDir(), 'cleaned-data')
}

export function getMergedHistoryDir(): string {
  return join(getDataBaseDir(), 'merged-streaming-history')
}
