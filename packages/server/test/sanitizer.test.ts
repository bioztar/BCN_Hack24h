import { describe, expect, it } from "vitest";
import { speakable } from "../src/engine.js";
import { rewordWithout, unbackedCitations, validateLine } from "../src/validator.js";
import { corpus, makeApp } from "./helpers.js";

describe("citation sanitizer matches standalone references only", () => {
  it("leaves words that merely start with Art/Annex alone", () => {
    for (const t of ["The European Artificial Intelligence Board has spoken.", "THE EUROPEAN ARTIFICIAL INTELLIGENCE BOARD HAS SPOKEN.", "Show me your articles of association.", "The annexed form is missing."]) {
      expect(unbackedCitations(t, [])).toEqual([]);
      expect(validateLine({ text: t, provisions: [] }, corpus).text).toBe(t);
    }
  });

  it("rewords an unbacked Article 5(1)(f) without touching Artificial", () => {
    const t = "The Artificial Intelligence Board cites Article 5(1)(f) and Art. 999.";
    expect(unbackedCitations(t, [])).toEqual(["Article 5(1)(f)", "Art. 999"]);
    expect(validateLine({ text: t, provisions: [] }, corpus).text).toBe("The Artificial Intelligence Board cites.");
    expect(validateLine({ text: "Article 5(1)(f) applies to the Artificial Intelligence Board.", provisions: ["gdpr-5"] }, corpus).text).toBe("Article 5(1)(f) applies to the Artificial Intelligence Board.");
  });

  it("rewordWithout removes whole references, never substrings", () => {
    expect(rewordWithout("Arti and Artificial and Arti.", ["Arti"])).toBe("And Artificial.");
  });

  it("raw ids are stripped, words around them survive", () => {
    expect(speakable("Under gdpr-6 the Artificial Intelligence Board refuses; see ai-act-99.")).toBe("Under the Artificial Intelligence Board refuses; see.");
  });

  it("model lines keep 'Artificial Intelligence Board' end to end", () => {
    const { engine } = makeApp({ llm: null });
    const state = { caseId: "c", officers: ["grandma-gdpr", "auditor-9000"], tier: 2, lines: [], replies: [], submission: { kind: "text", text: "x" } } as never;
    const line = engine.shape({ speaker: "auditor-9000", text: "THE EUROPEAN ARTIFICIAL INTELLIGENCE BOARD OBJECTS. Article 5(1)(f) GDPR APPLIES.", provisions: ["gdpr-5"] }, state, 0);
    expect(line!.text).toBe("THE EUROPEAN ARTIFICIAL INTELLIGENCE BOARD OBJECTS. Article 5(1)(f) GDPR APPLIES.");
  });
});

describe("unbacked citations are deleted, not replaced with a placeholder", () => {
  const clean = (out: string) => {
    expect(out).not.toContain("the relevant provision");
    expect(out).not.toMatch(/\s{2}|\s[.,;:!?]|\b(?:under|per|of|pursuant to)[.,;:!?]|^[,;:]/i);
  };

  it("live rehearsal: 'AI Act Article 5 prohibitions'", () => {
    const t = "You're offering an AI to assess AI Act Article 5 prohibitions.";
    expect(unbackedCitations(t, [])).toEqual(["Article 5"]);
    const v = validateLine({ text: t, provisions: [] }, corpus);
    expect(v.reworded).toBe(true);
    expect(v.text).toBe("You're offering an AI to assess AI Act prohibitions.");
    clean(v.text);
  });

  it("live rehearsal: 'classifies Annex III prohibited practices'", () => {
    const t = "The machine says it classifies Annex III prohibited practices.";
    expect(unbackedCitations(t, [])).toEqual(["Annex III"]);
    const v = validateLine({ text: t, provisions: [] }, corpus);
    expect(v.reworded).toBe(true);
    expect(v.text).toBe("The machine says it classifies prohibited practices.");
    clean(v.text);
  });

  it("drops a dangling under/per/of/pursuant to before end of clause", () => {
    const cases: [string, string, string][] = [
      ["This is prohibited under Article 5.", "Article 5", "This is prohibited."],
      ["Fined per Art. 99, obviously.", "Art. 99", "Fined, obviously."],
      ["You are in breach of Annex III; pay.", "Annex III", "You are in breach; pay."],
      ["Refused pursuant to Article 5(1)(f) and stamped.", "Article 5(1)(f)", "Refused and stamped."],
      ["Under Article 5, you pay.", "Article 5", "You pay."],
      ["Banned (Article 5) forever.", "Article 5", "Banned forever."],
    ];
    for (const [t, c, want] of cases) {
      const out = rewordWithout(t, [c]);
      expect(out).toBe(want);
      clean(out);
    }
  });

  it("keeps the preposition when the clause continues", () => {
    expect(rewordWithout("Per Article 5 rules, you lose.", ["Article 5"])).toBe("Per rules, you lose.");
  });

  it("backed citations are untouched", () => {
    const v = validateLine({ text: "This is prohibited under Article 5.", provisions: ["ai-act-5"] }, corpus);
    expect(v).toMatchObject({ text: "This is prohibited under Article 5.", reworded: false });
  });
});
