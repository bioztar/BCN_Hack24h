/**
 * Hard rules 2 + 4. `ruleCheck` is the cheap deterministic floor (protected-group terms,
 * slur stems, quoting the visitor). `Moderator.forWall` adds a cheap Nebius yes/no call; if
 * that call fails, the rule result stands. Blocked lines never reach the wall.
 */
import type { Llm } from "./llm.js";
import type { Profile } from "./config.js";

const SLUR_STEMS = /\b(n[i1]gg|f[a@]gg?[o0]t|tr[a@]nn(y|ie)|k[i1]ke|sp[i1]c|ch[i1]nk|r[e3]t[a@]rd|wetback|g[o0]ok|towelhead|dyke|paki|gypp?o|kaffir|coon)\w*/i;
const PROTECTED = /\b(race|racial|ethnic\w*|black people|white people|asian|african|arab|jew\w*|muslim\w*|christian\w*|hindu\w*|religio\w*|gay|lesbian|trans(gender)?|queer|homosexual|sexualit\w*|gender|women are|men are|disab\w*|autis\w*|wheelchair|blind|deaf|old (man|woman|people)|too old|too young|fat|ugly|obese|skinny|bald|your (face|body|weight|accent|skin))\b/i;

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

export function ruleCheck(text: string): ModerationResult {
  if (SLUR_STEMS.test(text)) return { ok: false, reason: "slur" };
  if (PROTECTED.test(text)) return { ok: false, reason: "protected-group" };
  return { ok: true };
}

/** Hard rule 4: never the visitor's text. Any 5-word run copied from the visitor blocks the wall. */
export function quotesVisitor(line: string, visitorTexts: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").split(/\s+/).filter(Boolean);
  const words = norm(line);
  const grams = new Set<string>();
  for (let i = 0; i + 5 <= words.length; i++) grams.add(words.slice(i, i + 5).join(" "));
  if (!grams.size) return false;
  for (const v of visitorTexts) {
    const w = norm(v);
    for (let i = 0; i + 5 <= w.length; i++) if (grams.has(w.slice(i, i + 5).join(" "))) return true;
  }
  return false;
}

const SYSTEM = `You are a strict content moderator for a public screen at a comedy event. Reply with exactly one word: ALLOW or BLOCK.
BLOCK if the text contains slurs, or demeans anyone for race, ethnicity, religion, gender, sexuality, disability, age, or body; or contains personal data (names, emails, phone numbers) of a real private person.
Mocking regulations, institutions, startups, business ideas, and the compliance industry is ALLOWED, however harsh.`;

export class Moderator {
  constructor(
    private readonly llm: Llm | null,
    private readonly profile: () => Profile,
  ) {}

  async forWall(text: string, visitorTexts: string[]): Promise<ModerationResult> {
    const rules = ruleCheck(text);
    if (!rules.ok) return rules;
    if (quotesVisitor(text, visitorTexts)) return { ok: false, reason: "quotes-visitor" };
    if (!this.llm) return rules;
    const p = this.profile();
    try {
      let out = "";
      for await (const d of this.llm.stream({ model: p.model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `<text>${text}</text>` }], temperature: 0, maxOutputTokens: 4, timeoutMs: p.timeoutMs, extraBody: p.extraBody, stream: false })) out += d;
      return /BLOCK/i.test(out) ? { ok: false, reason: "model" } : { ok: true };
    } catch {
      return rules;
    }
  }
}
