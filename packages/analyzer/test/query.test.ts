import { describe, expect, it } from "vitest";
import { ideaFromQuery, MAX_IDEA_CHARS } from "../web/src/query.js";

describe("?idea= prefill", () => {
  it("reads, trims and caps the pitch; null when absent or blank", () => {
    expect(ideaFromQuery("?idea=%20An%20AI%20that%20scores%20CVs%20for%20EU%20employers%20")).toBe("An AI that scores CVs for EU employers");
    expect(ideaFromQuery("?idea=" + "x".repeat(MAX_IDEA_CHARS + 50))).toHaveLength(MAX_IDEA_CHARS);
    expect(ideaFromQuery("?idea=%20%20")).toBeNull();
    expect(ideaFromQuery("?mock=1")).toBeNull();
  });
});
