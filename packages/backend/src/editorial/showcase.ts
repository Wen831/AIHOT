// Showcase writing: a showcase source's item (e.g. the daily GitHub trending) is not judged — no
// prefilter, no scores, no structure, no grouping. The summarize route's model writes the Chinese
// introduction from the README the feed carried; the category is fixed by the channel itself.
// Publication keeps showcase out of the daily report, selection and heat (publication/rules.ts,
// events/hot.ts) while isPoolEligible/hasItemPage let it into /all and a detail page.
import { z } from "zod";
import { sql } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { modelFor } from "./models.ts";
import { loadAnalyzeInput, type AnalyzeInputArticle } from "./input.ts";
import { clampText, parseTranslateOutput } from "./writing.ts";
import { promptText, promptVersion } from "./prompts.ts";

const SHOWCASE_PROMPT_VERSION = promptVersion("summarize-github-project");
/** README characters given to the writer; collect.ts truncates the stored body to the same bound. */
const SHOWCASE_BODY_CHARS = 6000;

const SummarizeSchema = z.object({ titleZh: z.string(), summaryZh: z.string(), bodyZh: z.string() });

const subjectOf = (a: AnalyzeInputArticle) => `article:${a.id}@${a.revision}`;
const tagged = (attemptTag: string | undefined, step: string) => [attemptTag, step].filter(Boolean).join(":") || undefined;

export interface ShowcaseResult {
  analysisId: number | null;
  stale: boolean;
  output: { relevance: "pass" | "unknown"; titleZh: string; summaryZh: string; category: string } | null;
  receiptIds: number[];
  reused: boolean;
}

/**
 * Writes the showcase item's Chinese introduction and commits it: relevance "pass" with a usable
 * title and summary, "unknown" without (an empty README commits without a paid call and never
 * loops on retries). Never selected, never grouped — publishArticle alone makes it public.
 */
export async function analyzeShowcaseArticle(articleId: string, opts: { attemptTag?: string } = {}): Promise<ShowcaseResult | null> {
  const a = await loadAnalyzeInput(articleId);
  if (!a) return null;
  const body = a.bodyText || a.excerpt || "";
  const written = body.trim().length < 20
    ? { model: null as string | null, receiptId: null as number | null, reused: true, titleZh: "", summaryZh: "" }
    : await writeShowcase(a, opts);
  const titleZh = collapseWhitespace(written.titleZh);
  const summaryZh = written.summaryZh.trim();
  const relevance = titleZh && summaryZh ? "pass" : "unknown";
  const detail = { writer: "showcase", ...(written.model ? { writerModel: written.model } : {}) };
  const committed = await sql.begin(async (tx) => {
    const [current] = await tx<{ revision: number }[]>`SELECT revision FROM articles WHERE id = ${articleId} FOR UPDATE`;
    const stale = !current || current.revision !== a.revision;
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO analyses (article_id, input_revision, origin, model, prompt_version, receipt_ids, relevance, category, tags,
        subjects, title_zh, summary_zh, reason_zh, score, selected, output)
      VALUES (${articleId}, ${a.revision}, 'model', ${written.model}, ${SHOWCASE_PROMPT_VERSION}, ${written.receiptId ? [written.receiptId] : []},
        ${relevance}, 'github', ${[]}, ${[]}, ${titleZh}, ${summaryZh}, NULL, NULL, false, ${tx.json(detail as never)})
      RETURNING id`;
    if (written.receiptId) await completeReceipt(tx, written.receiptId);
    if (!stale) {
      await tx`UPDATE articles SET processing_state = 'analyzed', processing_error = NULL WHERE id = ${articleId}`;
    }
    return { analysisId: row!.id, stale };
  });
  return {
    analysisId: committed.analysisId,
    stale: committed.stale,
    output: { relevance, titleZh, summaryZh, category: "github" },
    receiptIds: written.receiptId ? [written.receiptId] : [],
    reused: written.reused,
  };
}

async function writeShowcase(a: AnalyzeInputArticle, opts: { attemptTag?: string }) {
  const model = await modelFor("summarize");
  const res = await chatJson({
    model,
    purpose: "summarize_article",
    subject: subjectOf(a),
    promptVersion: SHOWCASE_PROMPT_VERSION,
    system: "",
    user: promptText("summarize-github-project", {
      repoName: a.title,
      title: a.title,
      body: clampText(a.bodyText || a.excerpt || "", SHOWCASE_BODY_CHARS),
    }),
    schema: SummarizeSchema,
    json: false,
    parse: parseTranslateOutput,
    temperature: 0.2,
    maxTokens: 2048,
    attemptTag: tagged(opts.attemptTag, "summarize"),
  });
  const p = res.data;
  return { model: res.model, receiptId: res.receiptId, reused: res.reused, titleZh: p.titleZh || "", summaryZh: p.summaryZh || p.bodyZh || "" };
}
