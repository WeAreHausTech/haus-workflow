/** GitHub API rate-limit detection, per-sync state, and user-facing copy. */

export type GithubRateLimitHit = {
  resetAt: number | null
  authenticated: boolean
}

/** Minimal Response-like surface used by detectors (real fetch Response or test doubles). */
export type RateLimitResponseLike = {
  status: number
  headers: { get(name: string): string | null }
}

let hit: GithubRateLimitHit | undefined

/** True when the response indicates GitHub API rate limiting. */
export function isGithubRateLimitedResponse(res: RateLimitResponseLike): boolean {
  if (res.status !== 403 && res.status !== 429) return false
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining === '0') return true
  if (res.headers.get('retry-after') !== null) return true
  return false
}

/** Parse X-RateLimit-Reset header as unix seconds, or null. */
export function readRateLimitResetAt(res: RateLimitResponseLike): number | null {
  const raw = res.headers.get('x-ratelimit-reset')
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Record a rate-limit hit for this process/sync (keeps earliest resetAt; upgrades authenticated). */
export function noteGithubRateLimit(res: RateLimitResponseLike, authenticated: boolean): void {
  if (!isGithubRateLimitedResponse(res)) return
  const resetAt = readRateLimitResetAt(res)
  if (!hit) {
    hit = { resetAt, authenticated }
    return
  }
  // Prefer authenticated=true if any call used a token; keep the earliest known reset.
  const earliestReset =
    hit.resetAt === null ? resetAt : resetAt === null ? hit.resetAt : Math.min(hit.resetAt, resetAt)
  hit = {
    resetAt: earliestReset,
    authenticated: hit.authenticated || authenticated,
  }
}

export function getGithubRateLimitHit(): GithubRateLimitHit | undefined {
  return hit
}

export function clearGithubRateLimitHit(): void {
  hit = undefined
}

function formatResetLocal(resetAt: number | null): string {
  if (resetAt === null) return 'the rate-limit window resets'
  try {
    return new Date(resetAt * 1000).toLocaleString()
  } catch {
    return 'the rate-limit window resets'
  }
}

/** One-shot user guidance after catalog sync hits GitHub rate limits. */
export function formatGithubRateLimitMessage(info: GithubRateLimitHit): string {
  const when = formatResetLocal(info.resetAt)
  if (info.authenticated) {
    return [
      'GitHub API rate limit exceeded (authenticated).',
      `Wait until ${when}, then retry the command.`,
    ].join('\n')
  }
  return [
    'GitHub API rate limit exceeded (unauthenticated: 60 req/hr).',
    'Fix:  export GITHUB_TOKEN=$(gh auth token)   # or HAUS_GITHUB_TOKEN=<pat>',
    "      # also: gh auth login   if gh isn't logged in",
    'Then: retry the command (e.g. haus update)',
    `Or wait until ${when} and retry once (token still recommended — wait alone can re-hit the limit).`,
  ].join('\n')
}
