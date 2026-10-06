// The module's own prompt, read from its folder and rendered like a pack file. The version is
// `name@hash` over the text, as promptVersion is over the pack's files: any edit is a new version.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promptFromText } from "@aihot/backend/editorial/prompts";

const NAME = "summarize-github-project";
const raw = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "prompts", `${NAME}.md`), "utf8");

export const PROMPT_VERSION = `${NAME}@${createHash("sha256").update(raw).digest("hex").slice(0, 10)}`;
export const prompt = (values: Record<string, string>) => promptFromText(NAME, raw, values);
