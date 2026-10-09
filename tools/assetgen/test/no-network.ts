// Tests must never reach a real provider: any unmocked fetch fails loudly.
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`live network call attempted in tests: ${String(input)}`);
}) as typeof fetch;
