// Schema version 4 to 5: the run stores its assembled acts (Appendix B §B4,
// `acts`). A version-4 run was saved before act assembly, so it migrates with
// no acts, and load-time reconciliation (../reconcile.ts), which reads the
// current catalog, gives it the one-dream act of its dream (`preAssemblySave`):
// the dream module's exit door and exit guardian as its exit door and
// incarnation seat, and its residents where the module seats them, so the run
// plays its dream as it did. Every other field is unchanged.

import type { D97SaveMigration } from "../migrate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const V4_TO_V5: D97SaveMigration = {
  from: 4,
  migrate: (snapshot) => {
    const d97 = snapshot.d97;
    const run = isRecord(d97) ? d97.run : null;
    if (!isRecord(d97) || !isRecord(run)) return { ...snapshot };
    return { ...snapshot, d97: { ...d97, run: { ...run, acts: [] } } };
  },
};
