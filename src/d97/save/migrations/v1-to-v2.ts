// Schema version 1 to 2: encounters carry no head starts (decision S32; both
// sides start every battle at 0⍟), so each stored encounter drops its
// `headStarts`.

import type { D97SaveMigration } from "../migrate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const V1_TO_V2: D97SaveMigration = {
  from: 1,
  migrate: (snapshot) => {
    const d97 = snapshot.d97;
    const run = isRecord(d97) ? d97.run : null;
    if (!isRecord(d97) || !isRecord(run) || !isRecord(run.encounters)) return { ...snapshot };
    const encounters = Object.fromEntries(
      Object.entries(run.encounters).map(([anchorId, encounter]) => {
        if (!isRecord(encounter)) return [anchorId, encounter];
        const { headStarts: _headStarts, ...rest } = encounter;
        return [anchorId, rest];
      }),
    );
    return { ...snapshot, d97: { ...d97, run: { ...run, encounters } } };
  },
};
