export type PackageTideId = string;

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
  mandatoryTides: PackageTideId[];
  optionalTides: PackageTideId[];
}

export interface DreamsignTemplate {
  id: string;
  name: string;
  effectDescription: string;
  packageTides: PackageTideId[];
  imageName?: string;
  imageAlt?: string;
}

export interface ResolvedDreamcallerPackage {
  dreamcaller: DreamcallerContent;
  mandatoryTides: PackageTideId[];
  optionalSubset: PackageTideId[];
  selectedTides: PackageTideId[];
  draftPoolCopiesByCard: Record<string, number>;
  dreamsignPoolIds: string[];
  mandatoryOnlyPoolSize: number;
  draftPoolSize: number;
  doubledCardCount: number;
  legalSubsetCount: number;
  preferredSubsetCount: number;
}
