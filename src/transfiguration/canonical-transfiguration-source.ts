/** Constructor provenance for the canonical text producer, retained through catalog wrapping. */
import type { EngineCardDefinition } from "../engine/catalog";
import { transfigurationSourceState } from "./transfiguration-logic";

type Producer = NonNullable<EngineCardDefinition["transfigurationState"]>;
const sources = new WeakMap<Producer, Readonly<{ original: string; authored: string | undefined }>>();

/** Only immutable text enters this constructor; callers cannot attest an executable. */
export function canonicalTransfigurationSource(original: string, authored: string | undefined): Producer {
  if (typeof original !== "string" || (authored !== undefined && typeof authored !== "string")) throw new TypeError("Invalid canonical transfiguration text");
  const producer: Producer = (initiallyAmplified, steps) => transfigurationSourceState(original, authored, initiallyAmplified, steps);
  sources.set(producer, Object.freeze({ original, authored }));
  return producer;
}

/** Exact constructor result identity; a copied property is still checked against its owning source. */
export function canonicalTransfigurationText(producer: EngineCardDefinition["transfigurationState"]) {
  return producer === undefined ? undefined : sources.get(producer);
}
