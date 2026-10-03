// Topic pages: which reports a topic takes (a club's own versus a mention), the chronicle rail
// of a competition, a club's band, a cross-month event, withdrawn reports and the topic index.
import "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { beijingDate } from "@aihot/contracts/time";
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { listTopicSummaries, loadTopicPage, topicsOfStory } from "@aihot/backend/publication/topics";
import { buildApp } from "../apps/api/src/app.ts";
import { tag } from "./setup.ts";

const T = tag();
const OFFICIAL = `test-topics-official-${T}`;
const MEDIA = `test-topics-media-${T}`;
const OTHER = `test-topics-other-${T}`;
const CITY_BLOG = `test-topics-city-blog-${T}`;
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, first_party, next_fetch_at) VALUES
    (${OFFICIAL}, 'Official', 'rss', 'T1', 'editorial', true, '2100-01-01'),
    (${MEDIA}, 'Media', 'rss', 'T2', 'editorial', false, '2100-01-01'),
    (${OTHER}, 'Other media', 'rss', 'T2', 'editorial', false, '2100-01-01')`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, first_party, owner_entity_id, next_fetch_at) VALUES
    (${CITY_BLOG}, 'Club blog', 'rss', 'T1', 'editorial', true, 'man-city', '2100-01-01')`;
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
interface Report {
  source?: string;
  at: Date;
  title: string;
  originalTitle?: string;
  subjects?: string[];
  tags?: string[];
  score?: number;
  selected?: boolean;
  fact?: number;
  category?: string;
}

/** A published report; `fact` links it to a fact before publishing, as grouping would. */
async function report(r: Report): Promise<string> {
  n += 1;
  const category = r.category ?? "transfer";
  const label = ({ "china-politics": "时政要闻", "china-society": "社会热点", finance: "财经商业", tech: "科技数码", international: "国际", match: "比赛赛果", national: "国家队", transfer: "转会官宣" } as Record<string, string | undefined>)[category];
  const { articleId } = await upsertMaterial({
    sourceId: r.source ?? MEDIA, url: `https://example.com/topics-${T}-${n}`, title: r.originalTitle ?? r.title, bodyText: "body", bodyHtml: "<p>body</p>", bodyStatus: "ok", via: "fetch", publishedAt: r.at,
  });
  await sql`UPDATE articles SET discovered_at = ${r.at}, timeline_at = ${r.at}, grouped_at = now() WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, subjects, tags)
            VALUES (${articleId}, 1, 'rule', 'pass', ${category}, ${r.title}, ${`摘要 ${n}`}, ${r.score ?? 80}, ${r.selected ?? true}, ${r.subjects ?? []}, ${[...(label ? [label] : []), ...(r.tags ?? [])]})`;
  if (r.fact) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${r.fact}, ${articleId}, 'report')`;
  await publishArticle(articleId, { releasedAt: new Date(r.at.getTime() + 60_000) });
  return articleId;
}

async function story(title: string): Promise<{ id: number; publicId: string }> {
  const publicId = randomUUID();
  const [s] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (${publicId}, ${title}, now(), now()) RETURNING id`;
  return { id: s!.id, publicId };
}

async function fact(storyId: number | null, title: string): Promise<number> {
  const [f] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`f-${T}-${randomUUID()}`}, ${storyId}, ${title}) RETURNING id`;
  return f!.id;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
const page = async (slug: string, p = 1) => {
  const data = await loadTopicPage(slug, p, new Date());
  assert.ok(data, `${slug} page ${p}`);
  return data;
};
/** Every article of a topic, over all its pages. */
async function members(slug: string): Promise<string[]> {
  const first = await page(slug);
  const out = ids(first.items);
  for (let p = 2; p <= first.pageCount; p++) out.push(...ids((await page(slug, p)).items));
  return out;
}

test("a club topic takes the reports about it, not the ones that only mention it", async () => {
  const about = await report({ at: hoursAgo(30), title: `皇马官宣签下新援 ${T}`, subjects: ["real-madrid"] });
  const product = await report({ at: hoursAgo(31), title: `皇马 B 队联赛战报 ${T}`, category: "match", subjects: ["real-madrid"] });
  const english = await report({ at: hoursAgo(32), title: `皇马官宣续约门将 ${T}`, originalTitle: `Real Madrid extend the keeper ${T}`, subjects: ["real-madrid", "barcelona"] });
  const subpoena = await report({ at: hoursAgo(33), title: `西甲联盟向巴萨发出调查函 ${T}`, subjects: ["barcelona", "real-madrid", "inter"] });
  const lowerCase = await report({ at: hoursAgo(34), title: `real madrid 公布新的球衣供应商 ${T}`, subjects: ["real-madrid", "barcelona"] });
  const pact = await report({ at: hoursAgo(35), title: `二十余家俱乐部联名反对欧超联 ${T}`, subjects: ["barcelona", "real-madrid", "liverpool"] });
  const adjacent = await report({ at: hoursAgo(37), title: `国际米兰官宣签下 AC 米兰旧将 ${T}`, subjects: ["inter", "real-madrid"] });
  const headline = await report({ at: hoursAgo(38), title: `国米被一篇盘点提到 ${T}`, subjects: ["liverpool"] });
  const match = await report({ at: hoursAgo(39), title: `欧冠最新赛况 ${T}`, category: "match", tags: ["欧冠"] });

  const madrid = await members("real-madrid");
  for (const id of [about, product, english, lowerCase]) assert.ok(madrid.includes(id), `about Real Madrid: ${id}`);
  for (const id of [subpoena, pact, headline]) assert.ok(!madrid.includes(id), `only mentions Real Madrid: ${id}`);
  const barca = await members("barcelona");
  for (const id of [subpoena]) assert.ok(barca.includes(id), "about Barcelona");
  for (const id of [english, lowerCase, pact]) assert.ok(!barca.includes(id), "only mentions Barcelona");
  const inter = await members("inter");
  assert.ok(inter.includes(adjacent), "Inter next to Milan's name");
  assert.ok((await members("champions-league")).includes(match), "a competition takes its tag");

  // The article page names the topics it belongs to.
  const topicsOf = async (id: string) => {
    const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
    return (JSON.parse(res.body) as { topics: Array<{ slug: string }> }).topics.map((t) => t.slug);
  };
  assert.deepEqual(await topicsOf(about), ["real-madrid", "transfer-window"]);
  assert.deepEqual(await topicsOf(subpoena), ["barcelona", "transfer-window"]);
  assert.deepEqual(await topicsOf(pact), ["transfer-window"]);
  assert.deepEqual(await topicsOf(match), ["champions-league", "match-reports"]);
});

test("the chronicle keeps each month's most important events, once each, in Beijing months", async () => {
  // The 1st of last month, 00:30 in Beijing (16:30 UTC the day before).
  const today = beijingDate(Date.now());
  const [y, m] = today.split("-").map(Number) as [number, number];
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const firstOfLastMonth = new Date(`${lastMonth}-01T00:30:00+08:00`);
  const at = (minutes: number) => new Date(firstOfLastMonth.getTime() + minutes * 60_000);

  const title = `欧冠决赛皇马夺冠 ${T}`;
  const final = await story(title);
  const finalFact = await fact(final.id, "欧冠决赛");
  const official = await report({ source: OFFICIAL, at: at(0), title, tags: ["欧冠"], score: 95, fact: finalFact, category: "match" });
  await report({ source: OTHER, at: at(5), title: `媒体：皇马捧起队史第 16 座欧冠 ${T}`, tags: ["欧冠"], score: 70, fact: finalFact, category: "match" });
  const gone = await report({ source: MEDIA, at: at(6), title: `撤回的报道：欧冠决赛 ${T}`, tags: ["欧冠"], score: 70, fact: finalFact, category: "match" });
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${gone}`;
  // A second development of the same story the same month.
  const followFact = await fact(final.id, "夺冠游行");
  await report({ at: at(600), title: `皇马欧冠夺冠游行举行 ${T}`, tags: ["欧冠"], score: 60, fact: followFact, category: "match" });
  const minor: string[] = [];
  // Five more eligible results of lower importance; the
  // latest one is the least important.
  for (let i = 0; i < 5; i++) minor.push(await report({ at: at(1000 + i * 60), title: `欧冠小组赛战报 ${i} ${T}`, tags: ["欧冠"], score: 90 - i, category: "match" }));

  const data = await page("champions-league");
  const month = data.chronicle.find((c) => c.month === lastMonth);
  assert.ok(month, "the 1st at 00:30 Beijing time belongs to its own month");
  const listed = month.events.map((e) => e.id);
  assert.equal(month.events.length, 5, "five events a month");
  assert.equal(listed.filter((id) => id === official).length, 1, "the story once, by its most important report");
  assert.ok(!listed.includes(minor[4]!), "the least important event drops out, though it is the latest");
  const lead = month.events.find((e) => e.id === official)!;
  assert.equal(lead.href, `/story/${final.publicId}`, "an event with a public story links to it");
  assert.ok(month.events.find((e) => e.id === minor[0])!.href.startsWith("/items/"), "an event without a story links to the article");
  assert.deepEqual(listed, [...month.events].sort((a, b) => b.at.localeCompare(a.at)).map((e) => e.id), "newest first within a month");
  assert.equal(month.events.find((e) => e.id === minor[0])?.kind, "result", "a competition keeps ordinary results");
  assert.deepEqual(await topicsOfStory(final.id), [{ slug: "champions-league", name: "欧冠" }, { slug: "match-reports", name: "赛果速递" }], "the story page names the topic of its reports");
});

test("a club's band prioritizes signings and coaching moves over results and commentary", async () => {
  const today = beijingDate(Date.now());
  const [y, m] = today.split("-").map(Number) as [number, number];
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const at = (day: number) => new Date(`${lastMonth}-${String(day).padStart(2, "0")}T12:00:00+08:00`);
  const city = { subjects: ["man-city"] };
  const signing = await report({ ...city, at: at(3), title: `曼城官宣签下新援 ${T}`, category: "transfer", score: 90 });
  const coaching = await report({ ...city, at: at(5), title: `瓜迪奥拉与曼城续约至 2029 ${T}`, category: "club", score: 85, tags: ["教练变动"] });
  const news = await report({ ...city, at: at(7), title: `曼城公布年度财报 ${T}`, category: "club", score: 80, tags: ["财政/收购"] });
  const review = await report({ ...city, source: CITY_BLOG, at: at(9), title: `曼城青训体系深度复盘 ${T}`, category: "club", score: 95, tags: ["深度/观点"] });
  const tutorial = await report({ ...city, source: CITY_BLOG, at: at(11), title: `曼城战术板：高位逼抢讲解 ${T}`, category: "club", score: 99, tags: ["深度/观点"] });
  const commentary = await report({ ...city, at: at(13), title: `评论：曼城的建队思路 ${T}`, category: "club", score: 98, tags: ["深度/观点"] });
  const othersReview = await report({ ...city, source: OFFICIAL, at: at(15), title: `另一家媒体写的曼城战术分析 ${T}`, category: "club", score: 97, tags: ["深度/观点"] });

  const data = await page("man-city");
  assert.deepEqual(data.chronicle, [], "a club has its band instead of the monthly rail");
  const month = data.milestones.filter((ms) => ms.date.startsWith(lastMonth));
  const listed = month.map((ms) => ms.href);
  for (const id of [tutorial, commentary, othersReview, review]) assert.ok(!listed.includes(`/items/${id}`), "no tactics talks, nor others' or the club's own commentary");
  assert.deepEqual([...listed].sort(), [signing, coaching].map((id) => `/items/${id}`).sort(), "signings and coaching moves; ordinary club news does not fill an empty slot");
  assert.ok(!listed.includes(`/items/${news}`));
  assert.deepEqual(month.map((ms) => ms.kind), ["signing", "coaching"], "oldest first, each with its kind");
  assert.deepEqual(month.map((ms) => ms.major), [false, false], "nothing picked up automatically is set in bold");
  assert.equal((await page("champions-league")).milestones.length, 0, "a competition has its rail, not a band");
});

test("a cross-month event keeps its first date while all selected progress stays readable", async () => {
  const current = beijingDate(Date.now()).slice(0, 7);
  const after = new Date(new Date(`${current}-01T00:00:00+08:00`).getTime() - 3600_000);
  const representativeMonth = beijingDate(after).slice(0, 7);
  const before = new Date(new Date(`${representativeMonth}-01T00:00:00+08:00`).getTime() - 3600_000);
  const signing = await story(`利物浦官宣签下新援 ${T}`);
  const originalFact = await fact(signing.id, "官宣");
  const followFact = await fact(signing.id, "后续报道");
  const independent = await story(`利物浦独立进展 ${T}`);
  const independentFact = await fact(independent.id, "另一件事");
  const common = { subjects: ["liverpool"], tags: ["英超"] };
  const earlier = await report({ ...common, at: before, title: `英超：利物浦官宣签下新援 ${T}`, score: 80, fact: originalFact });
  const representative = await report({ ...common, at: after, title: `英超：利物浦官宣签下新援详细报道 ${T}`, score: 95, fact: followFact });
  const other = await report({ ...common, at: after, title: `英超：利物浦另一笔独立签约 ${T}`, score: 80, fact: independentFact });

  for (const slug of ["liverpool", "premier-league"]) {
    const data = await page(slug);
    const entries = data.topic.group === "company"
      ? data.milestones.map((m) => ({ href: m.href, title: m.headline, month: m.date.slice(0, 7) }))
      : data.chronicle.flatMap((m) => m.events.map((e) => ({ href: e.href, title: e.title, month: m.month })));
    const kept = entries.filter((e) => e.href === `/story/${signing.publicId}`);
    assert.deepEqual(kept, [{ href: `/story/${signing.publicId}`, title: `英超：利物浦官宣签下新援详细报道 ${T}`, month: beijingDate(before).slice(0, 7) }], `${slug}: one event, the earliest qualifying publication`);
    assert.ok(entries.some((e) => e.href === `/story/${independent.publicId}`), "a different event remains independent");
    const selected = await members(slug);
    for (const id of [earlier, representative, other]) assert.ok(selected.includes(id), "selected progress is not removed by chronicle deduplication");
  }
});

test("withdrawn reports stay out of lists, counts and the chronicle band", async () => {
  const kept = await report({ at: hoursAgo(5), title: `尤文官宣签下新援 ${T}`, subjects: ["juventus"] });
  const withdrawn = await report({ at: hoursAgo(4), title: `尤文撤回的消息 ${T}`, subjects: ["juventus"] });
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${withdrawn}`;

  const data = await page("juventus");
  assert.deepEqual(ids(data.items), [kept]);
  assert.equal(data.topic.total, 1);
  assert.deepEqual(data.milestones.map((m) => m.href), [`/items/${kept}`], "the chronicle band");
  const summary = (await listTopicSummaries()).topics.find((t) => t.slug === "juventus")!;
  assert.equal(summary.latest?.title, `尤文官宣签下新援 ${T}`, "the index shows the newest public article");
});

test("every topic has a page; unknown topics and pages past the end have none", async () => {
  const empty = await page("ballon-dor");
  assert.equal(empty.topic.indexable, false, "a topic without content is not indexed");
  assert.deepEqual(empty.items, []);
  assert.equal(await loadTopicPage("not-a-topic", 1, new Date()), null);
  assert.equal(await loadTopicPage("ballon-dor", 2, new Date()), null);
  const index = await app.inject({ method: "GET", url: "/api/site/topics" });
  const body = JSON.parse(index.body) as { groups: Array<{ key: string }>; topics: Array<{ slug: string }> };
  assert.deepEqual(body.groups.map((g) => g.key), ["company", "field", "genre"]);
  assert.equal(body.topics.length, 27);
});
