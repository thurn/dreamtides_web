import type {
  TutorialAction,
  TutorialBattleConfiguration,
  TutorialFeaturedCardRole,
  TutorialFeaturedCards,
} from "../src/types/tutorial";

type TutorialValidationErrorFactory = (message: string) => Error;

export function isTutorialFeaturedCardRole(
  value: unknown,
): value is TutorialFeaturedCardRole;

export function isTutorialBattlePhase(
  value: unknown,
): value is TutorialBattleConfiguration["handoff"]["phase"];

export function isTutorialHandoffSlotLegal(
  side: "player" | "enemy",
  zone: "frontRank" | "backRank",
  slotId: unknown,
): boolean;

export function tutorialFeaturedCardId(
  featuredCards: TutorialFeaturedCards,
  role: TutorialFeaturedCardRole,
): string;

export function assertTutorialBattleConfigurationContracts(
  battle: TutorialBattleConfiguration,
  makeError?: TutorialValidationErrorFactory,
): void;

export function assertTutorialDeckSufficiency(
  battle: TutorialBattleConfiguration,
  actions: readonly TutorialAction[],
  makeError?: TutorialValidationErrorFactory,
): void;
