import { timingSafeEqual } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'

const RULES_REPO_PATH = 'scripts/cleaner/utils/album-consolidation-rules.json'

interface ConsolidationRule {
  artistName: string
  baseAlbumName: string
  variations: string[]
}

interface RulesBody {
  rules: ConsolidationRule[]
}

function getRepoRoot(): string {
  const fromWebApp = join(process.cwd(), '..')
  const fromRepoRoot = process.cwd()
  if (existsSync(join(fromWebApp, 'scripts', 'cleaner', 'utils', 'album-consolidation-rules.json'))) {
    return fromWebApp
  }
  if (existsSync(join(fromRepoRoot, 'scripts', 'cleaner', 'utils', 'album-consolidation-rules.json'))) {
    return fromRepoRoot
  }
  return fromWebApp
}

function readRulesFromFilesystem(): RulesBody | null {
  try {
    const root = getRepoRoot()
    const filePath = join(root, RULES_REPO_PATH)
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content) as RulesBody
    if (!Array.isArray(data.rules)) return null
    return data
  } catch {
    return null
  }
}

function validateRulesBody(body: unknown): body is RulesBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.rules)) return false
  return b.rules.every(
    (r: unknown) =>
      r &&
      typeof r === 'object' &&
      typeof (r as ConsolidationRule).artistName === 'string' &&
      typeof (r as ConsolidationRule).baseAlbumName === 'string' &&
      Array.isArray((r as ConsolidationRule).variations) &&
      (r as ConsolidationRule).variations.every((v: unknown) => typeof v === 'string')
  )
}

export async function GET() {
  try {
    const repoOwner = (
      process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER || ''
    ).trim()
    const repoName = (
      process.env.GITHUB_REPO_NAME ||
      process.env.VERCEL_GIT_REPO_SLUG?.split('/').pop() ||
      ''
    ).trim()
    const githubToken = (process.env.GITHUB_TOKEN || '').trim()

    if (githubToken && repoOwner && repoName) {
      const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${RULES_REPO_PATH}`
      const headers: HeadersInit = {
        Accept: 'application/vnd.github.v3+json',
      }
      if (githubToken) {
        headers.Authorization = `Bearer ${githubToken}`
      }
      const res = await fetch(url, { headers, cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as { content?: string; encoding?: string }
        if (data.content && data.encoding === 'base64') {
          const decoded = Buffer.from(data.content, 'base64').toString('utf-8')
          const parsed = JSON.parse(decoded) as RulesBody
          return NextResponse.json(parsed)
        }
      }
    }

    const fsRules = readRulesFromFilesystem()
    if (fsRules) return NextResponse.json(fsRules)

    return NextResponse.json({ rules: [] })
  } catch (error) {
    console.error('Error reading album consolidation rules:', error)
    return NextResponse.json(
      { error: 'Failed to load consolidation rules' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const uploadSecretEnv = (process.env.UPLOAD_SECRET || '').trim()
    if (!uploadSecretEnv) {
      return NextResponse.json(
        {
          error:
            'Upload is not configured. Set UPLOAD_SECRET to save rules from the app.',
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
            'GitHub is not configured. Set GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME to save rules.',
          code: 'UPLOAD_NOT_CONFIGURED',
        },
        { status: 501 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      )
    }
    if (!validateRulesBody(body)) {
      return NextResponse.json(
        { error: 'Body must be { rules: Array<{ artistName, baseAlbumName, variations }> }.' },
        { status: 400 }
      )
    }

    const content = JSON.stringify(body, null, 2)
    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64')

    const apiBase = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${RULES_REPO_PATH}`
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
    }

    let currentSha: string | null = null
    const getRes = await fetch(apiBase, { headers, cache: 'no-store' })
    if (getRes.ok) {
      const getData = (await getRes.json()) as { sha?: string }
      currentSha = getData.sha || null
    }

    const putBody: { message: string; content: string; sha?: string } = {
      message: 'Update album consolidation rules via Spotify Pulse',
      content: contentBase64,
    }
    if (currentSha) putBody.sha = currentSha

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putBody),
    })

    if (!putRes.ok) {
      const err = (await putRes.json().catch(() => ({}))) as { message?: string }
      return NextResponse.json(
        { error: err.message || 'Failed to update file on GitHub' },
        { status: putRes.status }
      )
    }

    return NextResponse.json({ ok: true, message: 'Rules saved to GitHub.' })
  } catch (error) {
    console.error('Error saving album consolidation rules:', error)
    return NextResponse.json(
      { error: 'Failed to save consolidation rules' },
      { status: 500 }
    )
  }
}
