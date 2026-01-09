import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    const dataDir = join(process.cwd(), '../data/cleaned-data')
    const files = await readdir(dataDir)
    const genresFile = files
      .filter(f => f.startsWith('all-artists-genres-') && f.endsWith('.json'))
      .sort()
      .pop()
    
    if (!genresFile) {
      return NextResponse.json({ error: 'Genres data not found' }, { status: 404 })
    }
    
    const filePath = join(dataDir, genresFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading genres data:', error)
    return NextResponse.json({ error: 'Failed to load genres data' }, { status: 500 })
  }
}

