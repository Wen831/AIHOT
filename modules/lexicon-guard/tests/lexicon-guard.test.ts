// The guard over analysis material: synthetic words only (random-looking markers, never a real
// list) prove the loading rules, the whitelist, the reason shape — and that an installed guard
// short-circuits runAnalysis before any model step.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installModules } from "@aihot/backend/modules";
import { runAnalysis } from "@aihot/backend/editorial/analyze";
import type { AnalyzeInputArticle } from "@aihot/backend/editorial/input";
import { buildGuard, tempLexicon } from "../guard.ts";

const clean = "a plain headline about a match and its report";

test("hits block with the field they are in, title first", () => {
  const { guard } = tempLexicon({ "list.txt": ["zqguardmark"] });
  assert.equal(guard.screen({ title: `x zqguardmark y`, summary: "", body: "" }), "lexicon:title");
  assert.equal(guard.screen({ title: clean, summary: "zqguardmark", body: "zqguardmark" }), "lexicon:summary");
  assert.equal(guard.screen({ title: clean, summary: "", body: `body text zqguardmark more` }), "lexicon:body");
});

test("clean material passes", () => {
  const { guard } = tempLexicon({ "list.txt": ["zqguardmark", "anothermark"] });
  assert.equal(guard.screen({ title: clean, summary: clean, body: clean }), null);
});

test("a whitelist word alone does not block, beside it still does", () => {
  const { guard } = tempLexicon({ "list.txt": ["zqguardmark", "anothermark"], "whitelist.txt": ["zqguardmark"] });
  assert.equal(guard.screen({ title: "zqguardmark", summary: "", body: "" }), null);
  assert.equal(guard.screen({ title: "zqguardmark anothermark", summary: "", body: "" }), "lexicon:title");
});

test("list files: comments and blanks skipped, words lower-cased, all files loaded", () => {
  const { guard } = tempLexicon({ "a.txt": ["# comment", "", "  zqguardmark  "], "b.txt": ["AnotherMark"] });
  assert.equal(guard.screen({ title: "has ZQGUARDMARK inside", summary: "", body: "" }), "lexicon:title");
  assert.equal(guard.screen({ title: clean, summary: "", body: "anothermark" }), "lexicon:body");
});

test("an empty or missing lexicon leaves the guard installed but inactive", () => {
  assert.equal(buildGuard(tempLexicon({}).dir).screen({ title: "zqguardmark", summary: "x", body: "y" }), null);
});

test("an installed guard blocks the analysis run before any model step", async () => {
  const { guard } = tempLexicon({ "list.txt": ["zqguardmark"] });
  installModules([{ name: "lexicon-guard-test", localGuard: guard }]);
  try {
    const input = { title: "zqguardmark", excerpt: null, bodyText: null } as unknown as AnalyzeInputArticle;
    const run = await runAnalysis(input);
    assert.equal(run.prefilter.label, "BLOCK");
    assert.equal(run.prefilter.reason, "lexicon:title");
    assert.equal(run.prefilter.model, "local-guard");
    assert.equal(run.prefilter.receiptId, 0);
    assert.equal(run.scores, null);
    assert.equal(run.writing, null);
    assert.equal(run.structure, null);
  } finally {
    installModules([]);
  }
});
