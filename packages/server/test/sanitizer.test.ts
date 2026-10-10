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
    expect(validateLine({ text: t, provisions: [] }, corpus).text).toBe("The Artificial Intelligence Board cites the relevant provision and the relevant provision.");
    expect(validateLine({ text: "Article 5(1)(f) applies to the Artificial Intelligence Board.", provisions: ["gdpr-5"] }, corpus).text).toBe("Article 5(1)(f) applies to the Artificial Intelligence Board.");
  });

  it("rewordWithout replaces whole references, never substrings", () => {
    expect(rewordWithout("Arti and Artificial and Arti.", ["Arti"])).toBe("the relevant provision and Artificial and the relevant provision.");
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
