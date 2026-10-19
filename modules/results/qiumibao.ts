// The score source: 188bifen's backing feed (the score board the zhibo8 sites share). One JSON
// listing holds every match of the rolling window — the current calendar day onward — so an hourly
// fetch sees each finished match before the day rolls it off; finished ones are stored, and a match
// stored once never depends on the feed again. The rows are positional arrays; the fields used here
// (id, league id, kickoff, teams with scores, finished flag, round) were calibrated against known
// results, and anything in an unexpected shape is skipped rather than guessed at.
import { sql } from "@aihot/backend/db";
import type { ResultMatch } from "@aihot/backend/modules";

const FEED_URL = "https://matchs.qiumibao.com/live/all.htm";

/** Reads the feed's listing: its finished matches as result rows, any league (the daily ranks). */
export function parseFeed(data: unknown): ResultMatch[] {
  const { matches, leagues } = (data ?? {}) as { matches?: unknown[]; leagues?: Record<string, unknown[]> };
  const leagueName = new Map(Object.entries(leagues ?? {}).map(([id, v]) => [Number(id), String(v?.[0] ?? "")]));
  const out: ResultMatch[] = [];
  for (const row of matches ?? []) {
    if (!Array.isArray(row)) continue;
    const [id, leagueId, , kickoff, , home, away, , , , , , , finished, , , , , , , , , , , , , , round] = row;
    if (finished !== 1 || !Number.isFinite(Number(id)) || !Number.isFinite(Number(kickoff))) continue;
    const homeName = Array.isArray(home) ? String(home[1] ?? "") : "";
    const awayName = Array.isArray(away) ? String(away[1] ?? "") : "";
    const homeScore = Array.isArray(home) ? Number(home[2]) : NaN;
    const awayScore = Array.isArray(away) ? Number(away[2]) : NaN;
    if (!homeName || !awayName || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) continue;
    out.push({
      id: Number(id),
      league: leagueName.get(Number(leagueId)) ?? "",
      round: typeof round === "string" ? round : "",
      home: homeName,
      away: awayName,
      homeScore,
      awayScore,
      startAt: new Date(Number(kickoff) * 1000),
    });
  }
  return out;
}

/** The feed's finished football matches, any league: filtering to the reader's leagues is the daily's ranking. */
export async function fetchFinishedMatches(timeoutMs = 15_000): Promise<ResultMatch[]> {
  const res = await fetch(FEED_URL, {
    headers: { "user-agent": "Mozilla/5.0", referer: "https://www.188bifen.com/" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`results feed: HTTP ${res.status}`);
  return parseFeed(await res.json());
}

/** Upserts the fetched matches; the first store of a match stamps when it was seen finished. */
export async function storeMatches(matches: readonly ResultMatch[]): Promise<number> {
  for (const m of matches) {
    await sql`
      INSERT INTO result_matches (id, league, round, home_team, away_team, home_score, away_score, start_at)
      VALUES (${Number(m.id)}, ${m.league}, ${m.round}, ${m.home}, ${m.away}, ${m.homeScore}, ${m.awayScore}, ${m.startAt})
      ON CONFLICT (id) DO UPDATE SET
        league = EXCLUDED.league, round = EXCLUDED.round, home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team,
        home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, start_at = EXCLUDED.start_at, updated_at = now()`;
  }
  return matches.length;
}

/** The finished matches whose kickoff falls in [start, end): the daily's window over the stored history. */
export async function windowMatches(start: Date, end: Date): Promise<ResultMatch[]> {
  const rows = await sql<{ id: string; league: string; round: string; home_team: string; away_team: string; home_score: number; away_score: number; start_at: Date }[]>`
    SELECT id, league, round, home_team, away_team, home_score, away_score, start_at
    FROM result_matches WHERE start_at >= ${start} AND start_at < ${end}
    ORDER BY start_at DESC`;
  return rows.map((r) => ({
    id: r.id,
    league: r.league,
    round: r.round,
    home: r.home_team,
    away: r.away_team,
    homeScore: r.home_score,
    awayScore: r.away_score,
    startAt: r.start_at,
  }));
}
