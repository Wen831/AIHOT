// Failure cases: automatic runs rewrite published issues; report/receipt commits split; empty gaps
// starve later daily/weekly/monthly issues or make a failed run look successful. All use a local model stub.
import { editionAt, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { composeDaily, composeDueReports, composeWeekly, composeMonthly } from "@aihot/backend/reports/compose";

const T = tag();
const SOURCE = `report-recovery-${T}`;
const answer = async (user: string) => ({ title: user.slice(0, 100), leadParagraph: "导语", highlights: [1], headline: "本期进展", overview: "总述", themes: [{ heading: "主题", summary: "摘要", refs: [1] }] });
const provider = await stub(async (_hit, request) => ({
  choices: [{ message: { content: JSON.stringify(await answer(JSON.parse(request.body).messages.at(-1).content)) } }],
}));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${SOURCE}, 'Report recovery', 'rss', 'T1')`;
});
beforeEach(async () => {
  await sql`DELETE FROM reports`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
});
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

/** A selected item in the window of the daily issue dated `date`, half a day before its edition time. */
async function item(date: string) {
  const id = `recovery-${tag()}`;
  const at = editionAt("daily", date, -12 * 3600);
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${SOURCE}, ${id}, 'https://example.com/report', ${id}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score)
    VALUES (${id}, ${id}, ${SOURCE}, 'news', 'https://example.com/report', ${at}, ${at}, ${at}, true, true, ${at}, 'public', 90)`;
  return id;
}
const report = async (kind: string, key: string) => (await sql`SELECT content, revision, generated_at FROM reports WHERE kind = ${kind} AND key = ${key}`)[0];

test("automatic retries preserve all three published issue kinds; explicit corrections keep a revision", async () => {
  const id = await item("2024-02-02");
  for (const [kind, key, compose] of [
    ["daily", "2024-02-02", composeDaily], ["weekly", "2024-W05", composeWeekly], ["monthly", "2024-02", composeMonthly],
  ] as const) {
    await compose(key);
    const saved = await report(kind, key);
    const calls = provider.hits();
    await sql`UPDATE publications SET title = title || ' corrected' WHERE article_id = ${id}`;
    await compose(key);
    assert.deepEqual(await report(kind, key), saved, `${kind}: an automatic retry preserves the edition`);
    assert.equal(provider.hits(), calls, "no model request for an already published edition");
    await compose(key, "editor correction");
    assert.equal((await report(kind, key)).revision, 2);
    const [revision] = await sql`SELECT v.content FROM report_revisions v JOIN reports r ON r.id = v.report_id WHERE r.kind = ${kind} AND r.key = ${key}`;
    assert.deepEqual(revision.content, saved.content);
  }
});

test("report publication and its receipt commit together and recovery reuses the response", async () => {
  await item("2024-05-02");
  await composeDaily("2024-05-02");
  await sql.unsafe(`CREATE FUNCTION fail_report_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status = 'completed' AND NEW.purpose = 'report_weekly' THEN RAISE EXCEPTION 'receipt commit interrupted'; END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER fail_report_receipt BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION fail_report_receipt()`);
  try {
    await assert.rejects(composeWeekly("2024-W18"), /receipt commit interrupted/);
    assert.equal(await report("weekly", "2024-W18"), undefined);
  } finally {
    await sql.unsafe("DROP TRIGGER fail_report_receipt ON receipts; DROP FUNCTION fail_report_receipt()");
  }
  const calls = provider.hits();
  await composeWeekly("2024-W18");
  assert.equal(provider.hits(), calls);
  assert.equal((await report("weekly", "2024-W18")).revision, 1);
  assert.equal((await sql`SELECT status FROM receipts WHERE subject = 'report:weekly:2024-W18'`)[0]!.status, "completed");
});

test("empty older gaps cannot starve a later daily, weekly or monthly, and failures remain visible", async () => {
  // An older issue carried an item; the days after it are empty. Weeklies and monthlies are compiled from dailies.
  const early = await item("2024-01-23");
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
    VALUES ('daily', '2024-01-23', now(), now(), ${sql.json({ sections: [{ label: "国内时政", items: [{ itemId: early, title: early }] }] })}, now())`;
  await item("2024-02-02");
  await assert.rejects(composeDueReports(editionAt("daily", "2024-02-02", 3600)), /reports:/);
  for (const [kind, key] of [["daily", "2024-02-02"], ["weekly", "2024-W04"], ["monthly", "2024-01"]]) {
    assert.ok(await report(kind!, key!), `${kind} ${key} was recovered past the empty gaps`);
  }
});

// An issue older than the data's first day never compiles and is skipped outright (an import brings it
// back); an issue inside the data range that fails gets a doubling pause per failure and is given up
// after six tries — settings holds the counter, the message no longer carries the given-up issue.
test("issues before the data are skipped, an in-range failure backs off and is given up after six", async () => {
  const clear = async () => sql`DELETE FROM settings WHERE key = 'reports.compose.failures'`;
  const monthlyRow = (key: string) => sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
    VALUES ('monthly', ${key}, now(), now(), ${sql.json({})}, now())`;
  await clear();
  try {
    // Data starts 2024-03-05; an older published monthly (2024-01) pulls the loop over the skipped gap.
    await item("2024-03-05");
    await monthlyRow("2024-01");
    await assert.rejects(composeDueReports(new Date("2024-05-02T03:00:00Z")), (e: Error) => {
      assert.match(e.message, /monthly:2024-04/);
      assert.doesNotMatch(e.message, /monthly:2024-02/);
      return true;
    }, "the month before the data is skipped, not failed");
    assert.ok(!(await sql`SELECT 1 FROM settings WHERE key = 'reports.compose.failures' AND value ? 'monthly:2024-02'`).length, "a skipped issue leaves no failure mark");
    // A daily appearing in February moves the data day back: the skipped issue returns and compiles.
    const feb = await item("2024-02-15");
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
      VALUES ('daily', '2024-02-15', now(), now(), ${sql.json({ sections: [{ label: "国内时政", items: [{ itemId: feb, title: feb }] }] })}, now())`;
    await clear();
    // The run still fails on the many empty dailies; the message carries both lists.
    const message = await composeDueReports(new Date("2024-05-02T03:00:00Z")).then(
      () => "",
      (e: Error) => e.message,
    );
    assert.match(message.split(" failed; ")[1] ?? "", /monthly:2024-02/);
    assert.doesNotMatch(message.split(" failed; ")[0], /monthly:2024-01/);
    await clear();
    // The due month 2024-04 holds no dailies: it fails, waits out a doubling pause per failure, and is
    // given up after the sixth attempt (the message stops carrying it, settings keeps the counter).
    await assert.rejects(composeDueReports(new Date("2024-05-02T03:00:00Z")), /monthly:2024-04/);
    // Backoff: a minute later every pause is still elapsing — nothing is retried and nothing failed
    // again; each elapsed pause buys one more try; the sixth failure gives the issue up.
    const quiet = await composeDueReports(new Date("2024-05-02T03:10:00Z")).then(
      (r) => JSON.stringify(r),
      (e: Error) => e.message,
    );
    assert.doesNotMatch(quiet, /monthly:2024-04/, "a pause that has not elapsed skips the retry");
    let t = Date.parse("2024-05-02T03:00:00Z");
    for (let attempt = 2; attempt <= 6; attempt++) {
      t += (2 ** (attempt - 1) * 30 + 1) * 60_000;
      await assert.rejects(composeDueReports(new Date(t)), /monthly:2024-04/, `attempt ${attempt} runs once its pause has elapsed`);
    }
    t += 9 * 3600_000;
    // Given up: the monthly and the given-up daily are gone from the outcome (a new day's empty daily
    // may fail as its own first attempt — that is a fresh failure, not the retried one).
    const outcome = await composeDueReports(new Date(t)).then(
      (r) => JSON.stringify(r),
      (e: Error) => e.message,
    );
    assert.doesNotMatch(outcome, /monthly:2024-04/);
    assert.doesNotMatch(outcome, /daily:2024-05-02/);
    const [mark] = await sql`SELECT (value->'monthly:2024-04'->>'count')::int AS count FROM settings WHERE key = 'reports.compose.failures'`;
    assert.equal(mark!.count, 6);
  } finally {
    await clear();
  }
});
