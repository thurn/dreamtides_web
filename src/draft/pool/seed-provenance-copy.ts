import type { PoolVariant } from "./types.ts";

/**
 * Player-facing copy for the affinity-grown pool variants — the family that
 * draws one random seed card and grows a pool around it (`seed` plus the
 * pick-record variants `pickfit`/`pickearly`/`pickpos`/`pickchoice`). Every one
 * of these produces a {@link SeedProvenanceSummary}, but they differ in WHERE the
 * affinity signal comes from: `seed` reads IDF-weighted co-occurrence in real
 * decks, while the pick variants read what real drafters took over what they
 * passed. The Pool Viewer's seed line and the "Why Cards" overlay both surface
 * that distinction so the explanation matches the algorithm the run actually
 * used.
 */
export interface SeedProvenanceVariantCopy {
  /**
   * The universe the seed was drawn from, e.g. "every card that sees real play".
   * Slots into "drawn uniformly at random from {seedSource}".
   */
  seedSource: string;
  /**
   * Short clause for the overlay header, after "expanding ", describing what
   * grew the pool — e.g. "by how strongly cards co-occur in real decks".
   */
  headerAffinityTail: string;
  /**
   * Noun phrase for the Pool Viewer seed line, slotting into
   * "grown to N copies (...) by {poolViewerAffinityBasis} to the seed and to the
   * cards already chosen.".
   */
  poolViewerAffinityBasis: string;
  /**
   * Full sentence for the overlay walkthrough's "Affinity" step, describing how
   * every non-seed card was scored. The blend-weight sentence that follows it is
   * shared across variants.
   */
  affinityExplanation: string;
}

const SEED: SeedProvenanceVariantCopy = {
  seedSource: "every card that sees real play",
  headerAffinityTail: "by how strongly cards co-occur in real decks",
  poolViewerAffinityBasis: "IDF-weighted co-occurrence affinity",
  affinityExplanation:
    "Every other card was scored by how strongly it co-occurs with the seed and " +
    "with the cards already chosen in real decks, IDF-weighted so “fits " +
    "with” means “shares distinctive cards” — the same signal " +
    "the deck-fit draft model reads.",
};

const PICKFIT: SeedProvenanceVariantCopy = {
  seedSource: "every card real drafters have picked",
  headerAffinityTail:
    "by how often real drafters took them alongside the cards already in the pool",
  poolViewerAffinityBasis: "draft-pick affinity",
  affinityExplanation:
    "Every other card was scored by pick-record affinity to the seed and to the " +
    "cards already chosen: an availability-corrected play rate plus a behavioural " +
    "synergy estimate from what real drafters took over what they passed.",
};

const PICKEARLY: SeedProvenanceVariantCopy = {
  seedSource: "every card real drafters have picked",
  headerAffinityTail:
    "by how often real drafters took them early, alongside the cards already in the pool",
  poolViewerAffinityBasis: "early-pick affinity",
  affinityExplanation:
    "Every other card was scored like pickfit — an availability-corrected " +
    "play rate plus a behavioural synergy estimate — but only from the " +
    "early, high-confidence picks of each pack, discarding the noisy late-pick tail.",
};

const PICKPOS: SeedProvenanceVariantCopy = {
  seedSource: "every card real drafters have picked",
  headerAffinityTail:
    "by how early real drafters took them, alongside the cards already in the pool",
  poolViewerAffinityBasis: "pick-order affinity",
  affinityExplanation:
    "Every other card was scored from pick ORDER: card quality is how early it is " +
    "taken, and synergy is position-weighted so early picks dominate over " +
    "late-pack dregs.",
};

const PICKCHOICE: SeedProvenanceVariantCopy = {
  seedSource: "every card real drafters have picked",
  headerAffinityTail:
    "by a choice model of what real drafters took over what they passed",
  poolViewerAffinityBasis: "learned choice-model affinity",
  affinityExplanation:
    "Every other card was scored by a conditional-logit choice model — card " +
    "quality plus pairwise synergy — fit to every taken-over-passed draft pick.",
};

/**
 * The variant-specific copy for an affinity-grown pool. Variants outside the
 * family (which never produce seed provenance, so this is never reached for
 * them) fall back to the generic `seed` wording.
 */
export function seedProvenanceVariantCopy(
  variant: PoolVariant,
): SeedProvenanceVariantCopy {
  switch (variant) {
    case "pickfit":
      return PICKFIT;
    case "pickearly":
      return PICKEARLY;
    case "pickpos":
      return PICKPOS;
    case "pickchoice":
      return PICKCHOICE;
    case "seed":
    default:
      return SEED;
  }
}
