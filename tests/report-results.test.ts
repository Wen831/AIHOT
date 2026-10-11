// The industry's 赛果 section (industry/taxonomy.ts RESULT_SECTION): a daily's own section for the
// window's tagged results that scored past the floor but were never selected — best first, capped,
// not repeated from what this issue or recent issues already carry, and never a weekly/monthly candidate.
import { editionAt, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { composeDaily } from "@aihot/backend/reports/compose";
import { periodEntries } from "@aihot/backend/reports/edition";

const T = tag();
const SOURCE = `report-results-${T}`;
const DATE = "2024-06-05";
/** Half a day before the edition time: inside the issue's window. */
const at = editionAt("daily", DATE, -12 * 3600);

/** A publications row in the window; selected items are main entries, unselected ones 赛果 material.
 * Unselected items carry no release time (they are listed as soon as they exist). */
async function item(id: string, opts: { score: number; selected?: boolean; tags?: string[]; category?: string; factId?: number }) {
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${SOURCE}, ${id}, ${`https://example.com/${id}`}, ${id}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score, category, tags, fact_id)
    VALUES (${id}, ${id}, ${SOURCE}, 'news', ${`https://example.com/${id}`}, ${at}, ${at}, ${at}, true, ${opts.selected ?? false}, ${opts.selected ? at : null}, 'public', ${opts.score}, ${opts.category ?? "match"}, ${opts.tags ?? ["比赛赛果"]}, ${opts.factId ?? null})`;
  if (opts.factId) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${opts.factId}, ${id}, 'report')`;
  return id;
}
const sections = async (key: string) => {
  const [row] = await sql`SELECT content FROM reports WHERE kind = 'daily' AND key = ${key}`;
  return (row!.content as { sections: Array<{ label: string; items: Array<{ itemId: string }> }> }).sections;
};

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode) VALUES (${SOURCE}, 'Report results', 'rss', 'T1_5', 'editorial')`;
});
beforeEach(async () => {
  await sql`DELETE FROM reports`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
});
after(async () => {
  await stopBoss();
  await closeDb();
});

test("the daily ends with a 赛果 section: unselected tagged results past the floor, best first", async () => {
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, title) VALUES (${`fact-${T}`}, ${`事实-${T}`}) RETURNING id`;
  const anchor = await item(`${T}-anchor`, { score: 90, selected: true, factId: fact!.id });
  const twin = await item(`${T}-twin`, { score: 75, factId: fact!.id });
  const high = await item(`${T}-high`, { score: 63 });
  const mid = await item(`${T}-mid`, { score: 57 });
  await item(`${T}-low`, { score: 30 });
  await item(`${T}-untagged`, { score: 70, tags: ["深度/观点"] });
  await composeDaily(DATE);
  const section = (await sections(DATE)).at(-1)!;
  assert.equal(section.label, "赛果");
  assert.deepEqual(section.items.map((i) => i.itemId), [high, mid], "score order, floor and tag respected");
  assert.ok(!section.items.some((i) => i.itemId === anchor), "a selected report stays in its own section");
  assert.ok(!section.items.some((i) => i.itemId === twin), "a report of an already-carried fact does not repeat");
});

test("the section skips what the issue carries and what a recent issue cited", async () => {
  const anchor = await item(`${T}-anchor`, { score: 90, selected: true });
  const cited = await item(`${T}-cited`, { score: 63 });
  await item(`${T}-fresh`, { score: 57 });
  await composeDaily(DATE);
  let section = (await sections(DATE)).at(-1)!;
  assert.equal(section.label, "赛果");
  assert.ok(!section.items.some((i) => i.itemId === anchor));
  // An earlier issue cited the 63-point result: it does not come back the next day.
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${DATE}`;
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
    VALUES ('daily', '2024-06-04', now(), now(), ${sql.json({ sections: [{ label: "国内时政", items: [{ itemId: cited, title: cited }] }] })}, now())`;
  await composeDaily(DATE);
  section = (await sections(DATE)).at(-1)!;
  assert.deepEqual(section.items.map((i) => i.itemId), [`${T}-fresh`]);
});

test("the section holds at most its cap of items", async () => {
  await item(`${T}-anchor`, { score: 90, selected: true });
  for (let i = 0; i < 14; i++) await item(`${T}-r${i}`, { score: 65 - i });
  await composeDaily(DATE);
  const section = (await sections(DATE)).at(-1)!;
  assert.equal(section.label, "赛果");
  assert.equal(section.items.length, 12);
  assert.equal(section.items[0].itemId, `${T}-r0`);
  assert.equal(section.items.at(-1)!.itemId, `${T}-r11`);
});

test("the section's items never become weekly/monthly candidates", async () => {
  const anchor = await item(`${T}-anchor`, { score: 90, selected: true });
  const result = await item(`${T}-high`, { score: 63 });
  await composeDaily(DATE);
  const { entries } = await periodEntries(DATE, DATE);
  const ids = entries.map((e) => e.itemId);
  assert.ok(ids.includes(anchor), "a main entry is a period candidate");
  assert.ok(!ids.includes(result), "a 赛果 item is not");
});
