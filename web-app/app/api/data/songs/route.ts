import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listUserFiles, downloadFile } from '@/lib/storage'

export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Find the latest cleaned songs file
    const files = await listUserFiles(userId, 'cleaned-data')
    const songFiles = files
      .filter(filename => filename.startsWith('cleaned-songs-') && filename.endsWith('.json'))
      .sort((a, b) => {
        const timestampA = parseInt(a.match(/cleaned-songs-(\d+)\.json/)?.[1] || '0')
        const timestampB = parseInt(b.match(/cleaned-songs-(\d+)\.json/)?.[1] || '0')
        return timestampB - timestampA
      })
    
    if (songFiles.length === 0) {
      return NextResponse.json({ error: 'Song data not found' }, { status: 404 })
    }
    
    const latestSongFile = songFiles[0]
    const fileArrayBuffer = await downloadFile(userId, 'cleaned-data', latestSongFile)
    const fileBuffer = Buffer.from(fileArrayBuffer)
    const data = JSON.parse(fileBuffer.toString('utf-8'))
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading song data:', error)
    return NextResponse.json({ error: 'Failed to load song data' }, { status: 500 })
  }
}

