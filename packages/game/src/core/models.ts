/** Model pool (data in src/models.json) + per-round picker with a one-Mistral-per-round guarantee. */
import { weightedPick, type Rng } from "./rng.js";

export interface Model {
  id: string;
  name: string;
  maker: string;
  country: string;
  flag: string;
  bg: string;
  fg: string;
  weight: number;
  eu?: boolean;
}

/** If no Mistral has popped by this point, the next pop is Mistral (the gag must land once). */
export const MISTRAL_GUARANTEE_MS = 22_000;

/** Mistral pops once every MISTRAL_EVERY pops on average (±MISTRAL_JITTER), regardless of RNG luck. */
export const MISTRAL_EVERY = 25;
const MISTRAL_JITTER = 5;

export class ModelPicker {
  private sawEu = false;
  private untilEu: number;
  private readonly eu: Model | undefined;
  private readonly others: readonly Model[];

  constructor(
    private readonly rng: Rng,
    pool: readonly Model[],
  ) {
    this.eu = pool.find((m) => m.eu);
    this.others = pool.filter((m) => !m.eu);
    this.untilEu = this.gap();
  }

  private gap(): number {
    return MISTRAL_EVERY - MISTRAL_JITTER + Math.floor(this.rng() * (2 * MISTRAL_JITTER + 1));
  }

  next(elapsedMs: number): Model {
    const due = --this.untilEu <= 0 || (!this.sawEu && elapsedMs >= MISTRAL_GUARANTEE_MS);
    if (this.eu && due) {
      this.sawEu = true;
      this.untilEu = this.gap();
      return this.eu;
    }
    return weightedPick(this.rng, this.others);
  }
}
