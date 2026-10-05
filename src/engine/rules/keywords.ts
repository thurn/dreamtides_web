import type { EngineCatalog } from "../catalog";
import type { Keyword } from "../dsl/types";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import { instanceOf } from "./zones";

/** Whether an instance has a keyword, printed or from its authored keyword abilities. */
export function hasKeyword(
  state: BattleState,
  catalog: EngineCatalog,
  id: InstanceId,
  keyword: Keyword,
): boolean {
  const instance = instanceOf(state, id);
  const definition = catalog.card(instance.cardId);
  return (
    definition.keywords.includes(keyword) ||
    definition
      .abilities(instance.variant)
      .some((ability) => ability.kind === "keyword" && ability.keyword === keyword)
  );
}
