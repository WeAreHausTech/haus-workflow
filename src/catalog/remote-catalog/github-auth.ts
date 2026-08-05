/** Resolve a GitHub API token from env or `gh auth token` (cached per process). */
import { runCommand } from '../../utils/exec.js'

type TokenResolver = () => Promise<string | null>

/** undefined = not yet resolved; null = resolved to no token. */
let cachedToken: string | null | undefined
let inFlight: Promise<string | null> | undefined
let ghResolverOverride: TokenResolver | undefined

async function defaultGhTokenResolver(): Promise<string | null> {
  try {
    const result = await runCommand('gh', ['auth', 'token'], {
      timeout: 2_000,
      reject: false,
    })
    if (result.exitCode !== 0) return null
    const token = result.stdout.trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

/** Test-only: inject `gh auth token` resolver (undefined restores default). */
export function _setGhTokenResolverForTests(resolver: TokenResolver | undefined): void {
  ghResolverOverride = resolver
}

/** Test-only: clear cached token between isolated runs. */
export function _resetGithubAuthCacheForTests(): void {
  cachedToken = undefined
  inFlight = undefined
}

/**
 * Resolve auth token: HAUS_GITHUB_TOKEN → GITHUB_TOKEN → gh auth token → null.
 * Never logs the token value.
 */
export async function resolveGithubAuthToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken
  if (!inFlight) {
    inFlight = (async () => {
      const haus = env['HAUS_GITHUB_TOKEN']?.trim()
      if (haus) return haus
      const github = env['GITHUB_TOKEN']?.trim()
      if (github) return github
      const fromGh = await (ghResolverOverride ?? defaultGhTokenResolver)()
      return fromGh
    })().then((token) => {
      cachedToken = token
      inFlight = undefined
      return token
    })
  }
  return inFlight
}

/** Headers for GitHub REST API calls (includes Authorization when a token is available). */
export async function getGithubApiHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const auth = await resolveGithubAuthToken(env)
  if (auth) headers['Authorization'] = `Bearer ${auth}`
  return headers
}
