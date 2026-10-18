// Dreamtides 97 act shape tunables (Appendix B §B3, §B4, §B5): what act
// assembly (src/d97/assembly/) draws from the dream catalog for one act, the
// chokepoint rule it guarantees, and how many seed salts it tries. Assembly
// reads these values; it never spells them as literals.

import type { D97ActShape } from "../../d97/assembly/types";

/** Act 1's shape (Appendix B §B3's Act 1 column and §B4). */
export const D97_ACT_SHAPE: D97ActShape = {
  dreams: { min: 3, max: 8 },
  challengerAnchors: { min: 12, max: 14 },
  minCategories: 3,
  minGuardianAnchors: 3,
  // g: Avatar guardians on every route from the entry dream to the incarnation (§B5).
  chokepointGuardians: 2,
  avatarGuardians: { min: 2, max: 4 },
  // Extra doors beyond the spanning tree, each closing a loop (§B4).
  loopDoors: { min: 0, max: 2 },
  retryLimit: 32,
};
