/** Shared manifest item field validation for parseManifest and validate-core. */

import { HTTP_URL_PATTERN } from './validation-rules.js'

export const USE_MODES = new Set(['copy', 'adapted', 'wrapped', 'rewritten', 'reference-only'])
export const LICENSE_CONFIDENCES = new Set(['high', 'medium', 'low', 'unknown'])
export const REVIEW_STATUSES = new Set([
  'approved',
  'candidate',
  'needs-review',
  'rejected',
  'deprecated',
])
export const RISK_LEVELS = new Set(['low', 'medium', 'high', 'blocked'])

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function validateReferences(itemId: string, references: unknown): string | null {
  if (references === undefined) return null
  if (!isStringArray(references)) return `${itemId}: references must be a string array`
  for (const ref of references) {
    if (/^https?:\/\//i.test(ref)) {
      if (!ref.startsWith('https://')) {
        return `${itemId}: reference must be https:// URL: ${ref}`
      }
      if (HTTP_URL_PATTERN.test(ref)) {
        return `${itemId}: reference uses insecure http:// URL: ${ref}`
      }
    }
  }
  return null
}

export function validateCuratedProvenance(item: Record<string, unknown>): string | null {
  if (item.source !== 'curated') return null
  if (!isNonEmptyString(item.reviewStatus)) {
    return `${item.id}: curated item missing reviewStatus`
  }
  if (!REVIEW_STATUSES.has(item.reviewStatus)) {
    return `${item.id}: invalid reviewStatus "${item.reviewStatus}"`
  }
  if (!isNonEmptyString(item.riskLevel)) {
    return `${item.id}: curated item missing riskLevel`
  }
  if (!RISK_LEVELS.has(item.riskLevel)) {
    return `${item.id}: invalid riskLevel "${item.riskLevel}"`
  }
  if (item.useMode !== undefined && !USE_MODES.has(String(item.useMode))) {
    return `${item.id}: invalid useMode "${item.useMode}"`
  }
  if (
    item.licenseConfidence !== undefined &&
    !LICENSE_CONFIDENCES.has(String(item.licenseConfidence))
  ) {
    return `${item.id}: invalid licenseConfidence "${item.licenseConfidence}"`
  }
  if (item.originUrl !== undefined) {
    if (typeof item.originUrl !== 'string' || !item.originUrl.startsWith('https://')) {
      return `${item.id}: originUrl must be an https:// URL`
    }
  }
  return null
}
