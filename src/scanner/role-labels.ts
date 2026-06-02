/**
 * Plain-language labels for detected repo roles, so a non-developer reading the
 * summary in the chat pane sees "a Next.js app" instead of the raw `next-app`
 * token (WS6 — desktop UX). Unknown roles get a humanised fallback rather than a
 * wrong guess.
 */
import type { ContextMap } from '../types.js'

/** Friendly label per known role token (roles come from detection-registry + WordPress resolution). */
const ROLE_LABELS: Record<string, string> = {
  'next-app': 'a Next.js app',
  'react-app': 'a React app',
  'vite-app': 'a Vite app',
  'react-router-app': 'a React Router app',
  'sanity-studio': 'a Sanity Studio',
  'strapi-app': 'a Strapi app',
  'expo-app': 'an Expo app',
  'vendure-app': 'a Vendure server',
  'vendure-plugin': 'a Vendure plugin',
  'nestjs-api': 'a NestJS API',
  'graphql-api': 'a GraphQL API',
  'nx-monorepo': 'an Nx monorepo',
  'turbo-monorepo': 'a Turborepo monorepo',
  'laravel-app': 'a Laravel app',
  'laravel-nova-app': 'a Laravel Nova app',
  'dotnet-service': 'a .NET service',
  'express-service': 'an Express service',
  'wordpress-bedrock-site': 'a WordPress (Bedrock) site',
  'wordpress-vanilla-site': 'a WordPress site',
  'wordpress-site': 'a WordPress site',
}

/** Picks "a" or "an" for a humanised fallback based on the first letter. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

/**
 * Returns a plain-language label for a single role token. Falls back to a
 * humanised form ("foo-bar" → "a foo bar") for tokens not in the known map.
 */
export function friendlyRole(role: string): string {
  const known = ROLE_LABELS[role]
  if (known) return known
  const words = role.replace(/[-_]+/g, ' ').trim()
  return words ? `${article(words)} ${words}` : 'a project'
}

/** Joins role labels into "X, Y and Z" (Oxford-free), or "" for an empty list. */
function joinRoles(labels: string[]): string {
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * Builds a one-paragraph, plain-language description of the repo for a non-dev:
 * what it looks like, the package manager, and an honest note when the stack was
 * only partially recognised or not recognised at all.
 */
export function describeRepo(context: ContextMap): string {
  const labels = context.repoRoles.map(friendlyRole)
  const roleText = joinRoles(labels)

  if (context.detectionStatus === 'unknown') {
    const markers = context.unsupportedSignals.join(', ')
    const detail = markers ? ` (I see ${markers})` : ''
    return `I couldn't fully recognise this stack${detail}, so I'll apply the general workflow and security guidance rather than framework-specific help.`
  }

  const base = roleText
    ? `This looks like ${roleText}, using ${context.packageManager}.`
    : `I recognised this project's tooling (${context.packageManager}) but not a specific framework.`

  if (context.detectionStatus === 'partial' && context.unsupportedSignals.length > 0) {
    return `${base} I also see ${context.unsupportedSignals.join(', ')}, which haus doesn't fully support — guidance covers the recognised parts.`
  }
  return base
}
