/**
 * Node test reporter: compact progress during run, full failure digest at the end.
 */
import { Transform } from 'node:stream'
import { inspect } from 'node:util'

/** @typedef {{ name: string, file?: string, line?: number, column?: number, error?: unknown }} Failure */

/** @type {Failure[]} */
const failures = []

/** @type {{ counts?: { tests: number, passed: number, failed: number, skipped: number } } | null} */
let latestSummary = null

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatError(error) {
  if (error == null) return '(no error message)'
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return inspect(error, { depth: 4, colors: true })

  const lines = []
  const err =
    /** @type {{ message?: string, stack?: string, cause?: unknown, operator?: string, expected?: unknown, actual?: unknown }} */ (
      error
    )
  const cause = isRecord(err.cause)
    ? /** @type {{ message?: string, stack?: string, operator?: string, expected?: unknown, actual?: unknown }} */ (
        err.cause
      )
    : err

  if (cause.message) lines.push(cause.message)
  if (err.operator ?? cause.operator) lines.push(`operator: ${err.operator ?? cause.operator}`)
  const expected = Object.hasOwn(err, 'expected')
    ? err.expected
    : Object.hasOwn(cause, 'expected')
      ? cause.expected
      : undefined
  const actual = Object.hasOwn(err, 'actual')
    ? err.actual
    : Object.hasOwn(cause, 'actual')
      ? cause.actual
      : undefined
  if (expected !== undefined)
    lines.push(`expected: ${inspect(expected, { depth: 4, colors: true })}`)
  if (actual !== undefined) lines.push(`actual: ${inspect(actual, { depth: 4, colors: true })}`)

  const stack = cause.stack ?? err.stack
  if (stack) {
    if (!lines.length) lines.push(stack.split('\n')[0] ?? stack)
    lines.push(stack)
  }

  return lines.length > 0 ? lines.join('\n') : inspect(error, { depth: 4, colors: true })
}

/**
 * @param {Failure} failure
 * @returns {string}
 */
function formatFailure(failure) {
  const location =
    failure.file != null
      ? `${failure.file}${failure.line != null ? `:${failure.line}` : ''}`
      : 'unknown location'
  const header = `✖ ${failure.name}`
  const divider = '─'.repeat(Math.min(72, Math.max(header.length, location.length)))
  return `${divider}\n${header}\n${location}\n\n${formatError(failure.error)}\n`
}

const reporter = new Transform({
  writableObjectMode: true,
  readableObjectMode: false,
  transform(event, _encoding, callback) {
    switch (event.type) {
      case 'test:pass':
        callback(null, '.')
        return
      case 'test:fail': {
        const data = event.data
        if (!data.todo) {
          failures.push({
            name: data.name,
            file: data.file,
            line: data.line,
            column: data.column,
            error: data.details?.error ?? data.error,
          })
        }
        callback(null, 'X')
        return
      }
      case 'test:summary':
        latestSummary = event.data
        callback()
        return
      default:
        callback()
    }
  },
  flush(callback) {
    const chunks = []

    const counts = isRecord(latestSummary) ? latestSummary.counts : undefined
    if (
      counts != null &&
      typeof counts.tests === 'number' &&
      typeof counts.passed === 'number' &&
      typeof counts.failed === 'number' &&
      typeof counts.skipped === 'number'
    ) {
      chunks.push(
        '',
        `tests ${counts.tests} | pass ${counts.passed} | fail ${counts.failed} | skipped ${counts.skipped}`,
      )
    }

    if (failures.length > 0) {
      const blocks = failures.map(formatFailure)
      chunks.push(
        '',
        '═'.repeat(72),
        `FAILURES (${failures.length})`,
        '═'.repeat(72),
        '',
        ...blocks,
        '═'.repeat(72),
        `${failures.length} test(s) failed`,
        '═'.repeat(72),
        '',
      )
    }

    callback(null, chunks.length > 0 ? `${chunks.join('\n')}\n` : undefined)
  },
})

export default reporter
