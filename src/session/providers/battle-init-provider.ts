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
import { createBattleInit } from "../../battle/integration/create-battle-init";
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
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
  contentFigmentDefinitions,
  createCatalog,
  createEngine,
  type Engine,
  type EngineCardDefinition,
  type EngineDreamwellDefinition,
} from "../../engine";
import { energy, energyX } from "../../engine/dsl/builders";
import { developmentLabDefinitions } from "../../engine/development";
import type { CardData } from "../../types/cards";
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
  return createBattleInit({
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
}

/**
 * Settle the reconstruction log captured while folding one BEGIN_BATTLE. Every
 * client consumes its local callback, while only the appending client emits it
 * after the event is confirmed as applied.
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

const contentEngines = new WeakMap<JourneyContent, Engine>();

/**
 * The engine over loaded journey content: every card, Dreamwell card,
 * Avatar, and Dreamsign of the content modules, with their abilities, plus
 * any the loaded journey content adds, by UUID, and in a development build
 * the prompt lab's synthetic definitions (`developmentLabDefinitions`), which
 * the prompt-lab and card-lab QA scenes play. An entity the content
 * modules do not define plays text-less, as a pending entity does (D36).
 * Built once per content; the engine is pure, so one instance serves every
 * battle.
 */
export function journeyContentEngine(content: JourneyContent): Engine {
  const cached = contentEngines.get(content);
  if (cached !== undefined) return cached;
  const lab = developmentLabDefinitions();
  const aspectDefinitions = content.apollyonIncarnations.map(({ aspect }) => ({
    id: aspect.id,
    status: aspect.abilities !== undefined ? "authored" as const : aspect.vanilla === true ? "vanilla" as const : "pending" as const,
    abilities: aspect.abilities ?? (() => []),
  }));
  const avatarDefinitions = withLoaded(contentAvatarDefinitions(), aspectDefinitions, (definition) => definition);
  const engine = createEngine(
    createCatalog(
      [...withLoaded(contentCardDefinitions(), [...content.cardDatabase.values()], textlessCard), ...lab.cards],
      withLoaded(
        contentDreamwellDefinitions(),
        content.dreamwellCards,
        (card): EngineDreamwellDefinition => ({
          id: card.id,
          order: card.order,
          energyAdded: card.energyAdded,
          status: "pending",
          abilities: () => [],
        }),
      ),
      {
        avatars: [...withLoaded(avatarDefinitions, content.avatars, textlessEmblem), ...(lab.emblems.avatars ?? [])],
        dreamsigns: [
          ...withLoaded(contentDreamsignDefinitions(), content.dreamsignTemplates, textlessEmblem),
          ...(lab.emblems.dreamsigns ?? []),
        ],
      },
      [...contentFigmentDefinitions(), ...lab.figments],
    ),
  );
  contentEngines.set(content, engine);
  return engine;
}

/** The content-module definitions, then a text-less one for each loaded entity they lack. */
function withLoaded<Id, Definition extends { readonly id: Id }, Loaded extends { readonly id: Id }>(
  definitions: readonly Definition[],
  loaded: readonly Loaded[],
  textless: (entity: Loaded) => Definition,
): Definition[] {
  const known = new Set(definitions.map((definition) => definition.id));
  return [...definitions, ...loaded.filter((entity) => !known.has(entity.id)).map(textless)];
}

function textlessEmblem<Id>(entity: { readonly id: Id }): { id: Id; status: "pending"; abilities: () => [] } {
  return { id: entity.id, status: "pending", abilities: () => [] };
}

/** A card the content modules do not define, played text-less with its printed values (D36). */
function textlessCard(card: CardData): EngineCardDefinition {
  const labels = card.energyCosts ?? [card.energyCost === null ? "X" : String(card.energyCost)];
  return {
    id: card.id,
    cardType: card.cardType === "Character" ? "character" : "event",
    costs: labels.map((label) => (label === "X" ? energyX() : energy(Number(label)))),
    spark: card.cardType !== "Character" ? null : card.sparkVariable === true ? "x" : (card.spark ?? 0),
    subtype: card.subtype,
    speed: card.isInterrupt === true ? "interrupt" : card.isFast ? "fast" : "standard",
    status: "pending",
    abilities: () => [],
  };
}

/**
 * The battle-init provider over loaded journey content: the journey battle's
 * init and, for the same battle, the engine init `engine` plays.
 */
export function createBattleInitProvider(
  content: JourneyContent,
  engine: Engine = journeyContentEngine(content),
): BattleInitProvider {
  return {
    engine,
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
