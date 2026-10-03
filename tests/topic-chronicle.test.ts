// Topic milestones: the rules in publication/topic-chronicle.ts with this pack's industry/chronicle.ts,
// on reports as the topic index reads them. Written from the ways it can go wrong:
// - kinds: a club's month is filled by one kind, so its signings crowd out its results or a trophy
//   displaces both; news about several clubs (a third-party report) shows as one club's own;
// - not a launch: a rumour, a "here we go", an approach in negotiation, a preview, a roundup of
//   twenty announcements, a highlight reel, betting odds or a question-titled explainer counts as a
//   signing, while a transfer that is another club's own announcement loses its place;
// - ownership: a club takes a signing whose title names another club first; a call-up of its player
//   is the national team's own announcement, not the club's;
// - one event: reports of one signing within a week (separate facts, an official announcement and
//   the contract details, a speaker's "官方：" post) stay several milestones; the merged event takes
//   a later date, or a weaker headline although a stronger Chinese one exists;
// - curated history: an older, stronger report in a month a club's curated history covers suppresses
//   the event's automatic milestone after that month;
// - directions: a competition's chronicle fills with general results that carry its tag but do not
//   name it in the title;
// - limits: the transfer timeline keeps no more of a busy month than any other topic; the search
//   snippet's highlights put signings before the club's trophies and results;
// - labels (the chronicle names its events, "官宣签下姆巴佩", not the news headline): a label keeps
//   the headline's claims after its first clause; on a club's own page every label repeats the club
//   ("皇马官宣…"), or a clause that only names the club is taken for the event; a speaker's "官方："
//   or a tag before a colon becomes the label; a clause opening with 并 is taken for the event; a
//   number's comma ("1,600") cuts the clause.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { findTopic, TOPICS } from "@aihot/backend/publication/topics";
import { selectTopicChronicle, selectTopicHighlights, type ChronicleReport } from "@aihot/backend/publication/topic-chronicle";

const NOW = new Date("2026-09-30T20:00:00+08:00");
const window = { now: NOW };
const ALL = TOPICS.map((t) => t.slug);
const topic = (slug: string) => {
  const t = findTopic(slug);
  assert.ok(t, slug);
  return t;
};

let n = 0;
/** A selected report, on 10 September unless `day` says otherwise. */
function report(title: string, o: Partial<ChronicleReport> & { day?: number } = {}): ChronicleReport {
  n += 1;
  const at = new Date(`2026-09-${String(o.day ?? 10).padStart(2, "0")}T12:00:00+08:00`);
  return {
    id: `r${n}`, title, originalTitle: null, category: "transfer", tags: ["转会官宣"], score: 85, topicSlugs: ALL,
    timelineAt: at, publishedAt: at, factPublishedAt: null, firstParty: false, owner: null, factId: null, factSubject: null,
    factAction: null, factOccurredAt: null, storyPublicId: null, sourceCount: 1, scope: "single", ...o,
  };
}
const result = (title: string, o: Partial<ChronicleReport> & { day?: number } = {}) => report(title, { category: "match", tags: ["比赛赛果"], ...o });
const trophy = (title: string, o: Partial<ChronicleReport> & { day?: number } = {}) => report(title, { category: "match", tags: ["比赛赛果", "欧冠"], ...o });
const events = (slug: string, reports: ChronicleReport[]) => selectTopicChronicle(topic(slug), reports, window).flatMap((m) => m.events);
const titles = (slug: string, reports: ChronicleReport[]) => events(slug, reports).map((e) => e.title);

test("a club's month keeps three signings, one trophy and two results, each by score", () => {
  const madrid = { factSubject: "real-madrid", tags: ["转会官宣", "entity:real-madrid"] };
  const reports = [
    report("皇马官宣签下姆巴佩", { ...madrid, score: 90 }), report("皇马官宣签下哈兰德", { ...madrid, score: 85, day: 20 }),
    report("皇马官宣签下维尼修斯续约", { ...madrid, score: 80 }), report("皇马官宣签下青训门将", { ...madrid, score: 75 }),
    trophy("皇马欧冠夺冠，第 16 次捧杯", { ...madrid, score: 90 }), trophy("皇马世俱杯夺冠，击败帕丘卡", { ...madrid, score: 85 }),
    result("皇马 5-2 巴萨", { ...madrid, score: 80 }), result("皇马 2-1 拜仁", { ...madrid, score: 78 }), result("皇马 1-0 小胜弱旅", { ...madrid, score: 76 }),
  ];
  const picked = events("real-madrid", reports);
  const of = (kind: string) => picked.filter((e) => e.kind === kind).map((e) => e.title).sort();
  assert.deepEqual(of("signing"), ["皇马官宣签下哈兰德", "皇马官宣签下姆巴佩", "皇马官宣签下维尼修斯续约"].sort());
  assert.deepEqual(of("trophy"), ["皇马欧冠夺冠，第 16 次捧杯"]);
  assert.deepEqual(of("result"), ["皇马 2-1 拜仁", "皇马 5-2 巴萨"].sort());
  assert.deepEqual(picked.map((e) => e.at), [...picked].sort((a, b) => b.at.localeCompare(a.at)).map((e) => e.at), "newest first within the month");
});

test("what is not a signing stays out, however high its score", () => {
  const out = [
    "皇马即将签下姆巴佩", "皇马将官宣签下哈兰德", "here we go！姆巴佩加盟皇马", "外媒：皇马接触姆巴佩，谈判进行中",
    "冬窗转会前瞻：皇马的五个目标", "德转盘点：皇马近十年十佳引援", "官宣汇总：皇马一夜完成五笔签约", "姆巴佩皇马生涯集锦",
    "博彩公司开出姆巴佩转会赔率", "皇马引援目标解读：谁才是真命天子？",
  ];
  const reports = out.map((title, i) => report(title, { score: 99, day: 1 + i }));
  assert.deepEqual(titles("real-madrid", reports), []);
  assert.deepEqual(titles("transfer-window", reports), [], "nor on the transfer timeline");
  const signing = report("皇马官宣签下姆巴佩，合同五年", { score: 99, day: 25 });
  assert.deepEqual(titles("real-madrid", [...reports, signing]), [signing.title], "a real announcement may carry its contract details");
});

test("a call-up announced by the national team is not the club's signing, but stays one on the transfer timeline", () => {
  const callUp = report("国足官宣征调皇马前锋姆巴佩参加世预赛", { factSubject: "china-national", tags: ["转会官宣", "国足", "entity:china-national", "entity:real-madrid"], owner: "china-national" });
  assert.deepEqual(titles("real-madrid", [callUp]), []);
  assert.deepEqual(titles("china-national", [callUp]), [callUp.title]);
  assert.deepEqual(titles("transfer-window", [callUp]), [callUp.title]);
});

test("a club's signing names the club first, or the club is the fact's subject", () => {
  const swoop = report("巴萨官宣签下皇马追逐已久的巴西边锋", { factSubject: null, tags: ["转会官宣", "entity:barcelona", "entity:real-madrid"] });
  assert.deepEqual(titles("barcelona", [swoop]), [swoop.title]);
  assert.deepEqual(titles("real-madrid", [swoop]), [], "Real Madrid is only named after Barcelona");
  const joint = report("官宣：皇马与巴萨名宿联队慈善赛阵容公布", { factSubject: "real-madrid、barcelona" });
  assert.deepEqual(titles("real-madrid", [joint]), [joint.title]);
  assert.deepEqual(titles("barcelona", [joint]), [joint.title], "both subjects");
});

test("club news is the club's own: its subject, or the only club it is about", () => {
  const probe = result("西甲联盟调查皇马球迷行为", { score: 90, factSubject: "西甲联盟", tags: ["规则/判罚", "entity:real-madrid"] });
  const both = result("皇马巴萨双双被欧足联处罚", { score: 90, tags: ["规则/判罚", "entity:real-madrid", "entity:barcelona"] });
  const deal = result("欧足联官宣皇马与巴萨德比延期举行", { score: 90, factSubject: "real-madrid、barcelona", tags: ["规则/判罚", "entity:real-madrid", "entity:barcelona"] });
  assert.deepEqual(titles("real-madrid", [probe, both]), [probe.title]);
  assert.deepEqual(titles("barcelona", [both]), []);
  assert.deepEqual(titles("barcelona", [deal]), [deal.title]);
  assert.deepEqual(events("real-madrid", [deal]).map((e) => e.kind), ["result"]);
});

test("one signing's reports within a week are one milestone: the earliest date, the strongest Chinese headline", () => {
  const reports = [
    report("皇马签下姆巴佩", { day: 11, score: 77, sourceCount: 3 }),
    report("皇马官宣签下姆巴佩", { day: 12, score: 90, factId: 1 }),
    report("皇马官宣签下姆巴佩，合同五年", { day: 13, score: 80, factId: 2 }),
    report("Real Madrid sign Mbappé", { day: 14, score: 95, storyPublicId: "s-1" }),
    report("官方：皇马签下姆巴佩并公布球衣号码", { day: 14, score: 80, storyPublicId: "s-1" }),
  ];
  const picked = events("real-madrid", reports);
  assert.equal(picked.length, 1);
  assert.equal(picked[0]!.title, "皇马官宣签下姆巴佩", "a plain Chinese headline before higher scores");
  assert.equal(picked[0]!.at.slice(0, 10), "2026-09-11");
  assert.equal(picked[0]!.kind, "signing");
});

test("curated months cannot suppress an event's automatic milestone after the curated boundary", () => {
  const august = new Date("2026-08-20T12:00:00+08:00");
  const older = report("皇马官宣签下姆巴佩", { storyPublicId: "s-curated", score: 95, timelineAt: august, publishedAt: august });
  const newer = report("皇马官宣签下哈兰德", { storyPublicId: "s-curated", score: 80 });
  const picked = selectTopicChronicle(topic("real-madrid"), [older, newer], { now: NOW, through: "2026-08" }).flatMap((m) => m.events);
  assert.deepEqual(picked.map((e) => [e.title, e.at.slice(0, 10)]), [[newer.title, "2026-09-10"]], "automatic selection starts after the curated month, before event deduplication");
});

test("a report naming the signing the same way joins its milestone of the same week, in either order", () => {
  const signing = report("皇马官宣签下姆巴佩：转会费 1.6 亿欧", { day: 3, score: 88 });
  const followUp = report("官宣签下姆巴佩，球衣号码公布", { day: 4, score: 81 });
  const other = report("皇马官宣签下哈兰德", { day: 5 });
  assert.deepEqual(titles("transfer-window", [followUp, signing]), [signing.title], "either order");
  assert.equal(events("real-madrid", [signing, other]).length, 2, "another player stays apart");
});

test("different signings stay apart: another player, weeks apart", () => {
  const pairs: Array<[string, string, ChronicleReport[]]> = [
    ["real-madrid", "another player", [report("皇马官宣签下姆巴佩", { day: 20 }), report("皇马官宣签下哈兰德，五年合同", { day: 24 })]],
    ["barcelona", "weeks apart", [report("巴萨官宣签下尼科·威廉姆斯", { day: 2 }), report("巴萨官宣签下尼科·威廉姆斯正式落地", { day: 20 })]],
  ];
  for (const [slug, why, reports] of pairs) assert.equal(events(slug, reports).length, 2, why);
});

test("a competition's chronicle takes what names the competition, not everything carrying its tag", () => {
  const general = trophy("皇马夺冠，队史第 36 座西甲冠军", { tags: ["比赛赛果", "欧冠", "西甲"], factSubject: "real-madrid" });
  const named = trophy("皇马欧冠夺冠，第 16 次捧起大耳朵杯", { tags: ["比赛赛果", "欧冠"], factSubject: "real-madrid" });
  const match = result("欧冠：巴萨 4-1 拜仁", { tags: ["比赛赛果", "欧冠"] });
  assert.deepEqual(new Set(titles("champions-league", [general, named, match])), new Set([named.title, match.title]));
  assert.deepEqual(events("champions-league", [match]).map((e) => e.kind), ["result"]);
});

test("the transfer timeline keeps eight signings of a busy month, match reports five", () => {
  const clubs = ["皇马", "巴萨", "曼城", "阿森纳", "利物浦", "曼联", "拜仁", "国米", "尤文"];
  const signings = clubs.map((club, i) => report(`${club}官宣签下新援 ${i + 1} 号`, { day: 1 + i * 3, score: 90 - i }));
  assert.equal(events("transfer-window", signings).length, 8);
  const results = clubs.map((club, i) => result(`欧冠：${club} ${i + 1}-0 取胜`, { day: 1 + i * 3, score: 90 - i, tags: ["比赛赛果", "欧冠"] }));
  assert.equal(events("match-reports", results).length, 5);
  assert.ok(!titles("transfer-window", signings).includes(signings[8]!.title), "the least important one drops out");
});

test("a club's highlights lead with its signings, then its trophies and results", () => {
  const reports = [
    result("皇马 5-2 巴萨", { score: 99, factSubject: "real-madrid", day: 25 }),
    trophy("皇马欧冠夺冠", { score: 90, factSubject: "real-madrid", day: 26 }),
    report("皇马官宣签下姆巴佩", { score: 80, factSubject: "real-madrid", day: 27 }),
  ];
  assert.deepEqual(selectTopicHighlights(topic("real-madrid"), reports, window).map((e) => e.kind), ["signing", "trophy", "result"]);
});

test("a milestone reads as the event's name: the headline's first clause, the club left out on its own page", () => {
  const label = (slug: string, title: string, o: Partial<ChronicleReport> = {}) => events(slug, [report(title, o)]).map((e) => e.label)[0];
  const cases: Array<[string, string, string, Partial<ChronicleReport>?]> = [
    ["real-madrid", "皇马官宣签下姆巴佩，合同五年", "官宣签下姆巴佩"],
    ["transfer-window", "皇马官宣签下姆巴佩，合同五年", "官宣签下姆巴佩"],
    ["real-madrid", "皇马官宣签下姆巴佩并公布球衣号码", "官宣签下姆巴佩"],
    ["transfer-window", "官宣签下姆巴佩", "官宣签下姆巴佩"],
    ["real-madrid", "皇马官宣签下姆巴佩，转会费 1,600 万欧", "官宣签下姆巴佩"],
    ["barcelona", "巴萨官宣签下尼科·威廉姆斯", "官宣签下尼科·威廉姆斯"],
    ["real-madrid", "官方：皇马签下姆巴佩", "签下姆巴佩"],
    ["real-madrid", "皇马官宣续约维尼修斯", "官宣续约维尼修斯"],
    ["real-madrid", "姆巴佩自由身加盟皇马", "姆巴佩自由身加盟皇马"],
    ["real-madrid", "官宣：名宿联队慈善赛由皇马与巴萨球员组成", "名宿联队慈善赛由皇马与巴萨球员组成", { factSubject: "real-madrid、barcelona" }],
    ["real-madrid", "皇马欧冠夺冠，第 16 次捧起大耳朵杯", "欧冠夺冠", { category: "match", tags: ["比赛赛果", "欧冠"], factSubject: "real-madrid" }],
    ["champions-league", "皇马欧冠夺冠，第 16 次捧起大耳朵杯", "欧冠夺冠", { category: "match", tags: ["比赛赛果", "欧冠"], factSubject: "real-madrid" }],
  ];
  for (const [slug, title, expected, o] of cases) assert.equal(label(slug, title, o), expected, `${slug}: ${title}`);
  assert.equal(events("real-madrid", [report("皇马官宣签下姆巴佩，合同五年")])[0]!.title, "皇马官宣签下姆巴佩，合同五年", "the headline itself is kept");
});

test("one player whose reports in a week name him the same way is one milestone", () => {
  assert.deepEqual(events("real-madrid", [report("皇马官宣签下姆巴佩：五年合同", { day: 10 }), report("皇马官宣签下姆巴佩，含 80% 肖像权", { day: 11 })]).map((e) => e.label), ["官宣签下姆巴佩"]);
  assert.equal(events("real-madrid", [report("官方：皇马签下姆巴佩", { day: 23 }), report("皇马官宣签下姆巴佩", { day: 24 })]).length, 1, "a speaker's post and the official announcement");
  assert.equal(events("real-madrid", [report("皇马官宣签下姆巴佩", { day: 2 }), report("皇马官宣续约姆巴佩", { day: 5 })]).length, 1, "a new deal for the same player in the same week is the same milestone");
});
