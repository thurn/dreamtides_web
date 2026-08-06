import {
  createBattleInit as createConfiguredBattleInit,
  type CreateBattleInitInput,
} from "../battle/integration/create-battle-init";
import type { OpponentsData } from "../types/opponents-data";
import { opponentsFixture } from "./opponents-fixture";

type TestBattleInitInput = Omit<CreateBattleInitInput, "opponentsData"> & {
  opponentsData?: OpponentsData;
};

/** Supplies synthetic opponent tuning for battle tests that do not exercise it. */
export function createTestBattleInit(input: TestBattleInitInput) {
  return createConfiguredBattleInit({
    ...input,
    opponentsData: input.opponentsData ?? opponentsFixture(),
  });
}
