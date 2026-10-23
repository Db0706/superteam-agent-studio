import { createHmac } from "node:crypto";
import type { Rng } from "./plugin";

/**
 * Deterministic random numbers for hidden test cases. Seeded from the attempt id and a server
 * secret, so a reprocessed attempt sees the same cases, but participants can't predict them.
 */
export function seededRng(seed: string, secret: string): Rng {
  let counter = 0;
  const block = () => createHmac("sha256", secret).update(`${seed}:${counter++}`).digest();
  const next = () => block().readUInt32BE(0) / 0x1_0000_0000;
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T,>(items: readonly T[]) => items[int(0, items.length - 1)],
    shuffle: <T,>(items: readonly T[]) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    id: (prefix: string) => `${prefix}-${block().toString("hex").slice(0, 10)}`,
  };
}
