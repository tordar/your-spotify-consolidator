import { supabase, supabaseAdmin } from './supabase'

/**
 * Supabase Storage utilities for user file uploads
 * 
 * Files are organized by user ID in buckets:
 * - user-files/{userId}/raw-history/
 * - user-files/{userId}/merged-history/
 * - user-files/{userId}/cleaned-data/
 */

const BUCKET_NAME = 'user-files'

/**
 * Get the storage path for a user's file
 */
export function getUserFilePath(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data',
  filename: string
): string {
  return `${userId}/${category}/${filename}`
}

/**
 * Upload a file to Supabase Storage
 * @param userId - User ID
 * @param category - File category (raw-history, merged-history, cleaned-data)
 * @param filename - Name of the file
 * @param fileContent - File content as Buffer or Blob
 * @param contentType - MIME type (default: application/json)
 * @returns Public URL of the uploaded file
 */
export async function uploadFile(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data',
  filename: string,
  fileContent: Buffer | Blob | ArrayBuffer,
  contentType: string = 'application/json'
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured')
  }

  const filePath = getUserFilePath(userId, category, filename)

  try {
    // Convert ArrayBuffer to Buffer if needed
    let buffer: Buffer
    if (fileContent instanceof Buffer) {
      buffer = fileContent
    } else if (fileContent instanceof Blob) {
      const arrayBuffer = await fileContent.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else if (fileContent instanceof ArrayBuffer) {
      buffer = Buffer.from(fileContent)
    } else {
      // For Uint8Array or similar
      buffer = Buffer.from(new Uint8Array(fileContent))
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType,
        upsert: true, // Overwrite if exists
      })

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`)
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return urlData.publicUrl
  } catch (error) {
    console.error(`Failed to upload ${filePath}:`, error)
    throw error
  }
}

/**
 * Download a file from Supabase Storage
 * @param userId - User ID
 * @param category - File category
 * @param filename - Name of the file
 * @returns File content as ArrayBuffer
 */
export async function downloadFile(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data',
  filename: string
): Promise<ArrayBuffer> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured')
  }

  const filePath = getUserFilePath(userId, category, filename)

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(filePath)

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`)
  }

  return await data.arrayBuffer()
}

/**
 * List all files for a user in a specific category
 * @param userId - User ID
 * @param category - File category
 * @returns Array of file names
 */
export async function listUserFiles(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data'
): Promise<string[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured')
  }

  const folderPath = `${userId}/${category}/`

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .list(folderPath)

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`)
  }

  return data.map((file) => file.name)
}

/**
 * Delete a file from Supabase Storage
 * @param userId - User ID
 * @param category - File category
 * @param filename - Name of the file
 */
export async function deleteFile(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data',
  filename: string
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured')
  }

  const filePath = getUserFilePath(userId, category, filename)

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([filePath])

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`)
  }
}

/**
 * Delete all files for a user in a specific category
 * @param userId - User ID
 * @param category - File category
 */
export async function deleteUserCategoryFiles(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data'
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured')
  }

  const folderPath = `${userId}/${category}/`

  // List all files in the category
  const files = await listUserFiles(userId, category)

  if (files.length === 0) {
    return
  }

  // Delete all files
  const filePaths = files.map((filename) => getUserFilePath(userId, category, filename))

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove(filePaths)

  if (error) {
    throw new Error(`Failed to delete files: ${error.message}`)
  }
}

/**
 * Get public URL for a file (without downloading)
 * @param userId - User ID
 * @param category - File category
 * @param filename - Name of the file
 * @returns Public URL
 */
export function getFileUrl(
  userId: string,
  category: 'raw-history' | 'merged-history' | 'cleaned-data',
  filename: string
): string {
  if (!supabase) {
    throw new Error('Supabase client not configured')
  }

  const filePath = getUserFilePath(userId, category, filename)

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath)

  return data.publicUrl
}

