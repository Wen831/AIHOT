// GitHub repo stats for showcase items: the trending feed carries only the README, the stars and
// forks a reader asks about come from the REST API. Unauthenticated: 60 requests/hour — a daily
// round of a dozen repos fits with room. Every failure returns null: stats are an enhancement,
// never a gate — collection, writing and display go on without them (the UI hides the line).
export interface RepoStats {
  stars: number;
  forks: number;
  language: string | null;
}

const apiBase = () => process.env.GITHUB_API_BASE ?? "https://api.github.com";

/** `https://github.com/owner/repo(.git)?/…` → `owner/repo`, else null. */
export function repoOwnerRepo(url: string): string | null {
  const m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function fetchRepoStats(ownerRepo: string, timeoutMs = 8_000): Promise<RepoStats | null> {
  try {
    const res = await fetch(`${apiBase()}/repos/${ownerRepo}`, {
      headers: { "user-agent": "aihot-showcase", accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown; forks_count?: unknown; language?: unknown };
    if (typeof data.stargazers_count !== "number" || typeof data.forks_count !== "number") return null;
    return { stars: data.stargazers_count, forks: data.forks_count, language: typeof data.language === "string" ? data.language : null };
  } catch {
    return null;
  }
}
