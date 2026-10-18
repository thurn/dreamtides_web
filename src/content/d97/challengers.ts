// Dreamtides 97 challenger and guardian occupants (Appendix B §B9, §B11):
// who stands at a battle anchor of a dream and what deck they fight with,
// read from the dream module's battle residents (`./dreams/`). Each
// registered dream keeps its own map (`src/rules/d97/d97-dreams.ts`), so the
// encounter rules find a challenger only in the run's dream. Who a resident
// is in a given run (its look, lines and the Avatar it fights as) is
// `incarnationFor` in `./dreams/schema.ts`.

import type { D97BattleResident, D97DreamDefinition } from "./dreams/schema";
import type { DreamAnchorId } from "../../types/identifiers";

/** The challengers and guardians `dream` declares, by anchor, in declaration order. */
export function dreamChallengers(dream: D97DreamDefinition): ReadonlyMap<DreamAnchorId, D97BattleResident> {
  return new Map(
    dream.residents.flatMap((resident) =>
      resident.role === "challenger" || resident.role === "guardian" ? [[resident.anchorId, resident] as const] : [],
    ),
  );
}
