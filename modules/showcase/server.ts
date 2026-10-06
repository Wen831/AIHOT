// The showcase module's backend sockets: a participation mode ("showcase") for display-only feeds
// such as the daily GitHub trending. The listing is the ranking: a repo stored earlier yields its
// slot to a new one, Chinese projects get a small bonus, only the top entries reach storage, and the
// rendered README bodies are truncated before storage (full ones would sit in the pool unread and
// burn writing tokens). After a round, every item still inside the tracking window is measured
// against the GitHub REST API: a new item gets its baseline (starsFirst), a measured one keeps it
// and updates the current value — their difference is the daily growth the item page shows. GitHub
// out of reach leaves the stored stats untouched, and the UI hides or dates them.
import { sql } from "@aihot/backend/db";
import type { Candidate } from "@aihot/backend/sources/types";
import type { ParticipationMode, ServerModule } from "@aihot/backend/modules";
import { fetchRepoStats, repoOwnerRepo } from "./github.ts";
import { analyzeShowcaseArticle } from "./analyze.ts";

/** Showcase ranking/reading: CJK share over this counts an item as a Chinese project; README characters the writer sees. */
const SHOWCASE_BODY_CHARS = 6000;
/** Hours a stored measurement stays fresh: re-collections and retries within it do not re-buy API calls. */
const MEASURE_MIN_HOURS = 12;
/** How long an item stays measured with its feed appearances; after that its growth line freezes. */
const TRACK_DAYS = 7;

const chineseShare = (text: string): number => {
  const chars = text.replace(/\s/g, "");
  if (!chars.length) return 0;
  return (chars.match(/[\u4e00-\u9fff]/g)?.length ?? 0) / chars.length;
};

const shapeListing: NonNullable<ParticipationMode["shapeListing"]> = async ({ candidates, source }) => {
  const tuning = source.config._aihot as { maxItemsPerRound?: number } | undefined;
  const cap = Number(tuning?.maxItemsPerRound ?? 10);
  const keys = candidates.map((c) => c.identityKey!).filter(Boolean);
  // The whole feed (not just what this round will store) is what stats track: a listed repo already
  // stored still gets its fresh reading.
  const feedKeys = [...new Set(keys)];
  const storedKeys = keys.length
    ? new Set((await sql<{ identity_key: string }[]>`SELECT identity_key FROM articles WHERE source_id = ${source.id} AND identity_key = ANY(${keys}::text[])`).map((r) => r.identity_key))
    : new Set<string>();
  const shaped = candidates
    .filter((c) => !storedKeys.has(c.identityKey!))
    .map((c, index) => ({ c, score: -index + (chineseShare(`${c.title}\n${c.excerpt ?? ""}\n${c.bodyText ?? ""}`) > 0.3 ? 2 : 0) }))
    .sort((x, y) => y.score - x.score)
    .map(({ c }) => c)
    .slice(0, cap)
    .map((c) => ({ ...c, bodyHtml: null, bodyText: c.bodyText?.slice(0, SHOWCASE_BODY_CHARS) ?? c.bodyText, excerpt: c.excerpt?.slice(0, SHOWCASE_BODY_CHARS) ?? c.excerpt }));
  return { candidates: shaped, feedKeys };
};

const afterListing: NonNullable<ParticipationMode["afterListing"]> = async ({ sourceId, feedKeys }) => {
  const keys = [...new Set(feedKeys.filter(Boolean))];
  if (!keys.length) return;
  const rows = await sql<{ id: string; url: string; showcase_stats: Record<string, any> | null }[]>`
    SELECT id, url, showcase_stats FROM articles
    WHERE source_id = ${sourceId} AND identity_key = ANY(${keys}::text[])
      AND discovered_at > now() - ${`${TRACK_DAYS} days`}::interval`;
  const repos = rows
    .map((row) => ({ row, repo: repoOwnerRepo(row.url) }))
    .filter((entry): entry is { row: typeof rows[number]; repo: string } => {
      if (!entry.repo) return false;
      const at = entry.row.showcase_stats?.measuredAt;
      return !at || Number.isNaN(Date.parse(String(at))) || Date.now() - Date.parse(String(at)) > MEASURE_MIN_HOURS * 3600_000;
    });
  const measured = await Promise.allSettled(repos.map(({ repo }) => fetchRepoStats(repo)));
  for (let i = 0; i < repos.length; i += 1) {
    const got = measured[i];
    if (got?.status !== "fulfilled" || !got.value) continue;
    const old = repos[i]!.row.showcase_stats;
    await sql`UPDATE articles SET showcase_stats = ${sql.json({
      stars: got.value.stars,
      starsFirst: typeof old?.starsFirst === "number" ? old.starsFirst : got.value.stars,
      firstAt: typeof old?.firstAt === "string" ? old.firstAt : new Date().toISOString(),
      forks: got.value.forks,
      language: got.value.language,
      measuredAt: new Date().toISOString(),
    } as never)} WHERE id = ${repos[i]!.row.id}`;
  }
};

const analyze: NonNullable<ParticipationMode["analyze"]> = async (articleId, opts) => {
  const result = await analyzeShowcaseArticle(articleId, opts);
  if (!result) return null;
  return { stale: result.stale, relevance: result.output?.relevance ?? "unknown" };
};

export const showcaseServer: ServerModule = {
  name: "showcase",
  participationModes: {
    showcase: { shapeListing, afterListing, analyze },
  },
};

export default showcaseServer;
