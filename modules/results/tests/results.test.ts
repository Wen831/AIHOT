// The score source: the feed's positional rows parse into finished matches (the field indexes were
// calibrated against known results), and the stored history answers a daily's window — the feed
// only keeps the rolling day, so the schedule's hourly fetch is what makes the history complete.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { parseFeed, storeMatches, windowMatches } from "../qiumibao.ts";

after(async () => {
  await stopBoss();
  await closeDb();
});
beforeEach(async () => {
  await sql`DELETE FROM result_matches`;
});

/** A feed row in the shape calibration confirmed: positions 0/1/3/5/6/13/27 are id/league/kickoff/teams/finished/round. */
const row = (over: { id: number; league: number; kickoff: number; home: [number, string, number]; away: [number, string, number]; finished: number; round?: string }) => {
  const m: unknown[] = Array.from({ length: 28 }, (_, i) => (i === 5 || i === 6 ? [] : 0));
  m[0] = over.id;
  m[1] = over.league;
  m[3] = over.kickoff;
  m[5] = over.home;
  m[6] = over.away;
  m[13] = over.finished;
  m[27] = over.round ?? "";
  return m;
};

const feed = {
  leagues: { "613": ["西甲", 1, 45], "24": ["英超", 1, 45], "600": ["中超", 1, 45] },
  matches: [
    row({ id: 2075490, league: 613, kickoff: 1792350000, home: [1962, "皇家马德里", 4], away: [5395, "塞维利亚", 1], finished: 1, round: "第9轮" }),
    row({ id: 2274946, league: 600, kickoff: 1792349100, home: [1, "上海海港", 3], away: [2, "成都蓉城", 0], finished: 1 }),
    row({ id: 2275000, league: 24, kickoff: 1792687500, home: [3, "狼队", 0], away: [4, "朴茨茅斯", 0], finished: 0 }),
    "junk",
  ],
};

test("parseFeed takes the finished matches with league and round, skips the rest", () => {
  const parsed = parseFeed(feed);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    id: 2075490, league: "西甲", round: "第9轮", home: "皇家马德里", away: "塞维利亚",
    homeScore: 4, awayScore: 1, startAt: new Date(1792350000_000),
  });
  assert.equal(parsed[1]!.league, "中超");
  assert.equal(parsed[1]!.round, "");
});

test("stored matches answer the daily's window, and a re-store updates rather than duplicates", async () => {
  const parsed = parseFeed(feed);
  assert.equal(await storeMatches(parsed), 2);
  const from = new Date(Date.UTC(2026, 0, 1));
  const all = await windowMatches(from, new Date(from.getTime() + 365 * 86400_000));
  assert.equal(all.length, 2);
  assert.equal(Number(all[0]!.id), 2075490); // latest kickoff first
  // The window is kickoff-based: a day later both are outside it.
  const day = await windowMatches(new Date(1792400000_000), new Date(1792500000_000));
  assert.equal(day.length, 0);
  await storeMatches([{ ...parsed[0]!, homeScore: 5 }]);
  const [row5] = await sql<{ home_score: number }[]>`SELECT home_score FROM result_matches WHERE id = 2075490`;
  assert.equal(row5!.home_score, 5);
});
