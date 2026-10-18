// D97 dream catalog tunables (Appendix B §B2): the challenger and guardian
// anchors each size class holds. The catalog validator
// (src/d97/dreams/validate.ts) reads them; act assembly totals the
// challenger anchors of the dreams it draws.

import type { D97DreamSizeAnchors } from "../../../d97/dreams/validate";

export const D97_DREAM_SIZE_ANCHORS: D97DreamSizeAnchors = {
  small: { challenger: { min: 2, max: 3 }, guardian: { min: 0, max: 1 } },
  medium: { challenger: { min: 4, max: 5 }, guardian: { min: 1, max: 1 } },
  large: { challenger: { min: 6, max: 8 }, guardian: { min: 1, max: 2 } },
};
