export async function syncGithubSource(checkOnly: boolean): Promise<{ source: string; checkOnly: boolean; message: string }> {
  return { source: "github", checkOnly, message: "Pinned repo metadata sync stub. No auto-install." };
}
