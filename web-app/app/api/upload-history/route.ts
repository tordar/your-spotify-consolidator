import { timingSafeEqual } from 'crypto'
import { gunzipSync } from 'zlib'
import { NextRequest, NextResponse } from 'next/server'

const STREAMING_HISTORY_PREFIX = 'Streaming_History_Audio_'
const STREAMING_HISTORY_SUFFIX = '.json'
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB per file
const CONTENT_PATH_PREFIX = 'data/spotify-history/'

function isValidFilename(name: string): boolean {
  return (
    name.startsWith(STREAMING_HISTORY_PREFIX) &&
    name.endsWith(STREAMING_HISTORY_SUFFIX) &&
    name.length > STREAMING_HISTORY_PREFIX.length + STREAMING_HISTORY_SUFFIX.length
  )
}

export async function POST(request: NextRequest) {
  try {
    const uploadSecretEnv = (process.env.UPLOAD_SECRET || '').trim()
    if (!uploadSecretEnv) {
      return NextResponse.json(
        {
          error:
            'Upload is not configured. Set UPLOAD_SECRET in Vercel (and in web-app/.env.local for local dev) to enable uploads.',
          code: 'UPLOAD_NOT_CONFIGURED',
        },
        { status: 501 }
      )
    }

    const providedSecret =
      request.headers.get('x-upload-secret')?.trim() ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
      ''
    const expectedBuf = Buffer.from(uploadSecretEnv, 'utf8')
    const providedBuf = Buffer.from(providedSecret, 'utf8')
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      return NextResponse.json(
        { error: 'Invalid upload secret.', code: 'UPLOAD_UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const repoOwner = (
      process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER || ''
    ).trim()
    const repoName = (
      process.env.GITHUB_REPO_NAME ||
      process.env.VERCEL_GIT_REPO_SLUG?.split('/').pop() ||
      ''
    ).trim()
    const githubToken = (process.env.GITHUB_TOKEN || '').trim()

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json(
        {
          error:
            'Upload is not configured. Set GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in Vercel to upload from the app.',
          code: 'UPLOAD_NOT_CONFIGURED',
        },
        { status: 501 }
      )
    }

    // Verify which user the token belongs to (helps debug "resource not accessible")
    let tokenUser: string | null = null
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
        },
      })
      if (userRes.ok) {
        const user = (await userRes.json()) as { login?: string }
        tokenUser = user.login ?? null
      }
    } catch {
      // ignore
    }

    const formData = await request.formData()
    const rejected: { name: string; reason: string }[] = []
    let validFiles: { name: string; contentBase64: string }[] = []

    const compressedList = formData.getAll('compressed') as string[]
    const filenameList = formData.getAll('filename') as string[]

    if (compressedList.length > 0 && compressedList.length === filenameList.length) {
      for (let i = 0; i < compressedList.length; i++) {
        const name = (filenameList[i] || '').trim()
        const compressedBase64 = compressedList[i]
        if (!name || !compressedBase64) continue
        if (!isValidFilename(name)) {
          rejected.push({
            name,
            reason: `Filename must match ${STREAMING_HISTORY_PREFIX}*.json`,
          })
          continue
        }
        try {
          const compressed = Buffer.from(compressedBase64, 'base64')
          const bytes = gunzipSync(compressed)
          if (bytes.length > MAX_FILE_SIZE_BYTES) {
            rejected.push({
              name,
              reason: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit (after decompression)`,
            })
            continue
            }
          validFiles.push({
            name,
            contentBase64: bytes.toString('base64'),
          })
        } catch {
          rejected.push({ name, reason: 'Invalid or corrupted gzip data' })
        }
      }
    } else {
      const entries = Array.from(formData.entries()).filter(
        (e): e is [string, File] => e[1] instanceof File
      ) as [string, File][]
      const rawFiles = entries.map(([, file]) => file).filter((f) => f.name && f.size > 0)

      if (rawFiles.length === 0) {
        return NextResponse.json(
          { error: 'No files provided.', uploaded: [], rejected: [] },
          { status: 400 }
        )
      }

      for (const file of rawFiles) {
        if (!isValidFilename(file.name)) {
          rejected.push({
            name: file.name,
            reason: `Filename must match ${STREAMING_HISTORY_PREFIX}*.json`,
          })
          continue
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          rejected.push({
            name: file.name,
            reason: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`,
          })
          continue
        }
        const bytes = await file.arrayBuffer()
        validFiles.push({
          name: file.name,
          contentBase64: Buffer.from(bytes).toString('base64'),
        })
      }
    }

    if (validFiles.length === 0 && rejected.length === 0) {
      return NextResponse.json(
        { error: 'No files provided.', uploaded: [], rejected: [] },
        { status: 400 }
      )
    }

    if (validFiles.length === 0) {
      return NextResponse.json({
        uploaded: [],
        rejected,
        message: 'No valid files to upload.',
      })
    }

    const apiBase = `https://api.github.com/repos/${repoOwner}/${repoName}`
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
    }

    let branch = 'master'
    try {
      const repoRes = await fetch(`${apiBase}`, { headers })
      if (repoRes.ok) {
        const repo = (await repoRes.json()) as { default_branch?: string }
        if (repo.default_branch) branch = repo.default_branch
      }
    } catch {
      // keep master
    }

    const refRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers })
    if (!refRes.ok) {
      const err = (await refRes.json().catch(() => ({}))) as { message?: string }
      return NextResponse.json(
        {
          error: err.message || `Could not get branch ${branch}`,
          uploaded: [],
          rejected,
        },
        { status: 400 }
      )
    }
    const ref = (await refRes.json()) as { object?: { sha?: string } }
    const commitSha = ref.object?.sha
    if (!commitSha) {
      return NextResponse.json(
        { error: 'Could not get latest commit', uploaded: [], rejected },
        { status: 500 }
      )
    }

    const commitRes = await fetch(`${apiBase}/git/commits/${commitSha}`, { headers })
    if (!commitRes.ok) {
      return NextResponse.json(
        { error: 'Could not get commit', uploaded: [], rejected },
        { status: 500 }
      )
    }
    const commit = (await commitRes.json()) as { tree?: { sha?: string } }
    const rootTreeSha = commit.tree?.sha
    if (!rootTreeSha) {
      return NextResponse.json(
        { error: 'Could not get tree', uploaded: [], rejected },
        { status: 500 }
      )
    }

    const blobShas: { path: string; sha: string }[] = []
    for (const { name, contentBase64 } of validFiles) {
      const blobRes = await fetch(`${apiBase}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: contentBase64, encoding: 'base64' }),
      })
      if (!blobRes.ok) {
        const err = (await blobRes.json().catch(() => ({}))) as { message?: string }
        rejected.push({ name, reason: err.message || `Blob creation failed` })
        continue
      }
      const blob = (await blobRes.json()) as { sha?: string }
      if (blob.sha) blobShas.push({ path: `${CONTENT_PATH_PREFIX}${name}`, sha: blob.sha })
    }

    if (blobShas.length === 0) {
      return NextResponse.json({
        uploaded: [],
        rejected,
        message: 'Could not create blobs for any file.',
      })
    }

    const treeBody = {
      base_tree: rootTreeSha,
      tree: blobShas.map(({ path, sha }) => ({
        path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha,
      })),
    }
    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify(treeBody),
    })
    if (!treeRes.ok) {
      const err = (await treeRes.json().catch(() => ({}))) as { message?: string }
      return NextResponse.json(
        {
          error: err.message || 'Could not create tree',
          uploaded: [],
          rejected,
        },
        { status: 500 }
      )
    }
    const tree = (await treeRes.json()) as { sha?: string }
    const newTreeSha = tree.sha
    if (!newTreeSha) {
      return NextResponse.json(
        { error: 'Could not get new tree SHA', uploaded: [], rejected },
        { status: 500 }
      )
    }

    const commitBody = {
      tree: newTreeSha,
      parents: [commitSha],
      message: 'Upload streaming history via Spotify Pulse',
    }
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify(commitBody),
    })
    if (!newCommitRes.ok) {
      const err = (await newCommitRes.json().catch(() => ({}))) as { message?: string }
      let reason = err.message || 'Could not create commit'
      if (
        newCommitRes.status === 403 ||
        reason.toLowerCase().includes('not accessible by personal access token')
      ) {
        reason += ` Target repo: ${repoOwner}/${repoName}.`
        if (tokenUser) {
          reason += ` Token is for user "${tokenUser}".`
          if (tokenUser.toLowerCase() !== repoOwner.toLowerCase()) {
            reason += ` Repo owner is "${repoOwner}" — they must match.`
          } else {
            reason += ' Try a new classic PAT with repo scope in web-app/.env.local.'
          }
        }
      }
      return NextResponse.json(
        { error: reason, uploaded: [], rejected },
        { status: newCommitRes.status }
      )
    }
    const newCommit = (await newCommitRes.json()) as { sha?: string }
    const newCommitSha = newCommit.sha
    if (!newCommitSha) {
      return NextResponse.json(
        { error: 'Could not get new commit SHA', uploaded: [], rejected },
        { status: 500 }
      )
    }

    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: newCommitSha }),
    })
    if (!updateRefRes.ok) {
      const err = (await updateRefRes.json().catch(() => ({}))) as { message?: string }
      return NextResponse.json(
        {
          error: err.message || 'Could not update branch ref',
          uploaded: [],
          rejected,
        },
        { status: 500 }
      )
    }

    const uploaded = blobShas.map(({ path }) => path.replace(CONTENT_PATH_PREFIX, ''))

    return NextResponse.json({
      uploaded,
      rejected,
      message: `Uploaded ${uploaded.length} file(s) in one commit to ${CONTENT_PATH_PREFIX}.`,
    })
  } catch (err) {
    console.error('Upload history error:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to upload files.',
        uploaded: [],
        rejected: [],
      },
      { status: 500 }
    )
  }
}
