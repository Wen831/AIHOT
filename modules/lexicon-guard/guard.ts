// The lexicon guard itself: word lists from lexicon/*.txt (one word a line, # comments), the hit
// words of lexicon/whitelist.txt exempt. What it hits is blocked before any model step, and the
// analysis record stores only "lexicon:<field>" — the words it hit never reach the database.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Mint } from "mint-filter";

const LEXICON_DIR = fileURLToPath(new URL("./lexicon", import.meta.url));
const WHITELIST_FILE = "whitelist.txt";

const wordsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"));

export interface LexiconGuard {
  screen: (input: { title: string; summary: string; body: string }) => string | null;
}

/**
 * Builds the guard from a lexicon directory (the module's own by default). An empty or missing
 * lexicon yields a guard that lets everything pass: the module is installed but inactive, and a
 * line says so, because a silently dead guard is a deployment puzzle.
 */
export function buildGuard(dir: string = LEXICON_DIR): LexiconGuard {
  const lists = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".txt") && f !== WHITELIST_FILE).sort() : [];
  const words = new Set(lists.flatMap((f) => wordsOf(join(dir, f))));
  const whitelist = new Set(existsSync(join(dir, WHITELIST_FILE)) ? wordsOf(join(dir, WHITELIST_FILE)) : []);
  if (!words.size) {
    console.warn(`lexicon-guard: no words under ${dir}; the guard is installed but inactive`);
    return { screen: () => null };
  }
  const mint = new Mint([...words]);
  return {
    screen: ({ title, summary, body }) => {
      const fields: Array<[name: string, text: string]> = [["title", title], ["summary", summary], ["body", body]];
      for (const [name, text] of fields) {
        if (!text) continue;
        const hits = mint.filter(text.toLowerCase(), { replace: false }).words;
        if (hits.some((word) => !whitelist.has(word.toLowerCase()))) return `lexicon:${name}`;
      }
      return null;
    },
  };
}

/** A throwaway lexicon for tests: each list a map from file name to its lines. */
export function tempLexicon(lists: Record<string, string[]>): { dir: string; guard: LexiconGuard } {
  const dir = mkdtempSync(join(tmpdir(), "lexicon-guard-"));
  for (const [name, lines] of Object.entries(lists)) writeFileSync(join(dir, name), lines.join("\n") + "\n", "utf8");
  return { dir, guard: buildGuard(dir) };
}
