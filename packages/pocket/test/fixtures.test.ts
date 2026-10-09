import { describe, expect, it } from "vitest";
import { fineFor, startupName } from "../src/fixtures";

describe("startupName", () => {
  it("finds the name after 'we are' / 'called'", () => {
    expect(startupName("We are Faceify, an app that scans faces")).toBe("Faceify.ai");
    expect(startupName("Our startup is called moodmesh and it reads emotions")).toBe("moodmesh.ai");
    expect(startupName("Hi! We're Kredit.io, credit scoring by vibes")).toBe("Kredit.io");
  });
  it("falls back to a capitalised word, then to the first content words", () => {
    expect(startupName("An app, Snoopr, that reads your email")).toBe("Snoopr.ai");
    expect(startupName("uber for tax audits")).toBe("UberTax.ai");
    expect(startupName("")).toBe("Your Startup");
  });
});

describe("fineFor", () => {
  it("is €35M or 7% of turnover, whichever is higher", () => {
    expect(fineFor()).toBe(35_000_000);
    expect(fineFor(1e10)).toBe(700_000_000);
  });
});
