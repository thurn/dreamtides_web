import type { EngineCatalog } from "../catalog";
import { characteristicsOf } from "../continuous/characteristics";
import type { Keyword } from "../dsl/types";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";

/** Whether an instance has a keyword now: printed or authored, gained, and not lost (layer 3). */
export function hasKeyword(
  state: BattleState,
  catalog: EngineCatalog,
  id: InstanceId,
  keyword: Keyword,
): boolean {
  return characteristicsOf(state, catalog, id).keywords.includes(keyword);
}
