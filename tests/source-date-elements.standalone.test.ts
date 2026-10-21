// Real listing date labels can carry a Unix debugging tooltip, while detail rules can select a
// metadata element. Unlabelled or modified times must not stand in for a publication date.
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchDetail, fromHtml } from "@aihot/backend/sources/web-list";

const html = `<html><head><meta name="date" content="2026-09-11T19:58:33Z"></head><body>` +
  `<article><a href="/post">A real article</a><span title="Unix: 1789171113866">Sep 11, 2026</span></article></body></html>`;
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  if (req.url === "/modified") return res.end(`<meta property="article:modified_time" content="2026-10-14T00:00:00Z"><time itemprop="dateModified" datetime="2026-10-14T00:00:00Z">Updated today</time>`);
  if (req.url === "/unlabelled") return res.end(`<time datetime="2026-10-14T00:00:00Z">2026-10-14</time>`);
  if (req.url === "/published") return res.end(`<time itemprop="datePublished" datetime="2020-02-15T00:00:00Z">Published February 15, 2020</time>`);
  res.end(html);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a listing uses the visible date when its tooltip is not a publication date", () => {
  const items = fromHtml(html, base, { config: { url: base, itemSelector: "article", publishedAtSelector: "span[title^='Unix:']", publishedAtUtcOffset: "+00:00" } } as never);
  assert.equal(items[0]!.publishedAt?.toISOString(), "2026-09-11T00:00:00.000Z");
});

test("a detail date selector reads meta content and an invalid tooltip does not mask visible text", async () => {
  for (const [publishedAtSelector, expected] of [["meta[name='date']", "2026-09-11T19:58:33.000Z"], ["span", "2026-09-11T00:00:00.000Z"]]) {
    const item = await fetchDetail(base + "/post", { config: { detail: { publishedAtSelector, publishedAtAuthoritative: true, publishedAtUtcOffset: "+00:00" } } } as never, { date: true, title: false, summary: false });
    assert.equal(item.publishedAt?.toISOString(), expected);
  }
});

// An article can put its update time first; only explicit publication metadata or a source rule is trusted.
test("generic detail metadata does not promote modified or unlabelled time elements to publication", async () => {
  const source = { config: { detail: { maxFetches: 1 } } } as never;
  for (const path of ["/modified", "/unlabelled"]) {
    const detail = await fetchDetail(base + path, source, { date: true, title: false, summary: false });
    assert.equal(detail.publishedAt, null, path);
  }
  const published = await fetchDetail(base + "/published", source, { date: true, title: false, summary: false });
  assert.equal(published.publishedAt?.toISOString(), "2020-02-15T00:00:00.000Z");
});

// Live-score blocks re-render hrefs without the leading slash: the serialized item HTML then lacks
// the segment the date pattern needs, while the resolved absolute URL keeps it — the URL fallback.
test("a scheme-less relative href still yields the date from the resolved URL path", () => {
  // A listing URL's date segment names a local calendar day, so it parses at the source's offset
  // (00:00 +08:00): reading it as the ISO instant 00:00 UTC put late-night finds 8h in the
  // future, and the pipeline's future tolerance rejected every match-night brief found before
  // 07:00 Beijing time (36 undated on 2026-10-17).
  const listing = `<html><body><li><a href="zuqiu/2026-10-17/native1.htm">比赛短讯标题</a></li></body></html>`;
  const items = fromHtml(listing, "https://news.zhibo8.com/zuqiu/", { config: { url: "https://news.zhibo8.com/zuqiu/", itemSelector: "li", publishedAtRegex: "(?:zhibo8\\.com)?/zuqiu/(\\d{4}-\\d{2}-\\d{2})/" } } as never);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.url, "https://news.zhibo8.com/zuqiu/zuqiu/2026-10-17/native1.htm");
  assert.equal(items[0]!.publishedAt?.toISOString(), "2026-10-16T16:00:00.000Z");
});

test("the URL fallback leaves already-matching href forms unchanged", () => {
  const listing = `<html><body>` +
    `<li><a href="/zuqiu/2026-10-17/2.htm">根相对短讯</a></li>` +
    `<li><a href="https://news.zhibo8.com/zuqiu/2026-10-16/3.htm">绝对地址短讯</a></li>` +
    `</body></html>`;
  const items = fromHtml(listing, "https://news.zhibo8.com/zuqiu/", { config: { url: "https://news.zhibo8.com/zuqiu/", itemSelector: "li", publishedAtRegex: "(?:zhibo8\\.com)?/zuqiu/(\\d{4}-\\d{2}-\\d{2})/" } } as never);
  assert.deepEqual(items.map((i) => i.publishedAt?.toISOString()),
    ["2026-10-16T16:00:00.000Z", "2026-10-15T16:00:00.000Z"]);
});
