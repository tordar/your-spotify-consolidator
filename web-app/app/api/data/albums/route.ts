import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

const MASTER_ALBUM_LIST_PREFIX = 'master-album-list'

export async function GET() {
  try {
    const dataDir = join(process.cwd(), '..', 'data', 'cleaned-data')
    const files = await readdir(dataDir)
    const albumFile = files
      .filter((f) => f.startsWith(MASTER_ALBUM_LIST_PREFIX) && f.endsWith('.json'))
      .sort()
      .pop()

    if (!albumFile) {
      return NextResponse.json({ error: 'Master album list not found' }, { status: 404 })
    }

    const filePath = join(dataDir, albumFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading album data:', error)
    return NextResponse.json({ error: 'Failed to load album data' }, { status: 500 })
  }
}

