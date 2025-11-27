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

    // Find the latest cleaned albums file (without songs)
    const files = await listUserFiles(userId, 'cleaned-data')
    const albumFiles = files
      .filter(filename => filename.startsWith('cleaned-albums-') && filename.endsWith('.json') && !filename.includes('with-songs'))
      .sort((a, b) => {
        const timestampA = parseInt(a.match(/cleaned-albums-(\d+)\.json/)?.[1] || '0')
        const timestampB = parseInt(b.match(/cleaned-albums-(\d+)\.json/)?.[1] || '0')
        return timestampB - timestampA
      })
    
    if (albumFiles.length === 0) {
      return NextResponse.json({ error: 'Album data not found' }, { status: 404 })
    }
    
    const latestAlbumFile = albumFiles[0]
    const fileArrayBuffer = await downloadFile(userId, 'cleaned-data', latestAlbumFile)
    const fileBuffer = Buffer.from(fileArrayBuffer)
    const data = JSON.parse(fileBuffer.toString('utf-8'))
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading album data:', error)
    return NextResponse.json({ error: 'Failed to load album data' }, { status: 500 })
  }
}

