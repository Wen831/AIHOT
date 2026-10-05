// The showcase source reads like a pool category but never reaches the daily report, the heat or
// selection: collection caps a round, stored repos yield their slot to new ones, the rendered README
// is truncated before storage, the publication rules let a written showcase item into /all with a
// detail page, and the collection measures the repo's GitHub state (a failure of that leaves the
// item and its stored stats untouched).
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";
import { repoOwnerRepo } from "@aihot/backend/sources/github";
import { hasItemPage, isPoolEligible } from "@aihot/backend/publication/rules";

const T = tag();
const README = "A rendered README with plenty of material to read about the project and its usage. ".repeat(200);
let feedItems: string[] = [];

const item = (i: number) =>
  `<item><title>owner/repo-${i} ${T}</title><link>https://github.com/owner/repo-${i}</link>` +
  `<description><![CDATA[<p>The README of repo ${i}. ${README}</p>]]></description></item>`;

const ghServer = http.createServer((req, res) => {
  // The GitHub API: stats per repo; one stored repo answers 404 to exercise the degradation.
  const repo = (req.url ?? "").startsWith("/repos/") ? (req.url ?? "").slice("/repos/".length) : null;
  res.writeHead(!repo || repo.includes("repo-5") ? 404 : 200, { "content-type": "application/json" });
  res.end(JSON.stringify({ full_name: repo, stargazers_count: 4321, forks_count: 123, language: "Rust" }));
});
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/rss+xml" });
  res.end(req.url === "/feed.xml" ? `<?xml version="1.0"?><rss version="2.0"><channel><title>gh</title>${feedItems.join("")}</channel></rss>` : "");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
await new Promise<void>((resolve) => ghServer.listen(0, "127.0.0.1", () => resolve()));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
process.env.GITHUB_API_BASE = `http://127.0.0.1:${(ghServer.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;

const SOURCE_ID = `test-showcase-${T}`;
const stats = async (title: string) =>
  (await sql<{ showcase_stats: Record<string, any> | null }[]>`SELECT showcase_stats FROM articles WHERE source_id = ${SOURCE_ID} AND title LIKE ${`${title}%`}`)[0]!.showcase_stats;

before(async () => {
  feedItems = Array.from({ length: 14 }, (_, i) => item(i));
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, next_fetch_at)
            VALUES (${SOURCE_ID}, 'GitHub Trending', 'rss', ${sql.json({ feedUrl: `${base}/feed.xml`, summaryIsBody: true, _aihot: { maxItemsPerRound: 10 } })}, 'EXCLUDE_MP', 'showcase', '2100-01-01')`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => ghServer.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("showcase collection caps a round, truncates the README and lets stored repos yield their slot", async () => {
  const first = await collectSource(SOURCE_ID, { force: true });
  assert.equal(first.status, "ok");
  assert.equal(first.found, 14);
  assert.equal(first.created, 10);
  const [stored] = await sql<{ body_text: string }[]>`SELECT body_text FROM articles WHERE source_id = ${SOURCE_ID} ORDER BY title LIMIT 1`;
  assert.ok(stored!.body_text!.length <= 6000);
  // Measured at collection: the new item's baseline is the reading itself.
  const firstStats = await stats("owner/repo-0");
  assert.equal(firstStats!.stars, 4321);
  assert.equal(firstStats!.starsFirst, 4321);
  assert.equal(firstStats!.forks, 123);
  assert.equal(firstStats!.language, "Rust");

  // The next day's feed: the ten repos already stored plus four new ones — the slots go to the new.
  feedItems = [...Array.from({ length: 10 }, (_, i) => item(i)), item(100), item(101), item(102), item(103)];
  const second = await collectSource(SOURCE_ID, { force: true });
  assert.equal(second.status, "ok");
  assert.equal(second.created, 4);
  const total = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM articles WHERE source_id = ${SOURCE_ID}`;
  assert.equal(total[0]!.count, 14);
});

test("a refresh keeps the baseline and adds the current reading; GitHub out of reach leaves both", async () => {
  // A day-old measurement: the next collection within the feed refreshes it, baseline retained.
  const stale = new Date(Date.now() - 13 * 3600_000).toISOString();
  await sql`UPDATE articles SET showcase_stats = ${sql.json({ stars: 4000, starsFirst: 4000, firstAt: stale, forks: 100, language: "Rust", measuredAt: stale } as never)}
            WHERE source_id = ${SOURCE_ID} AND title LIKE 'owner/repo-0%'`;
  await collectSource(SOURCE_ID, { force: true });
  const refreshed = await stats("owner/repo-0");
  assert.equal(refreshed!.stars, 4321);
  assert.equal(refreshed!.starsFirst, 4000);
  assert.ok(Date.parse(refreshed!.measuredAt) > Date.now() - 60_000);

  // The API unreachable (and the measurement stale again): the stored stats stay, nothing breaks.
  process.env.GITHUB_API_BASE = "http://127.0.0.1:9";
  await sql`UPDATE articles SET showcase_stats = ${sql.json({ ...refreshed!, measuredAt: stale } as never)} WHERE source_id = ${SOURCE_ID} AND title LIKE 'owner/repo-0%'`;
  await collectSource(SOURCE_ID, { force: true });
  const degraded = await stats("owner/repo-0");
  assert.equal(degraded!.stars, 4321);
  assert.equal(degraded!.starsFirst, 4000);
  // A repo the API answers 404 for: stored all the same, without stats.
  const [failed] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM articles WHERE source_id = ${SOURCE_ID} AND title LIKE 'owner/repo-5%' AND showcase_stats IS NULL`;
  assert.equal(failed!.count, 1);
  process.env.GITHUB_API_BASE = `http://127.0.0.1:${(ghServer.address() as { port: number }).port}`;
});

test("showcase publication rules: pool eligible on its own copy, with a detail page, never by relevance", async () => {
  assert.equal(isPoolEligible({ participationMode: "showcase", relevance: null, title: "仓库:一句话定位", summary: "介绍" }), true);
  assert.equal(isPoolEligible({ participationMode: "showcase", relevance: null, title: "仓库", summary: null }), false);
  assert.equal(hasItemPage({ visibility: "public", sourceMode: "showcase" }), true);
  assert.equal(hasItemPage({ visibility: "withdrawn", sourceMode: "showcase" }), false);
  // editorial keeps its relevance gate; showcase never turns a missing one into a pass.
  assert.equal(isPoolEligible({ participationMode: "editorial", relevance: "pass", title: "t", summary: "s" }), true);
  assert.equal(isPoolEligible({ participationMode: "editorial", relevance: null, title: "t", summary: "s" }), false);
});

test("repo paths parse from the item URL", () => {
  assert.equal(repoOwnerRepo("https://github.com/antirez/ds4"), "antirez/ds4");
  assert.equal(repoOwnerRepo("https://github.com/OpenCut-app/OpenCut.git"), "OpenCut-app/OpenCut");
  assert.equal(repoOwnerRepo("https://github.com/owner/repo/releases"), "owner/repo");
  assert.equal(repoOwnerRepo("https://gitlab.com/owner/repo"), null);
});
