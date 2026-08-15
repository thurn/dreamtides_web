import type {
  TutorialAction,
  TutorialBattleConfiguration,
  TutorialCardConstantRole,
  TutorialCardConstants,
} from "../src/types/tutorial";
import type { CardId } from "../src/types/card-identity";

type TutorialValidationErrorFactory = (message: string) => Error;

export function isTutorialCardConstantRole(
  value: unknown,
): value is TutorialCardConstantRole;

export function isTutorialBattlePhase(
  value: unknown,
): value is TutorialBattleConfiguration["handoff"]["phase"];

export function isTutorialHandoffSlotLegal(
  side: "player" | "enemy",
  zone: "frontRank" | "backRank",
  slotId: unknown,
): boolean;

export function tutorialCardConstantId(
  tutorialCardConstants: TutorialCardConstants,
  role: TutorialCardConstantRole,
): CardId;

export function assertTutorialBattleConfigurationContracts(
  battle: TutorialBattleConfiguration,
  makeError?: TutorialValidationErrorFactory,
): void;

export function assertTutorialDeckSufficiency(
  battle: TutorialBattleConfiguration,
  actions: readonly TutorialAction[],
  makeError?: TutorialValidationErrorFactory,
): void;
