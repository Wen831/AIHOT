// 主题页“大事记”的行业规则。通用的几步在框架里（packages/backend/src/publication/topic-chronicle.ts）：
// 从近 12 个月已公开的精选里，按这里的规则定类型，比精选分门槛，把同一件事并成一个节点，按每月名额取舍，
// 再写成事件名；公司主题只收这家公司自己的（看事实主体，没有主体时看标题在发布动作之前先点名谁）。
// 换行业时改这个文件：节点类型（名称、门槛、名额、画在哪一行）、内容形态主题收哪些类型、发布动作、
// 一篇报道算哪类节点。合并同一发布、写事件名两项可选，删掉就用框架的做法：只合并标题或事件名相同的，
// 事件名取标题的第一句。
// 公司编年史还可以接上人工整理的历史：industry/chronicles/{主题 slug}.json，格式见 docs/customize.md。

import { ENTITIES } from "./taxonomy.ts";

/** 主题的分组（topics.json 的 group）：公司、方向、内容形态。 */
type Group = "company" | "field" | "genre";

/** 一类节点。 */
export interface ChronicleKind {
  /** 卡片和时间轴上的类型名。 */
  label: string;
  /** 公司编年史里排在时间轴上方一行（足球：签约），标记最醒目；其余类型在下方一行。 */
  above?: true;
  /** 主题自己推出的东西（足球：签约、帅位），用强调色标记；公司主题只收这家俱乐部自己官宣的。其余类型算新闻，公司主题只收以这家俱乐部为主体的。 */
  launch?: true;
  /** 公司主题收这类节点的精选分门槛和每月名额（各类型分开取，互不挤占）；不写就不收。 */
  company?: { min: number; perMonth: number };
  /** 方向和形态主题收这类节点的精选分门槛（这些主题每月按重要程度取前 5 件）；不写就不收。 */
  other?: { min: number };
}

/** 规则读到的一篇入选报道。 */
export interface ChronicleItem {
  title: string;
  /** 外文报道的原标题。 */
  originalTitle: string | null;
  category: string | null;
  tags: string[];
  /** 属于这个行业最受关注的那类发布（taxonomy.ts 的 RELEASE）。 */
  release: boolean;
  /** 结构化抽取出的事实动作，比如 launch、opinion。 */
  factAction: string | null;
}

/** 一个候选节点：代表报道、事件名和它的全部报道。 */
export interface ChronicleEvent {
  kind: string;
  label: string;
  head: { title: string };
  reports: ReadonlyArray<{ title: string }>;
}

export interface ChronicleRules {
  /** 节点类型。公司主题的搜索摘要按这里的先后列出。 */
  kinds: Record<string, ChronicleKind>;
  /** 内容形态主题的大事记收哪些类型，每月最多几件（默认 5）；没列出的形态主题不设大事记，直接读精选。 */
  forms: Record<string, { kinds: string[]; perMonth?: number }>;
  /** 发布动作。公司主题遇到没有事实主体的报道，看标题在它之前先点名的是哪家公司。 */
  launchVerb: RegExp;
  /** 一篇报道在这一组主题里算哪类节点；不论分数高低都不算节点时返回 null（传闻、前瞻、盘点……）。 */
  kindOf(item: ChronicleItem, group: Group): string | null;
  /** 可选：同一周、同一类型的两个节点是不是同一件事（归组漏掉的同一官宣）。 */
  sameEvent?(a: ChronicleEvent, b: ChronicleEvent): boolean;
  /** 可选：节点在时间轴上的名字（“签下姆巴佩”），由代表报道的标题得出。 */
  eventName?(title: string, kind: string, topic: { slug: string; orgNames: readonly string[] }): string;
}

// ── 哪些报道算节点 ──────────────────────────────────────────────────────────────────────

/** 官宣动作的说法：标题里动作之前先点名的俱乐部，就是官宣的发起方。 */
const ANNOUNCED = "官宣|签下|签入|续约|任命|正式任命|上任|官宣上任|解约|解聘|下课";
/** 讲的是这次签约或换帅，但还没发生。 */
const RUMOUR = /即将|传闻|接近|有意|或将|将[^，,。；;]{0,8}(?:签下|官宣|上任|加盟)|谈判|报价|求购|接触|here\s?we\s?go|flag|coming|前瞻|预热|巡礼|展望|[？?]$/i;
/** 汇总多篇的合集，无论分数多高都不算一次签约。 */
const ROUNDUP = /官宣汇总|转会汇总|转会一览|官宣合集|盘点|十大|合集|总结|收官战报|一夜|今夜/;
/** 看的素材和盘口：标题没有官宣动作时，讲得再多也不是事件（官宣附带集锦不受影响）。 */
const MATERIAL = /集锦|视频|图集|海报|壁纸|混剪|高光|赔率|指数|预测|竞猜/;
const COMMENTARY_ACTION = /^(?:opinion|analysis|commentary|prediction|tutorial|介绍|讲解|分享|评测|测评|回顾|复盘)(?:\b|功能|方法|$)/i;

/**
 * 签约、夺冠、关键赛果和帅位变动是节点；俱乐部主题里的赛果新闻是这家俱乐部的大事。
 * 国内新闻类（时政、社会、财经、科技、国际）与足球大事记无关，返回 null。
 */
function kindOf(item: ChronicleItem, group: Group): string | null {
  if (item.tags.includes("深度/观点")) return null; // 复盘、解读、访谈再深也不算大事
  let kind: string | null;
  if (item.category === "transfer") kind = "signing";
  else if (item.category === "match") kind = /夺冠|捧杯|加冕|卫冕|晋级|出线|提前(?:一轮)?(?:夺冠|降级)|破纪录|创造历史/.test(item.title) ? "trophy" : "result";
  else if ((item.category === "club" || item.category === "national") && item.tags.some((t) => t === "教练变动")) kind = "coaching";
  else return null;
  if (kind !== "signing" && kind !== "coaching") return kind;
  if (RUMOUR.test(item.title) || ROUNDUP.test(item.title) || COMMENTARY_ACTION.test(item.factAction ?? "")) return null;
  return launched(item.title) || !MATERIAL.test(item.title) ? kind : null;
}

// ── 同一次官宣 ──────────────────────────────────────────────────────────────────────────

const plain = (title: string) => title.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
/** 去掉全部官宣动作的事件名：“签下姆巴佩”和“官宣签下姆巴佩”是同一笔签约。 */
const unlaunched = (label: string) => label.replace(/正式|官宣|签下|签入|续约|任命|上任|加盟/gu, "");

/** 事件名去掉官宣动作后相同（“官方：签下姆巴佩”和“姆巴佩加盟官宣”按 label 归并靠框架，这里兜底同尾动词）。 */
function sameEvent(a: ChronicleEvent, b: ChronicleEvent): boolean {
  return plain(unlaunched(a.label)) === plain(unlaunched(b.label));
}

// ── 事件名 ──────────────────────────────────────────────────────────────────────────────
// 大事记写事件名（“签下姆巴佩”“哈维·阿隆索上任”），新闻标题留给报道本身。

/** 标题第一个分句在哪里结束：逗号（数字里的不算）、冒号、分号、句号、破折号或竖线。 */
const CLAUSE = /[，：；。！？｜|]|(?<!\d),|,(?!\d)|[:;!?](?=\s|$|\p{Script=Han})|——|\s[-—–]\s/u;
/** 新闻保留到第一个逗号或句号。 */
const SENTENCE = /[，；。！？]|(?<!\d),|,(?!\d)|[;!?](?=\s|$|\p{Script=Han})/u;
const LAUNCH_VERB = "(?:正式)?(?:官宣签下|官宣续约|官宣任命|官宣|签下|签入|续约|任命|上任)";
/** 以动作开头的标题（“官宣 X”“签下 X”）。 */
const LEADING_VERB = new RegExp(`^(${LAUNCH_VERB})\\s*(.+)$`, "u");
/** 官宣的东西在第二个动作开始的地方结束（“签下姆巴佩并出租青训小将”）。 */
const SECOND_ACTION = /并|同时|随|外加/u;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 说了官宣了什么（“官宣”单用是公告整体，不是官宣动作）。 */
const launched = (c: string) => /官宣|签下|签入|续约|任命|上任|加盟|夺冠|捧杯|晋级|出线/.test(c);

type Topic = { slug: string; orgNames: readonly string[] };
const companyForms = new Map<string, { says: RegExp; opens: RegExp } | null>();
/**
 * 俱乐部自己的公告（“<它>官宣签下 X”）和以它的名字开头的说法。
 * 非俱乐部主题（转会窗、赛事）没有自己的 orgNames，用全部俱乐部的名字：事件名统一去掉发起方，
 * 同一笔签约在俱乐部页和其他主题页的 label 才一致，同一周内才能并成一个节点。
 */
function ownForms(t: Topic) {
  if (!companyForms.has(t.slug)) {
    const own = [...t.orgNames];
    const names = (own.length ? own : Object.values(ENTITIES).flatMap((e) => [e.name, ...e.aliases]))
      .sort((a, b) => b.length - a.length).map(escape).join("|");
    companyForms.set(t.slug, names ? {
      says: new RegExp(`^(${names})\\s*(?:官方)?[：:]?\\s*(${LAUNCH_VERB})[：:]?\\s*(.+)$`, "u"),
      opens: new RegExp(`^(?:${names})\\s*(?:官方)?(?:\\s*[：:]\\s*|\\s+(?=${LAUNCH_VERB})|(?=\\p{Script=Han}))`, "u"),
    } : null);
  }
  return companyForms.get(t.slug)!;
}

/** 在俱乐部自己的主题页上，名字去掉俱乐部（“皇马官宣签下姆巴佩”写成“签下姆巴佩”）。 */
function withoutCompany(t: Topic, clause: string): string {
  const opening = ownForms(t)?.opens.exec(clause);
  const rest = opening ? clause.slice(opening[0].length).trim() : "";
  return [...rest].length >= 2 ? rest : clause;
}

/** 说出事件的那个分句：跳过冒号前的标签、说话人或独占一逗号的动词（“官方：”“官宣：阵容公布”）。 */
function namingClause(title: string): string {
  const [first = title, next] = title.split(CLAUSE).map((c) => c.replace(/\s*[（(][^（）()]*[）)]\s*$/u, "").trim()).filter(Boolean);
  // 接着上一句往下说的分句（“并官宣 X”）自己说不出事件。
  const second = next && !/^(?:并|且|还|同时|以|为|由|但|而)/u.test(next) ? next : undefined;
  const body = (c: string) => c.replace(/官宣|签下|签入|续约|任命|上任|加盟|正式/gu, "").trim();
  if (!body(first)) return second && body(second) ? second : title.trim();
  return launched(first) ? first : second && launched(second) && body(second) ? second : title.trim();
}

/** 事件名：官宣的写“动作+对象”（“签下姆巴佩”），其余取说出事件的分句；在俱乐部自己的页上不写俱乐部。 */
function eventName(title: string, kind: string, t: Topic): string {
  const clause = namingClause(title);
  const own = ownForms(t)?.says.exec(clause);
  if (own) return `${own[2]}${own[3]!.split(SECOND_ACTION)[0]!.trim()}`;
  const lead = LEADING_VERB.exec(clause);
  if (lead) return `${lead[1]}${lead[2]!.split(SECOND_ACTION)[0]!.trim()}`;
  return withoutCompany(t, clause);
}

export const CHRONICLE: ChronicleRules = {
  kinds: {
    signing: { label: "签约", above: true, launch: true, company: { min: 70, perMonth: 3 }, other: { min: 75 } },
    coaching: { label: "帅位", launch: true, company: { min: 80, perMonth: 1 }, other: { min: 80 } },
    trophy: { label: "夺冠", company: { min: 80, perMonth: 1 }, other: { min: 80 } },
    result: { label: "赛果", company: { min: 75, perMonth: 2 }, other: { min: 85 } },
  },
  forms: {
    "transfer-window": { kinds: ["signing"], perMonth: 8 },
    "match-reports": { kinds: ["result"] },
    "ballon-dor": { kinds: ["trophy"] },
  },
  launchVerb: new RegExp(ANNOUNCED, "i"),
  kindOf,
  sameEvent,
  eventName,
};
