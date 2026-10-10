/** Applicants (CONTRACT v2): registration, queue ticket, the better-place skip, selfies. */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import type { ApplicantInput, BetterPlaceCause, BetterPlaceResult, QueueTicket } from "@dg-roast/shared";
import type { Db } from "./db.js";
import { pick } from "./seed.js";

export const CAUSES: readonly BetterPlaceCause[] = ["climate", "lgbtq", "refugees", "homeless", "ukraine", "rare-diseases", "gender-equality", "animal-welfare", "accessibility", "ai-safety"];

/** The joke is the founder's opportunism and the queue, never the cause or the people it serves. */
export const QUIPS: Record<BetterPlaceCause, readonly string[]> = {
  climate: [
    "Carbon-neutral pitch noted. The {skipped} applicants ahead of you have been offset. Walk to the front — the shuttle is under environmental review.",
    "Climate cause verified. Your queue position has been retired to a wind farm in Denmark.",
  ],
  lgbtq: [
    "Rainbow logo detected, in October. Bold. Fast-tracked — your logo's return to grey is scheduled for 1 November.",
    "Allyship registered under form P-38/b. You skip {skipped} people; your cap table still skips everyone.",
  ],
  refugees: [
    "The Ministry is moved. The queue you just skipped has itself applied for asylum: Annex IV missing.",
    "Solidarity logged. You now know what a fast procedure feels like. Nobody else in this building does.",
  ],
  homeless: [
    "Noble. At your burn rate you will share their postcode by Q2. Front of the queue, while you still have a desk.",
    "Housing cause accepted. Your startup will need it after the fine.",
  ],
  ukraine: [
    "Solidarity noted, filed and translated into 24 languages. Position: 1. Your funding: 'under discussion'.",
    "The Commission salutes you. It has also prepared its 19th sanctions package — against your pitch deck.",
  ],
  "rare-diseases": [
    "Orphan cause, orphan startup. The Ministry adopts you both; adoption paperwork takes nine years. Skip granted.",
    "A rare disease and a rare founder: one with a business model. We'll check which.",
  ],
  "gender-equality": [
    "Your slide says 'equality'; your cap table says 'Kevin, Kevin and Kevin'. The irony committee waves you through.",
    "Equality noted. Every founder is now equally {skipped} places behind you.",
  ],
  "animal-welfare": [
    "The Ministry has verified that no animals were harmed in your pitch. Several investors were. Proceed.",
    "Animal welfare accepted. The officers would like to remind you that the cat in the Berlaymont outranks you.",
  ],
  accessibility: [
    "Lovely. Our own forms are accessible only by fax, Wednesdays 10:00–10:15. You go first, as an example.",
    "Accessibility cause registered. The front of the queue has a ramp; the funding does not.",
  ],
  "ai-safety": [
    "An AI startup that cares about AI safety. The AI Act has a recital for that, and a fine. Front of the queue — the officers want a closer look.",
    "AI safety, how reassuring. You are now first in line for a conformity assessment.",
  ],
};

const ETAS = [
  "Estimated decision: Q3 2031",
  "Estimated decision: after the next enlargement",
  "Estimated decision: 14 working days (Brussels calendar, 2047)",
  "Estimated decision: once all 27 member states agree",
  "Estimated decision: before the heat death of the universe (not guaranteed)",
  "Estimated decision: Q1 2029, subject to the 2028 reform of the decision process",
  "Estimated decision: when the fax machine is back from its annual leave",
];

export interface Applicant {
  id: string;
  ticket: number;
  startupName: string;
  founderName: string;
  oneLiner: string | null;
  position: number;
  cause: BetterPlaceCause | null;
  hasPhoto: boolean;
  /** Random id the selfie is served under; the applicantId is public and never used for photos. */
  photoId: string | null;
  caseId: string | null;
  createdAt: number;
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest();

export class InputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Visitor text that ends up on a public screen: control characters out, whitespace collapsed, length capped. */
export function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export const PHOTO_MAX_BYTES = 512 * 1024;
const DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;

/** Re-encode to a ≤512 px JPEG. sharp drops all metadata (EXIF, GPS, ICC) unless asked to keep it; rotate() bakes orientation in first. */
export async function reencodePhoto(dataUrl: string): Promise<Buffer> {
  const m = DATA_URL.exec(dataUrl);
  if (!m) throw new InputError("photo must be a data URL (image/jpeg, image/png or image/webp)");
  const raw = Buffer.from(m[2]!, "base64");
  if (raw.length > PHOTO_MAX_BYTES) throw new InputError("photo is larger than 512 KB; downscale it to 512 px first", 413);
  try {
    return await sharp(raw, { limitInputPixels: 24_000_000 }).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    throw new InputError("photo is not a readable image");
  }
}

interface Row {
  id: string;
  ticket: number;
  startup_name: string;
  founder_name: string;
  one_liner: string | null;
  position: number;
  cause: string | null;
  has_photo: number;
  created_at: number;
  token_hash: string | null;
  photo_id: string | null;
  case_id: string | null;
}

export class ApplicantStore {
  constructor(
    private readonly db: Db,
    private readonly rand: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  async register(input: ApplicantInput | undefined): Promise<{ applicant: Applicant; ticket: QueueTicket }> {
    const startupName = clean(input?.startupName, 60);
    const founderName = clean(input?.founderName, 60);
    if (!startupName) throw new InputError("startupName is required");
    if (!founderName) throw new InputError("founderName is required");
    if (typeof input?.startupName === "string" && input.startupName.trim().length > 60) throw new InputError("startupName is longer than 60 characters");
    if (typeof input?.founderName === "string" && input.founderName.trim().length > 60) throw new InputError("founderName is longer than 60 characters");
    const oneLiner = clean(input?.oneLiner, 140) || null;
    const photo = input?.photo ? await reencodePhoto(input.photo) : null;

    const r = this.rand;
    const token = randomBytes(32).toString("base64url");
    const applicant: Applicant = {
      id: randomUUID(),
      ticket: 10_000 + Math.floor(r() * 990_000),
      startupName,
      founderName,
      oneLiner,
      position: 1_200_000 + Math.floor(r() * 3_600_000),
      cause: null,
      hasPhoto: Boolean(photo),
      photoId: photo ? randomBytes(18).toString("base64url") : null,
      caseId: null,
      createdAt: this.now(),
    };
    const ticket: QueueTicket = { applicantId: applicant.id, applicantToken: token, ticket: applicant.ticket, position: applicant.position, etaText: pick(ETAS, r), countdownSec: 30 + Math.floor(r() * 31) };
    this.db
      .prepare("INSERT INTO applicants (id, ticket, startup_name, founder_name, one_liner, position, cause, has_photo, created_at, token_hash, photo_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)")
      .run(applicant.id, applicant.ticket, startupName, founderName, oneLiner, applicant.position, photo ? 1 : 0, applicant.createdAt, tokenHash(token).toString("hex"), applicant.photoId);
    if (photo) this.db.prepare("INSERT INTO photos (id, jpeg, created_at) VALUES (?, ?, ?)").run(applicant.photoId, photo, applicant.createdAt);
    return { applicant, ticket };
  }

  get(id: string): Applicant | null {
    const row = this.db.prepare("SELECT * FROM applicants WHERE id = ?").get(id) as Row | undefined;
    if (!row) return null;
    return {
      id: row.id,
      ticket: row.ticket,
      startupName: row.startup_name,
      founderName: row.founder_name,
      oneLiner: row.one_liner,
      position: row.position,
      cause: row.cause as BetterPlaceCause | null,
      hasPhoto: row.has_photo === 1,
      photoId: row.photo_id,
      caseId: row.case_id,
      createdAt: row.created_at,
    };
  }

  /** The applicant behind a public id, only with the matching registration token (404 unknown, 403 wrong token). */
  authorize(id: unknown, token: unknown): Applicant {
    const a = typeof id === "string" ? this.get(id) : null;
    if (!a) throw new InputError("unknown applicant", 404);
    const row = this.db.prepare("SELECT token_hash FROM applicants WHERE id = ?").get(a.id) as { token_hash: string | null };
    const want = row.token_hash ? Buffer.from(row.token_hash, "hex") : null;
    if (!want || typeof token !== "string" || !token || !timingSafeEqual(want, tokenHash(token))) throw new InputError("applicantToken missing or wrong", 403);
    return a;
  }

  setCase(id: string, caseId: string): void {
    this.db.prepare("UPDATE applicants SET case_id = ? WHERE id = ? AND case_id IS NULL").run(caseId, id);
  }

  betterPlace(id: string, cause: unknown, token: unknown): BetterPlaceResult {
    if (typeof cause !== "string" || !CAUSES.includes(cause as BetterPlaceCause)) throw new InputError(`cause must be one of: ${CAUSES.join(", ")}`);
    const a = this.authorize(id, token);
    const skipped = Math.max(0, a.position - 1);
    this.db.prepare("UPDATE applicants SET position = 1, cause = ? WHERE id = ?").run(cause, a.id);
    const quip = pick(QUIPS[cause as BetterPlaceCause], this.rand).replaceAll("{skipped}", skipped.toLocaleString("en-GB"));
    return { position: 1, skipped, cause: cause as BetterPlaceCause, quip };
  }

  photo(photoId: string): Buffer | null {
    const row = this.db.prepare("SELECT jpeg FROM photos WHERE id = ?").get(photoId) as { jpeg: Uint8Array } | undefined;
    return row ? Buffer.from(row.jpeg) : null;
  }
}
