import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getCleanedDataDir } from '@/lib/data-dir'

export async function GET() {
  try {
    const dataDir = getCleanedDataDir()
    const files = await readdir(dataDir)
    const albumFile = files
      .filter(f => f.startsWith('cleaned-albums-') && f.endsWith('.json') && !f.includes('with-songs'))
      .sort()
      .pop()
    
    if (!albumFile) {
      return NextResponse.json({ error: 'Album data not found' }, { status: 404 })
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

