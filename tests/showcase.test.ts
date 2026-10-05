// The showcase source reads like a pool category but never reaches the daily report, the heat or
// selection: collection caps a round, stored repos yield their slot to new ones, the rendered README
// is truncated before storage, and the publication rules let a written showcase item into /all with
// a detail page.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";
import { hasItemPage, isPoolEligible } from "@aihot/backend/publication/rules";

const T = tag();
const README = "A rendered README with plenty of material to read about the project and its usage. ".repeat(200);
let feedItems: string[] = [];

const item = (i: number) =>
  `<item><title>owner/repo-${i} ${T}</title><link>https://github.com/owner/repo-${i}</link>` +
  `<description><![CDATA[<p>The README of repo ${i}. ${README}</p>]]></description></item>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/rss+xml" });
  res.end(req.url === "/feed.xml" ? `<?xml version="1.0"?><rss version="2.0"><channel><title>gh</title>${feedItems.join("")}</channel></rss>` : "");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;

const SOURCE_ID = `test-showcase-${T}`;
before(async () => {
  feedItems = Array.from({ length: 14 }, (_, i) => item(i));
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, next_fetch_at)
            VALUES (${SOURCE_ID}, 'GitHub Trending', 'rss', ${sql.json({ feedUrl: `${base}/feed.xml`, summaryIsBody: true, _aihot: { maxItemsPerRound: 10 } })}, 'EXCLUDE_MP', 'showcase', '2100-01-01')`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
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

  // The next day's feed: the ten repos already stored plus four new ones — the slots go to the new.
  feedItems = [...Array.from({ length: 10 }, (_, i) => item(i)), item(100), item(101), item(102), item(103)];
  const second = await collectSource(SOURCE_ID, { force: true });
  assert.equal(second.status, "ok");
  assert.equal(second.created, 4);
  const total = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM articles WHERE source_id = ${SOURCE_ID}`;
  assert.equal(total[0]!.count, 14);
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
