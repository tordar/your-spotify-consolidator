import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // Get repository info from environment variables
    const repoOwner = process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER
    const repoName = process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG?.split('/').pop()
    const githubToken = process.env.GITHUB_TOKEN

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        { error: 'Repository information not configured' },
        { status: 500 }
      )
    }

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    // GitHub API endpoint to trigger workflow_dispatch
    // The workflow file is at .github/workflows/sync-spotify.yml
    const workflowId = 'sync-spotify.yml'
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${githubToken}`, // Use Bearer for newer tokens
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'master', // Default branch (matches workflow)
      }),
    })

    if (!response.ok) {
      let errorMessage = `Failed to trigger workflow: ${response.statusText}`
      let errorDetails = ''
      
      try {
        const errorData = await response.json()
        errorDetails = errorData.message || errorData.error || ''
      } catch {
        const errorText = await response.text()
        errorDetails = errorText
      }
      
      console.error('GitHub API error:', response.status, errorDetails)
      
      if (response.status === 403) {
        errorMessage = 'Permission denied. Make sure your GitHub token has the "actions:write" permission and access to this repository.'
        if (errorDetails) {
          errorMessage += ` Details: ${errorDetails}`
        }
      } else if (response.status === 404) {
        errorMessage = 'Workflow not found. Make sure the workflow file exists and workflow_dispatch is enabled.'
      } else if (errorDetails) {
        errorMessage += ` Details: ${errorDetails}`
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Workflow triggered successfully',
    })
  } catch (error) {
    console.error('Error triggering workflow:', error)
    return NextResponse.json(
      {
        error: 'Failed to trigger workflow',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

