/** Thin wrappers over console — all src/ modules must use these instead of console directly. */

export const log = (msg?: unknown, ...args: unknown[]): void => {
  console.log(msg, ...args) // eslint-disable-line no-console
}

/** Log a warning to stderr. */
export const warn = (msg?: unknown, ...args: unknown[]): void => {
  console.warn(msg, ...args) // eslint-disable-line no-console
}

/** Log an error to stderr. */
export const error = (msg?: unknown, ...args: unknown[]): void => {
  console.error(msg, ...args) // eslint-disable-line no-console
}
