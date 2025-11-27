'use client'

import { useState, useRef } from 'react'
import { signOut } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SpotifyStatsLayout from '@/components/SpotifyStatsLayout'
import { Upload, FileJson, X, CheckCircle2, AlertCircle, LogOut } from 'lucide-react'

interface UploadFile {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

export default function ProfilePage() {
  // Upload state
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // File upload handlers
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newFiles: UploadFile[] = Array.from(files)
      .filter(file => {
        // Only accept JSON files that start with "Streaming_History"
        return file.name.endsWith('.json') && file.name.startsWith('Streaming_History')
      })
      .map(file => ({
        file,
        status: 'pending' as const,
        progress: 0,
      }))

    // Add files that don't match the pattern with error status
    const invalidFiles: UploadFile[] = Array.from(files)
      .filter(file => {
        const isValid = file.name.endsWith('.json') && file.name.startsWith('Streaming_History')
        return !isValid
      })
      .map(file => ({
        file,
        status: 'error' as const,
        progress: 0,
        error: file.name.endsWith('.json') 
          ? 'Filename must start with "Streaming_History"'
          : 'Only JSON files are allowed',
      }))

    setUploadFiles(prev => [...prev, ...newFiles, ...invalidFiles])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadFile = async (uploadFile: UploadFile) => {
    // Validate filename before uploading
    if (!uploadFile.file.name.startsWith('Streaming_History')) {
      setUploadFiles(prev =>
        prev.map(f =>
          f.file === uploadFile.file
            ? { ...f, status: 'error', error: 'Filename must start with "Streaming_History"' }
            : f
        )
      )
      return
    }

    const formData = new FormData()
    formData.append('file', uploadFile.file)
    formData.append('category', 'raw-history') // Always raw-history for manual uploads

    // Update status to uploading
    setUploadFiles(prev =>
      prev.map(f =>
        f.file === uploadFile.file
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      )
    )

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      // Update status to success
      setUploadFiles(prev =>
        prev.map(f =>
          f.file === uploadFile.file
            ? { ...f, status: 'success', progress: 100 }
            : f
        )
      )

      // Refresh stats after successful upload
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error: any) {
      // Update status to error
      setUploadFiles(prev =>
        prev.map(f =>
          f.file === uploadFile.file
            ? { ...f, status: 'error', error: error.message }
            : f
        )
      )
    }
  }

  const removeFile = (file: File) => {
    setUploadFiles(prev => prev.filter(f => f.file !== file))
  }

  const startUploads = () => {
    uploadFiles
      .filter(f => f.status === 'pending')
      .forEach(uploadFile)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <SpotifyStatsLayout
      title="Profile"
      description="Manage your Spotify history files and account settings"
      currentPage="profile"
    >
      <div className="flex justify-end mb-6">
        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </Button>
      </div>

      {/* File Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload Spotify History Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm font-medium mb-2">
              Drag and drop Spotify history files here, or click to select
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Files must be JSON and start with "Streaming_History"
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Select Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* File List */}
          {uploadFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">
                  {uploadFiles.filter(f => f.status === 'pending').length} file(s) ready to upload
                </p>
                {uploadFiles.some(f => f.status === 'pending') && (
                  <Button onClick={startUploads} size="sm">
                    Upload All
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {uploadFiles.map((uploadFile, index) => (
                  <div
                    key={`${uploadFile.file.name}-${index}`}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <FileJson className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{uploadFile.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(uploadFile.file.size)}
                      </p>
                      {uploadFile.status === 'uploading' && (
                        <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${uploadFile.progress}%` }}
                          />
                        </div>
                      )}
                      {uploadFile.status === 'error' && uploadFile.error && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {uploadFile.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadFile.status === 'success' && (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      )}
                      {uploadFile.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadFile.file)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </SpotifyStatsLayout>
  )
}

