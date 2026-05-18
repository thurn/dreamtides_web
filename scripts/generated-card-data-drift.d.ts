export interface GeneratedCardDataCheckResult {
  ok: boolean;
  durationMs: number;
  message: string;
}

export interface GeneratedCardDataCheckOptions {
  rootDir?: string;
}

export function expectedCardDataFromToml(
  options?: GeneratedCardDataCheckOptions,
): unknown[];

export function checkGeneratedCardData(
  options?: GeneratedCardDataCheckOptions,
): GeneratedCardDataCheckResult;
