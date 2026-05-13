import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";

export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${question}\n> `);
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function confirm(question: string): Promise<boolean> {
  const answer = (await ask(`${question} [y/N]`)).toLowerCase();
  return answer === "y" || answer === "yes";
}
