export type PackageTideId = string;

export interface DreamcallerContent {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
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
