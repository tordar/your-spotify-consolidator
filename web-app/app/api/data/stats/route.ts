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

    // Find the latest detailed stats file
    const files = await listUserFiles(userId, 'cleaned-data')
    const statsFiles = files
      .filter(filename => filename.startsWith('detailed-stats-') && filename.endsWith('.json'))
      .sort((a, b) => {
        const timestampA = parseInt(a.match(/detailed-stats-(\d+)\.json/)?.[1] || '0')
        const timestampB = parseInt(b.match(/detailed-stats-(\d+)\.json/)?.[1] || '0')
        return timestampB - timestampA
      })
    
    if (statsFiles.length === 0) {
      return NextResponse.json({ error: 'Stats data not found' }, { status: 404 })
    }
    
    const latestStatsFile = statsFiles[0]
    const fileArrayBuffer = await downloadFile(userId, 'cleaned-data', latestStatsFile)
    const fileBuffer = Buffer.from(fileArrayBuffer)
    const statsData = JSON.parse(fileBuffer.toString('utf-8'))
    
    // Wrap stats in the expected structure for the frontend
    return NextResponse.json({
      stats: statsData
    })
  } catch (error) {
    console.error('Error reading stats data:', error)
    return NextResponse.json({ error: 'Failed to load stats data' }, { status: 500 })
  }
}

