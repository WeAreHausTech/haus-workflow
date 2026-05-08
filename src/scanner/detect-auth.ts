export function detectAuth(content: string): string[] {
  const out: string[] = [];
  if (content.includes("openid") || content.includes("OIDC")) out.push("oidc");
  if (content.includes("azure") || content.includes("AZURE_AD")) out.push("azure-ad");
  if (content.includes("BANKID")) out.push("bankid");
  return out;
}
