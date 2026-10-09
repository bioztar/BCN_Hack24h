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

export class ModelPicker {
  private sawEu = false;
  constructor(
    private readonly rng: Rng,
    private readonly pool: readonly Model[],
  ) {}

  next(elapsedMs: number): Model {
    const eu = this.pool.find((m) => m.eu);
    const m = !this.sawEu && eu && elapsedMs >= MISTRAL_GUARANTEE_MS ? eu : weightedPick(this.rng, this.pool);
    if (m.eu) this.sawEu = true;
    return m;
  }
}
