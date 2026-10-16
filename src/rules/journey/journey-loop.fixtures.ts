import { vi, type MockInstance } from "vitest";
import * as contentCatalog from "../../engine/content-catalog";
import * as transfigurationApi from "./journey-transfiguration";
import { createCatalog, type EngineCardDefinition } from "../../engine/catalog";
import { activated, energy, event as eventAbility } from "../../engine/dsl/builders";
import type { AbilityList } from "../../engine/dsl/types";
import type { CardDefinition } from "../../content/define";
import type { CardId } from "../../types/card-identity";
import { parseCardId, parseCardName } from "../../types/card-identity";
import { parseBattleId, parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import type { CardType } from "../../types/cards";
import type { DeckEntry, JourneyFailureSummary, TransfigurationType } from "../../types/journey";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestDeckEntry } from "../../journey_v2/testing/fixtures";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { registerDeckContentProvider } from "./deck";
import { createJourneyModifierRegistry, type JourneyModifierDefinition, type JourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider, type JourneyTransfigurationProvider } from "./journey-transfiguration";
import { journeyPurge } from "./journey-purge";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { reduceGameEvent } from "../reducer";
import type { FoldState } from "../fold-state";
import type { EngineConfig, EventContext } from "../../eventlog/types";
import type { GameEventType } from "../events";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { makeSite, SITE_ID, NODE_ID, stateWithSites } from "./sites-fixtures";

const CARD_UUID = "e7550000-0000-4000-8000-000000000001";
export const CARD_ID = parseCardId(CARD_UUID);
export const NEIGHBOR_ID = parseCardId("e7550000-0000-4000-8000-000000000002");
export const ENTRY_ID = parseDeckEntryId("journey-loop-original");
export const LOOP = testDreamsignId("journey-loop-source"), TOME = testDreamsignId("journey-loop-tome");
export const WINDOW = testDreamsignId("journey-loop-window"), TAIL = testDreamsignId("journey-loop-tail");
export const EXTRA = testDreamsignId("journey-loop-extra");
export const sign = (id: DreamsignId) => ({ id, name: "Shared display name", effectDescription: "" });
export type FactoryResult = { readonly ok: true; readonly definition: JourneyModifierDefinition } | { readonly ok: false; readonly reason: string };
type PublicFactory = (id: DreamsignId, provider: JourneyTransfigurationProvider, cardId: CardId) => FactoryResult;

/** Existing-module lookup keeps the baseline executable before its additive export exists. */
export function requestLoop(provider: JourneyTransfigurationProvider, id = LOOP): FactoryResult | null {
  const value: unknown = Reflect.get(transfigurationApi, "journeyLoopTransfiguration");
  return typeof value === "function" ? (value as PublicFactory)(id, provider, CARD_ID) : null;
}
export function loopDefinition(provider: JourneyTransfigurationProvider, id = LOOP, unsupported = false): JourneyModifierDefinition {
  const requested = requestLoop(provider, id);
  if (requested?.ok) return requested.definition;
  if (requested !== null && !unsupported) throw new Error(`Supported synthetic source refused: ${requested.reason}`);
  return { dreamsignId: id, afterJourneyEvent: () => null };
}
export interface LoopOptions {
  cardType?: CardType;
  held?: readonly DreamsignId[];
  rootForm?: TransfigurationType;
  authored?: boolean;
  abilities?: AbilityList;
  renderedText?: string;
  providerSource?: readonly EngineCardDefinition[];
  unsupported?: boolean;
  definitions?: readonly JourneyModifierDefinition[];
}
export function fixture(options: LoopOptions = {}) {
  const cardType = options.cardType ?? "Character";
  const base = makeAuguryTestCard({ id: CARD_ID, cardNumber: 7551, name: parseCardName("Same printed name"), cardType,
    energyCost: 6, spark: cardType === "Character" ? 3 : null, subtype: cardType === "Character" ? "Warrior" : "",
    renderedText: options.renderedText ?? (options.authored ? "2●: Draw a card. Once per turn." : ""),
    ...(options.authored ? { amplifiedText: "Draw a card." } : {}) });
  const neighbor = makeAuguryTestCard({ ...base, id: NEIGHBOR_ID, cardNumber: 7552 });
  const data = transfigurationFixture();
  const content = { ...makeAuguryTestContent({ cards: [base, neighbor] }), transfigurationData: data };
  let spy: MockInstance<typeof contentCatalog.contentCardDefinitions> | undefined;
  if (options.authored) {
    const source: CardDefinition = { id: CARD_UUID, name: "Same printed name", mtgName: "Synthetic", cardNumber: base.cardNumber,
      cardType, subtype: cardType === "Character" ? "Warrior" : "", rarity: "Common", isFast: false, isInterrupt: false,
      energyCost: 6, spark: base.spark, renderedText: base.renderedText, amplifiedText: base.amplifiedText,
      isStarter: false, artOwned: true, imageNumber: 7551, tags: [], verifiedText: "synthetic",
      abilities: options.abilities ?? (variant => variant.amplified ? [eventAbility({ op: "draw", count: 1, player: "you" })]
        : [activated([energy(2)], { op: "draw", count: 1, player: "you" }, { oncePerTurn: true })]) };
    spy = vi.spyOn(contentCatalog, "contentCardDefinitions").mockReturnValue([contentCatalog.engineCardFromContent(source)]);
  }
  let provider: JourneyTransfigurationProvider;
  try {
    provider = options.providerSource === undefined ? createJourneyTransfigurationProvider(content)
      : createJourneyTransfigurationProvider(content, createCatalog(options.providerSource, []));
  } finally { spy?.mockRestore(); }
  registerJourneyTransfigurationProvider(provider);
  registerDeckContentProvider({ resolveCardNumber: id => id === CARD_ID ? base.cardNumber : id === NEIGHBOR_ID ? neighbor.cardNumber : null,
    resolveDreamsign: sign });
  const held = options.held ?? [LOOP];
  const definitions = [loopDefinition(provider, LOOP, options.unsupported), loopDefinition(provider, EXTRA, options.unsupported),
    journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
    journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 1 }),
    journeyTransfiguration(TAIL, { kind: "afterBattleTransfiguration", maxCount: 1 }), ...(options.definitions ?? [])];
  const registry = createJourneyModifierRegistry(definitions);
  const original = makeAuguryTestDeckEntry({ entryId: ENTRY_ID, cardNumber: base.cardNumber });
  const adjacent = makeAuguryTestDeckEntry({ entryId: parseDeckEntryId("journey-loop-neighbor"), cardNumber: neighbor.cardNumber });
  const rootForm = options.rootForm ?? (cardType === "Character" ? "Kindled" : "Inspired");
  const state = stateWithSites([makeSite("Transfiguration")], { essence: 30, deck: [original, adjacent], dreamsigns: held.map(sign),
    siteRuntime: { [SITE_ID]: { kind: "cardChoice", choiceKind: "transfiguration", entryIds: [ENTRY_ID], acceptedEntryIds: [],
      transfigurationOffers: [{ entryId: ENTRY_ID, type: rootForm, previewCard: base, essenceCost: 7, effectDetails: {} }] } } });
  return { state, provider, registry, base, neighbor, content, data, rootForm };
}
export type LoopFixture = ReturnType<typeof fixture>;
export function apply(f: Pick<LoopFixture, "registry">, state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}) {
  return reduceGameEvent(state, event(type, payload), ctx(context), f.registry);
}
export function accept(f: LoopFixture, context: Partial<EventContext> = {}) {
  return apply(f, f.state, "ACCEPT_TRANSFIGURATION_CHOICE", { siteId: SITE_ID, entryId: ENTRY_ID }, context);
}
export function config(f: LoopFixture, state = f.state): EngineConfig<FoldState> {
  return { ...GAME_ENGINE_CONFIG, genesisState: () => state, reducer: (s, e, c) => reduceGameEvent(s, e, c, f.registry) };
}
export function historicalFailure(result: "defeat" | "draw" = "defeat"): JourneyFailureSummary {
  return { battleId: parseBattleId("journey-loop-prior-real-battle"), result, reason: "score_target_reached", siteId: SITE_ID,
    siteLabel: SITE_ID, nodeIdOrNone: NODE_ID, turnNumber: 4, playerScore: 2, enemyScore: 10 };
}
export function afterBattle(f: LoopFixture, tail: "transfiguration" | "purge" = "transfiguration", failure = historicalFailure()) {
  const registry: JourneyModifierRegistry = tail === "purge" ? createJourneyModifierRegistry([
    loopDefinition(f.provider), journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
    journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 1 }),
    journeyPurge(TAIL, { kind: "afterBattlePurge", maxCount: 1 }),
  ]) : f.registry;
  const state = stateWithSites([makeSite("Battle")], { ...f.state.journey, failureSummary: failure,
    screen: { type: "journeyTransfiguration", choice: { kind: "afterBattle", siteId: SITE_ID,
      sources: [{ kind: "transfiguration", dreamsignId: WINDOW, heldIndex: 2, maxCount: 1 },
        tail === "purge" ? { kind: "purge", dreamsignId: TAIL, heldIndex: 3, maxCount: 1 }
          : { kind: "transfiguration", dreamsignId: TAIL, heldIndex: 3, maxCount: 1 }], index: 0, returnTo: "journeyFailed" } } });
  state.journey.atlas.nodes[NODE_ID].sites = [makeSite("Battle")];
  return { ...f, state, registry };
}
export function resolveWindow(f: LoopFixture, state: FoldState, entryIds: readonly DeckEntry["entryId"][] = [ENTRY_ID], context: Partial<EventContext> = {}) {
  if (state.journey.screen.type !== "journeyTransfiguration" && state.journey.screen.type !== "journeyPurge") throw new Error("Synthetic earned window is unavailable");
  const choice = state.journey.screen.choice;
  if (choice.kind !== "afterBattle") throw new Error("Synthetic earned role mismatch");
  const source = choice.sources[choice.index];
  return apply(f, state, state.journey.screen.type === "journeyPurge" ? "RESOLVE_JOURNEY_PURGE" : "RESOLVE_JOURNEY_TRANSFIGURATION",
    { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, entryIds }, context);
}
export { GENESIS, SITE_ID, NODE_ID };
