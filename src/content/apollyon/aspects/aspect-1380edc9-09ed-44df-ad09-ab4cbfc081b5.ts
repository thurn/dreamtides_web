/** Provisional D6 Aspect: one Spirit Animal figment after a Spirit Animal play each turn. */
import { triggered, whenYouPlay } from "../../../engine/dsl/triggers";
import type { AbilityList } from "../../../engine/dsl/types";
import { materializeFigments } from "../../../engine/effects/primitives/materialize-figments";
import { parseFigmentId } from "../../../engine/state/ids";

export const spiritAnimalAspectAbilities: AbilityList = () => [
  triggered(whenYouPlay({ subtype: "Spirit Animal" }),
    materializeFigments(parseFigmentId("1745ab81-c8a9-4601-a3db-7dbcfa138c11"), 1, { spark: 1 }),
    { oncePerTurn: true }),
];
