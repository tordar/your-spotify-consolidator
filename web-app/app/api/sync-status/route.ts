import { NextResponse } from 'next/server'

interface GitHubWorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  run_started_at: string | null
  html_url: string
  head_sha: string
  head_branch: string
}

interface GitHubWorkflowRunsResponse {
  workflow_runs: GitHubWorkflowRun[]
}

interface GitHubCommit {
  sha: string
  commit: {
    message: string
    author: {
      name: string
      date: string
    }
  }
  stats?: {
    total: number
    additions: number
    deletions: number
  }
  files?: Array<{
    filename: string
    additions: number
    deletions: number
    changes: number
  }>
}

interface GitHubJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  steps: Array<{
    name: string
    status: string
    conclusion: string | null
  }>
}

export async function GET() {
  try {
    // Get repository info from environment variables
    const repoOwner = process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER
    const repoName = process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG?.split('/').pop()
    const githubToken = process.env.GITHUB_TOKEN

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        {
          error: 'Repository information not configured. Set GITHUB_REPO_OWNER and GITHUB_REPO_NAME (or deploy from Vercel so VERCEL_GIT_REPO_OWNER and VERCEL_GIT_REPO_SLUG are set).',
        },
        { status: 500 }
      )
    }

    // GitHub API endpoint for workflow runs
    // The workflow file is at .github/workflows/sync-spotify.yml
    const workflowId = 'sync-spotify.yml' // This is the workflow file name
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/runs?per_page=1&status=completed`

    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
    }

    // Add token if available (increases rate limit)
    if (githubToken) {
      headers.Authorization = `token ${githubToken}`
    }

    const response = await fetch(apiUrl, {
      headers,
      cache: 'no-store', // Temporarily disable cache for testing
    })

    if (!response.ok) {
      // If 404, workflow might not exist or repo is private without token
      if (response.status === 404) {
        return NextResponse.json({
          error: 'Workflow not found or repository is private',
          lastSync: null,
        })
      }
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const data: GitHubWorkflowRunsResponse = await response.json()

    if (!data.workflow_runs || data.workflow_runs.length === 0) {
      return NextResponse.json({
        lastSync: null,
        message: 'No completed workflow runs found',
      })
    }

    const lastRun = data.workflow_runs[0]

    // Fetch additional details
    const syncDetails: any = {
      timestamp: lastRun.run_started_at || lastRun.created_at,
      status: lastRun.status,
      conclusion: lastRun.conclusion,
      url: lastRun.html_url,
      name: lastRun.name,
    }

    // Try to get commit information and parse stats
    // First, try to find the commit created by this workflow run
    if (lastRun.head_sha) {
      try {
        // Method 1: Try to get commits by the workflow author (requires token)
        let syncCommit: GitHubCommit | null = null
        
        if (githubToken) {
          // Get the commit that was created by the workflow (look for commits after the workflow run)
          const sinceDate = new Date(new Date(lastRun.run_started_at || lastRun.created_at).getTime() - 3600000).toISOString()
          const commitsUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits?author=action@github.com&since=${sinceDate}&per_page=10`
          
          const commitsResponse = await fetch(commitsUrl, {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `token ${githubToken}`,
            },
            cache: 'no-store', // Temporarily disable cache for testing
          })

          if (commitsResponse.ok) {
            const commits: GitHubCommit[] = await commitsResponse.json()
            
            // Find the commit that matches the sync pattern
            syncCommit = commits.find(c => 
              c.commit.message.includes('Spotify sync') || 
              c.commit.message.includes('Auto-merge')
            ) || null
          }
        }
        
        // Method 2: If we didn't find it, try getting recent commits and look for sync commits
        if (!syncCommit && githubToken) {
          const recentCommitsUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits?per_page=10`
          const recentCommitsResponse = await fetch(recentCommitsUrl, {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `token ${githubToken}`,
            },
            cache: 'no-store',
          })
          
          if (recentCommitsResponse.ok) {
            const recentCommits: GitHubCommit[] = await recentCommitsResponse.json()
            syncCommit = recentCommits.find(c => 
              (c.commit.message.includes('Spotify sync') || c.commit.message.includes('Auto-merge')) &&
              new Date(c.commit.author.date) >= new Date(lastRun.run_started_at || lastRun.created_at)
            ) || null
          }
        }

        if (syncCommit) {
          // Get detailed commit info with stats
          const commitDetailUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${syncCommit.sha}`
          const commitDetailResponse = await fetch(commitDetailUrl, {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `token ${githubToken}`,
            },
            cache: 'no-store', // Temporarily disable cache for testing
          })

          if (commitDetailResponse.ok) {
            const commitDetail: GitHubCommit = await commitDetailResponse.json()
            
            syncDetails.commit = {
              sha: commitDetail.sha.substring(0, 7),
              message: commitDetail.commit.message,
              date: commitDetail.commit.author.date,
              url: `https://github.com/${repoOwner}/${repoName}/commit/${commitDetail.sha}`,
            }

            if (commitDetail.stats) {
              syncDetails.commit.stats = {
                additions: commitDetail.stats.additions,
                deletions: commitDetail.stats.deletions,
                total: commitDetail.stats.total,
              }
            }

            // Try to parse workflow logs for detailed stats
            try {
              const jobsUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/runs/${lastRun.id}/jobs`
              const jobsResponse = await fetch(jobsUrl, {
                headers: {
                  Accept: 'application/vnd.github.v3+json',
                  Authorization: `token ${githubToken}`,
                },
                cache: 'no-store', // Temporarily disable cache for testing
              })

              if (jobsResponse.ok) {
                const jobsData: { jobs: GitHubJob[] } = await jobsResponse.json()
                
                // Try to get logs from the merge step
                const mergeJob = jobsData.jobs.find(j => j.name === 'sync-spotify-data')
                if (mergeJob) {
                  // Note: Getting actual log content requires additional API calls
                  // For now, we'll just include job status
                  syncDetails.job = {
                    status: mergeJob.status,
                    conclusion: mergeJob.conclusion,
                    steps: mergeJob.steps.map(s => ({
                      name: s.name,
                      status: s.status,
                      conclusion: s.conclusion,
                    })),
                  }
                }
              }
            } catch (logError) {
              // Log parsing is optional, don't fail if it doesn't work
              console.log('Could not fetch job logs:', logError)
            }

            // Try to parse stats from commit message or file changes
            // The merge script logs: "New songs added: X"
            // We can check file sizes or parse commit message
            if (commitDetail.files) {
              const dataFiles = commitDetail.files.filter(f => 
                f.filename.startsWith('data/merged-streaming-history/') ||
                f.filename.startsWith('data/cleaned-data/')
              )
              
              if (dataFiles.length > 0) {
                syncDetails.filesChanged = {
                  count: dataFiles.length,
                  totalAdditions: dataFiles.reduce((sum, f) => sum + f.additions, 0),
                  totalDeletions: dataFiles.reduce((sum, f) => sum + f.deletions, 0),
                  files: dataFiles.map(f => ({
                    name: f.filename.split('/').pop(),
                    additions: f.additions,
                    deletions: f.deletions,
                  })),
                }
              }
            }
          }
        }
      } catch (commitError) {
        // Commit info is optional, don't fail if we can't get it
        console.error('Could not fetch commit details:', commitError)
        // Log the error but continue - we'll still return basic sync info
      }
    } else {
      // No head_sha available
      console.log('No head_sha available for workflow run')
    }

    // Add debug info in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Sync details:', JSON.stringify(syncDetails, null, 2))
    }

    return NextResponse.json({
      lastSync: syncDetails,
    })
  } catch (error) {
    console.error('Error fetching sync status:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch sync status',
        lastSync: null,
      },
      { status: 500 }
    )
  }
}

