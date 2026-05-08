export function explainRecommendation(id: string, reasons: string[]): string {
  return `${id}: ${reasons.join(", ") || "no reason"}`;
}
