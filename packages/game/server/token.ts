/** Round tokens: `${game}.${seed}.${issuedAt}.${hmac}` — HMAC-SHA256; TTL per game (whack: 2 min). */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_TTL_MS = 2 * 60 * 1000;

export interface TokenClaims {
  game: string;
  seed: string;
  issuedAt: number;
}

export type VerifyResult = { ok: true; claims: TokenClaims } | { ok: false; reason: "malformed" | "signature" | "expired" };

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function newSeed(): string {
  return randomBytes(8).toString("hex");
}

export function issueToken(secret: string, game: string, seed: string, issuedAt: number): string {
  const payload = `${game}.${seed}.${issuedAt}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyToken(secret: string, token: string, now: number, ttlMs = TOKEN_TTL_MS): VerifyResult {
  const m = /^([a-z]{1,16})\.([0-9a-f]{8,32})\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return { ok: false, reason: "malformed" };
  const [, game, seed, iat, sig] = m as unknown as [string, string, string, string, string];
  const want = Buffer.from(sign(secret, `${game}.${seed}.${iat}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "signature" };
  const issuedAt = Number(iat);
  if (now - issuedAt > ttlMs || issuedAt - now > 5_000) return { ok: false, reason: "expired" };
  return { ok: true, claims: { game, seed, issuedAt } };
}
