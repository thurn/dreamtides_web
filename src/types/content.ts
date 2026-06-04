/**
 * Default starting essence used when a Dreamcaller record omits a tuned
 * value. Persistence helpers (see `normalizeQuestState`) also fall back to
 * this constant so RTDB-stripped rooms render with a sensible value.
 */
export const DEFAULT_STARTING_ESSENCE = 250;

export interface DreamcallerContent {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /**
   * Per-Dreamcaller starting essence. Tuned in `dreamcallers.toml` to
   * compensate for differences in opening power and engine ramp speed.
   * Defaults to `DEFAULT_STARTING_ESSENCE` when omitted from source data.
   */
  startingEssence: number;
  /**
   * Card names that steer the `idf3` pool generator toward this Dreamcaller's
   * intended decks when building the run's draft package. Optional during the
   * V2 migration; absent for v1 records.
   */
  signatureCards?: string[];
}

export interface DreamsignTemplate {
  id: string;
  name: string;
  effectDescription: string;
  imageName?: string;
  imageAlt?: string;
}

export interface ResolvedDreamcallerPackage {
  dreamcaller: DreamcallerContent;
  draftPoolCopiesByCard: Record<string, number>;
  dreamsignPoolIds: string[];
  mandatoryOnlyPoolSize: number;
  draftPoolSize: number;
  doubledCardCount: number;
  legalSubsetCount: number;
  preferredSubsetCount: number;
  /**
   * Card numbers of the idf3 starter deck the pool was grown from, resolved
   * against the run's name index. Excludes starter cards and unmapped names,
   * deduped in first-seen order. Optional during the V2 migration.
   */
  starterDecklistCardNumbers?: number[];
}
