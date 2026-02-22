import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getCleanedDataDir } from '@/lib/data-dir'

export async function GET() {
  try {
    const dataDir = getCleanedDataDir()
    const files = await readdir(dataDir)
    const variationsFile = files
      .filter((f) => f.startsWith('album-variations-by-artist-') && f.endsWith('.json'))
      .sort()
      .pop()

    if (!variationsFile) {
      return NextResponse.json(
        { error: 'Album variations data not found. Run merge and generate cleaned files first.' },
        { status: 404 }
      )
    }

    const filePath = join(dataDir, variationsFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading album variations:', error)
    return NextResponse.json(
      { error: 'Failed to load album variations' },
      { status: 500 }
    )
  }
}
