import type {
  RewardSelectionData,
} from "../types/reward-selection-data";

export type { RewardSelectionData, RewardSelectionTuning } from "../types/reward-selection-data";

const PATH = "/reward-selection-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validate the normalized JSON artifact at the runtime trust boundary. */
export function parseRewardSelectionData(value: unknown): RewardSelectionData {
  if (
    !isRecord(value) || value.schemaVersion !== 1 || value.rulesVersion !== "1" ||
    typeof value.contentHash !== "string" || !SHA256_HEX.test(value.contentHash) ||
    value.foldHash !== value.contentHash || !isRecord(value.tuning)
  ) throw new Error("Failed to load reward-selection data: malformed reward-selection-data.json");
  const tuning = value.tuning;
  const numericKeys = [
    "bandFraction", "bandMinimum", "strongBandFraction", "strongBandMinimum",
    "dreamsignBandFraction", "dreamsignBandMinimum", "minDeckForFit",
    "minDeckForPurge", "purgeMisfitFraction", "starterPurgeBonus",
    "subtypeMinPoolCards", "bundleGrowthBandSize", "categoryAffineWeight",
    "categoryDeckAffineMinimum", "categoryClusterAffineMinimum",
  ];
  if (
    numericKeys.some((key) => !finite(tuning[key])) ||
    !isRecord(tuning.strongBlend) || !finite(tuning.strongBlend.fit) || !finite(tuning.strongBlend.quality) ||
    !isRecord(tuning.copiesBlend) || !finite(tuning.copiesBlend.fit) || !finite(tuning.copiesBlend.quality) ||
    !isRecord(tuning.duplicateBlend) || !finite(tuning.duplicateBlend.quality) || !finite(tuning.duplicateBlend.fitLoo) ||
    !isRecord(tuning.transfigureBlend) || !finite(tuning.transfigureBlend.benefit) || !finite(tuning.transfigureBlend.centrality) ||
    !isRecord(tuning.bundleBlend) || !finite(tuning.bundleBlend.seed) || !finite(tuning.bundleBlend.bundle) || !finite(tuning.bundleBlend.fit) ||
    !isRecord(tuning.centrality) || Object.values(tuning.centrality).some((entry) => !finite(entry)) ||
    !isRecord(tuning.dreamsign) || !finite(tuning.dreamsign.fullCoverageCount) || !finite(tuning.dreamsign.featurelessCoverage) || !isRecord(tuning.dreamsign.qualityWeight) || Object.values(tuning.dreamsign.qualityWeight).some((entry) => !finite(entry)) ||
    !isRecord(tuning.costBands) || Object.values(tuning.costBands).some((entry) => !finite(entry)) ||
    !Array.isArray(tuning.allowedTransfigurations) || tuning.allowedTransfigurations.some((entry) => typeof entry !== "string") ||
    !isRecord(tuning.transfigurationBenefit) || !finite(tuning.transfigurationBenefit.empoweredCostDivisor) || !finite(tuning.transfigurationBenefit.kindledSparkDivisor) || !isRecord(tuning.transfigurationBenefit.flat) || Object.values(tuning.transfigurationBenefit.flat).some((entry) => !finite(entry)) ||
    !Array.isArray(tuning.placeableSiteTypes) || tuning.placeableSiteTypes.some((entry) => typeof entry !== "string")
  ) throw new Error("Failed to load reward-selection data: malformed reward-selection-data.json");
  return value as unknown as RewardSelectionData;
}

export async function loadRewardSelectionData(): Promise<RewardSelectionData> {
  const response = await fetch(PATH);
  if (!response.ok) throw new Error(`Failed to load reward-selection data: ${String(response.status)} ${response.statusText}`);
  return parseRewardSelectionData(await response.json());
}
