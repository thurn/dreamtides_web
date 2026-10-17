// Real BattleInitProvider: turns journey state into a journey battle's init,
// and the engine init of the same battle, on `BEGIN_BATTLE`. Battle
// construction is ALREADY fully seeded — `createBattleInit` derives all of its
// randomness from a `BattleRng` stream keyed by
// `deriveBattleSeed(journey.seed:battleEntryKey)` — so it needs no `ctx.rng`:
// given the same journey seed and site, every fold builds a byte-identical
// battle. The `battleEntryKey` is derived
// deterministically from `(siteId, completionLevel, dreamscapeId)` so it is
// identical across replays too.

import type { JourneyContent } from "../../data/journey-content";
import { createBattleInit, dreamwellCardDefinition } from "../../battle/integration/create-battle-init";
import { APOLLYON_BATTLE_DESIGN } from "../../content/apollyon/design";
import { buildTutorialSetup } from "../../battle/integration/tutorial-setup";
import { findSite } from "../../rules/journey/sites";
import { type JourneyBattleInit } from "../../rules/battle/fold";
import type {
  BattleCompletionProvider,
  BattleInitProvider,
  BattleStart,
} from "../../rules/battle/journey-battle";
import type { TutorialBattleInitProvider } from "../../rules/battle/tutorial-lifecycle";
import type { Engine } from "../../engine";
import { journeyContentEngine } from "./journey-content-engine";
export { journeyContentEngine } from "./journey-content-engine";
import type { CardId } from "../../types/card-identity";
import type { DreamscapeNode, JourneyState } from "../../types/journey";
import { advanceAtlas } from "../../atlas/atlas-generator";
import { parseJourneyId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";

const deferredOpponentLogs = new Map<number, () => void>();

/**
 * A battle at `(siteId, completionLevel, dreamscapeId)` always has the same
 * stable identity, so the derived battle seed is identical on every replay.
 */
function battleEntryKeyFor(
  dreamscapeId: AtlasNodeId | null,
  siteId: SiteId,
  completionLevel: number,
): string {
  return `${siteId}::${String(completionLevel)}::${dreamscapeId ?? parseAtlasNodeId("none")}`;
}

/**
 * What the Battle Start screen previews before `BEGIN_BATTLE`: the battle's
 * journey init, its engine init's score target, and the Atlas node it takes
 * place in.
 */
export interface BattlePreview {
  readonly init: JourneyBattleInit;
  readonly scoreToWin: number;
  readonly node: DreamscapeNode | null;
}

/**
 * Build the battle preview from folded journey state and loaded content.
 * Battle construction is keyed by the journey seed and battle entry, so this
 * previews exactly the battle `BEGIN_BATTLE` will fold, without creating any
 * game state outside the reducer.
 */
export function createBattlePreview(
  content: JourneyContent,
  journey: JourneyState,
  siteId: SiteId,
  seedOverride: number | null = null,
): BattlePreview | null {
  const start = buildBattleStart(content, journey, siteId, seedOverride, () => {});
  if (start === null) return null;
  const { init, engineInit } = start;
  return {
    init,
    scoreToWin: engineInit.scoreToWin,
    node: init.nodeId === null ? null : (journey.atlas.nodes[init.nodeId] ?? null),
  };
}

function buildBattleStart(
  content: JourneyContent,
  journey: JourneyState,
  siteId: SiteId,
  seedOverride: number | null,
  deferOpponentLog: (emit: () => void) => void,
): BattleStart | null {
  const site = findSite(journey, siteId);
  if (site === null || site.type !== "Battle") return null;

  const battleEntryKey = battleEntryKeyFor(
    journey.currentDreamscape,
    siteId,
    journey.completionLevel,
  );
  const start = createBattleInit({
    opponentsData: content.opponentsData,
    transfigurationData: content.transfigurationData,
    battleEntryKey: parseBattleEntryKey(battleEntryKey),
    battleInstanceId: parseBattleId(
      `battle:${journey.runId ?? parseJourneyId("unscoped")}:${battleEntryKey}`,
    ),
    seedOverride,
    site,
    state: journey,
    cardDatabase: content.cardDatabase,
    avatars: content.avatars,
    apollyon: { incarnations: content.apollyonIncarnations, ...APOLLYON_BATTLE_DESIGN },
    dreamscapes: content.dreamscapes,
    affiliations: content.affiliations,
    dreamwellCards: content.dreamwellCards,
    dreamsignTemplates: content.dreamsignTemplates,
    tides4Decks: content.poolContext.poolData.tides4Decks,
    tides4Tuning: content.poolContext.tides4Tuning,
    economyData: content.economyData,
    deferOpponentLog,
  });
  return { ...start, guidance: { tutorialTriggers: content.tutorial.triggers, dreamwellDeck: content.dreamwellCards.map(dreamwellCardDefinition) } };
}

/**
 * Settle the reconstruction log captured while folding one BEGIN_BATTLE: the
 * callback is always consumed, and emitted only when the appended event
 * applied.
 */
export function settleDeferredOpponentLog(
  seq: number,
  shouldEmit: boolean,
): boolean {
  const emit = deferredOpponentLogs.get(seq);
  if (emit === undefined) return false;
  deferredOpponentLogs.delete(seq);
  if (shouldEmit) emit();
  return true;
}

/**
 * The battle-init provider over loaded journey content: the journey battle's
 * init and, for the same battle, the engine init `engine` plays.
 */
export function createBattleInitProvider(
  content: JourneyContent,
  engine: Engine = journeyContentEngine(content),
): BattleInitProvider {
  const cardTexts = new Map<CardId, string>();
  for (const card of content.cardDatabase.values()) cardTexts.set(card.id, card.renderedText);
  return {
    engine,
    guidanceCardText: cardId => cardTexts.get(cardId),
    beginBattle: ({ journey, siteId, seedOverride, seq }): BattleStart | null =>
      buildBattleStart(content, journey, siteId, seedOverride, (emit) =>
        deferredOpponentLogs.set(seq, emit),
      ),
  };
}

/**
 * Advance the live Atlas from authoritative folded journey/battle state.
 * Content is pinned by the game build and every random draw comes from the
 * `END_BATTLE` event stream.
 */
export function createBattleCompletionProvider(
  content: JourneyContent,
): BattleCompletionProvider {
  return {
    advanceAtlas: ({ journey, battle, completionLevel, rng }) => {
      const dreamscapeId = battle.init.nodeId;
      if (dreamscapeId === null) return null;
      let drawIndex = 0;
      return advanceAtlas(
        journey.atlas,
        dreamscapeId,
        completionLevel,
        {
          ...(journey.dreamscapeModifiers.length === 0
            ? {}
            : { dreamscapeModifiers: journey.dreamscapeModifiers }),
        },
        {
          dreamscapes: content.dreamscapes,
          atlasData: content.atlasData,
          sitesData: content.sitesData,
          gambleData: content.gambleData,
          dreamsignPoolIds: journey.remainingDreamsignPool,
          apollyonIncarnations: content.apollyonIncarnations,
        },
        {
          logEvents: false,
          rng: () => rng(drawIndex++),
        },
      );
    },
  };
}

/** Authored prefix and live setup share the same real content engine. */
export function createTutorialBattleInitProvider(content: JourneyContent): TutorialBattleInitProvider {
  return { engine: journeyContentEngine(content), overrides: content.tutorial.battle.aiActionOverrides,
    beginTutorialBattle: input => buildTutorialSetup(content,input,false),
    beginTutorialPrefix: input => buildTutorialSetup(content,input,true) };
}
