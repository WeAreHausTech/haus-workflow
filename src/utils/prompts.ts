/** Interactive CLI prompt helpers for free-text questions and yes/no confirmations. */

import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'

/** Prompt the user with a question and return their trimmed response. */
async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question(`${question}\n> `)
    return answer.trim()
  } finally {
    // Always close the readline interface to avoid blocking the event loop
    rl.close()
  }
}

/** Prompt with a [y/N] suffix; returns true only for "y" or "yes". */
export async function confirm(question: string): Promise<boolean> {
  const answer = (await ask(`${question} [y/N]`)).toLowerCase()
  return answer === 'y' || answer === 'yes'
}
