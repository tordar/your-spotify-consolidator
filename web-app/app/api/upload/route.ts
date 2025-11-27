import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadFile } from '@/lib/storage'
import { supabaseAdmin } from '@/lib/supabase'

// Generate UUID that works in Edge runtime
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * POST /api/upload
 * Upload a file to Supabase Storage
 * 
 * Body: FormData with:
 * - file: File to upload
 * - category: 'raw-history' | 'merged-history' | 'cleaned-data'
 * - filename: Optional custom filename (defaults to original filename)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const category = formData.get('category') as string | null
    const customFilename = formData.get('filename') as string | null

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!category || !['raw-history', 'merged-history', 'cleaned-data'].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be: raw-history, merged-history, or cleaned-data' },
        { status: 400 }
      )
    }

    // Use custom filename or original filename
    const filename = customFilename || file.name

    // Validate file type (should be JSON for Spotify data)
    if (!filename.endsWith('.json')) {
      return NextResponse.json(
        { error: 'Only JSON files are allowed' },
        { status: 400 }
      )
    }

    // Check file size (Supabase default limit is usually 50MB, but can be configured)
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > 50) {
      return NextResponse.json(
        { error: `File size (${fileSizeMB.toFixed(2)}MB) exceeds 50MB limit. Please check your Supabase bucket settings.` },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`📤 Uploading ${filename} (${fileSizeMB.toFixed(2)}MB) for user ${userId}`)

    // Upload to Supabase Storage
    let publicUrl: string
    try {
      publicUrl = await uploadFile(
        userId,
        category as 'raw-history' | 'merged-history' | 'cleaned-data',
        filename,
        buffer,
        file.type || 'application/json'
      )
      console.log(`✅ Successfully uploaded ${filename}`)
    } catch (uploadError: any) {
      console.error(`❌ Failed to upload ${filename}:`, uploadError)
      // Provide more specific error messages
      if (uploadError.message?.includes('size') || uploadError.message?.includes('limit')) {
        return NextResponse.json(
          { error: `File too large: ${uploadError.message}. Check Supabase bucket size limits.` },
          { status: 413 }
        )
      }
      throw uploadError
    }

    // Save file metadata to database
    if (supabaseAdmin) {
      const fileId = generateUUID()
      const storagePath = `${userId}/${category}/${filename}`

      const { error: dbError } = await supabaseAdmin
        .from('user_files')
        .upsert({
          id: fileId,
          user_id: userId,
          category,
          filename,
          storage_path: storagePath,
          file_size: buffer.length,
          content_type: file.type || 'application/json',
          metadata: {
            original_name: file.name,
            uploaded_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,category,filename',
        })

      if (dbError) {
        console.error('Error saving file metadata:', dbError)
        // Don't fail the upload if metadata save fails
      }
    }

    return NextResponse.json({
      success: true,
      filename,
      category,
      url: publicUrl,
      size: buffer.length,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/upload
 * List user's uploaded files
 * Query params:
 * - category: Optional filter by category
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

    // Build query
    let query = supabaseAdmin
      .from('user_files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (category && ['raw-history', 'merged-history', 'cleaned-data'].includes(category)) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch files: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      files: data || [],
    })
  } catch (error: any) {
    console.error('Error fetching files:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch files' },
      { status: 500 }
    )
  }
}

