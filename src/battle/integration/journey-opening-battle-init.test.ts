import { afterEach, describe, expect, it } from "vitest";
import { createBattleInitProvider, settleDeferredOpponentLog } from "../../session/providers/battle-init-provider";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerJourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";
import { registerDeckContentProvider } from "../../rules/journey/deck";
import { registerBattleInitProvider } from "../../rules/battle/journey-battle";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { createFoldAdapter } from "../../engine/fold/slice";
import { GAME_ENGINE_CONFIG } from "../../rules/replay/replay";
import { makeBattleTestAvatars, makeBattleTestCardDatabase, makeBattleTestState, makeBattleTestSite } from "../test-support";
import { makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { parseDeckEntryId, parseCardTypeChangePredicateId } from "../../types/identifiers";
import { REGISTERED_MUG as MUG, openingSign, openingEntry, productionOpeningInitial, openingAccepted, openingPayload } from "../../rules/journey/journey-battle-init-fixtures";
import type { DeckEntry } from "../../types/journey";

afterEach(clearGameProviders);

function fixture() {
  const cardDatabase = makeBattleTestCardDatabase(), avatars = makeBattleTestAvatars();
  const content = { ...makeAuguryTestContent({ cards: [...cardDatabase.values()], dreamsignTemplates: [{ ...openingSign(MUG), imageName: "synthetic.png" }] }), avatars };
  const first = openingEntry("original-first", 106), selected = openingEntry("original-selected", 106), character = openingEntry("original-character", 101);
  const before = productionOpeningInitial({ ...makeBattleTestState(), completionLevel: 0, avatar: null, dreamsigns: [],
    deck: [first, selected, character], screen: { type: "site", siteId: makeBattleTestSite().id } });
  registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
  registerDeckContentProvider({ resolveDreamsign: id => openingSign(id), resolveCardNumber: id => [...cardDatabase.values()].find(card => card.id === id)?.cardNumber ?? null });
  registerSiteContentProvider(createSiteContentProvider(content));
  const provider = createBattleInitProvider(content);
  registerBattleInitProvider(provider);
  return { before, content, provider, selected };
}

describe("production opening binding to normal battle", () => {
  it.each([false, true])("passes one original padded slot from a real registered acquisition to the provider and actual engine hand, changed=%s", changed => {
    const { before, provider, selected } = fixture();
    const acquired = openingAccepted(before, "ADD_DREAMSIGN", { dreamsignId: MUG });
    let state = openingAccepted(acquired, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(acquired, selected.entryId));
    if (changed) {
      const patch: Partial<DeckEntry> = { transfiguration: "Amplified", typeChange: { predicateId: parseCardTypeChangePredicateId("opening-later-character"), cardType: "Character", subtype: "Warrior", label: "" } };
      state = { ...state, journey: { ...state.journey, deck: state.journey.deck.map(entry => entry.entryId === selected.entryId ? { ...entry, ...patch } : entry) } };
    }
    const siteId = makeBattleTestSite().id;
    const start = provider.beginBattle({ journey: state.journey, siteId, seedOverride: 4242, seq: 21, rng: () => 0, timestamp: "1970-01-01T00:00:00.000Z" });
    if (start === null) throw new Error("Expected real production provider start");
    const sources = [{ deckIndex: 1, entryId: selected.entryId, dreamsignId: MUG, heldIndex: 0 }];
    expect(start.engineInit.guaranteedOpeningHand).toEqual({ player: sources });
    expect(start.engineInit.decks.player.length).toBeGreaterThan(state.journey.deck.length);
    const opened = createFoldAdapter(provider.engine).start(start.engineInit);
    if (opened.kind !== "applied" || opened.error !== null) throw new Error("Expected actual normal engine opening");
    const attributed = opened.published.filter(event => event.kind === "cardDrawn" && event.openingHandGuaranteed !== undefined);
    expect(attributed).toHaveLength(1);
    const drawn = attributed[0];
    if (drawn.kind !== "cardDrawn" || drawn.instance === null) throw new Error("Expected selected physical draw");
    expect(drawn.openingHandGuaranteed).toEqual({ cardId: start.engineInit.decks.player[1].cardId, sources });
    const begun = openingAccepted(state, "BEGIN_BATTLE", { siteId, seedOverride: 4242 }, { seq: 22 });
    expect(begun.battle!.engine.init.guaranteedOpeningHand).toEqual({ player: sources });
    expect(begun.battle!.engine.slice.committed.sides.player.hand).toContain(drawn.instance);
    expect(begun.battle!.engine.slice.committed).toEqual(opened.slice.committed);
    const loaded = openingAccepted(begun, "LOAD_STATE", { snapshot: begun.journey, battle: JSON.parse(JSON.stringify(begun.battle)) });
    expect(loaded.battle).toEqual(begun.battle);
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(begun))).toEqual(begun);
    settleDeferredOpponentLog(21, false);
  });

  it("keeps two bound sources attributed once and leaves a removed target inert without choosing its same-printing replacement", () => {
    const { before, provider, selected } = fixture();
    const held = [{ ...openingSign(MUG), openingHandEntryId: selected.entryId }, { ...openingSign(MUG), openingHandEntryId: selected.entryId }];
    const build = (deck: DeckEntry[]) => provider.beginBattle({ journey: { ...before.journey, deck, dreamsigns: held }, siteId: makeBattleTestSite().id,
      seedOverride: 17, seq: 23, rng: () => 0, timestamp: "1970-01-01T00:00:00.000Z" });
    const start = build(before.journey.deck);
    if (start === null) throw new Error("Expected provider start");
    const opened = createFoldAdapter(provider.engine).start(start.engineInit);
    expect(start.engineInit.guaranteedOpeningHand?.player?.map(source => source.heldIndex)).toEqual([0, 1]);
    if (opened.kind !== "applied") throw new Error("Expected opening");
    const draws = opened.published.filter(event => event.kind === "cardDrawn" && event.openingHandGuaranteed !== undefined);
    expect(draws).toHaveLength(1);
    const replacement = { ...selected, entryId: parseDeckEntryId("replacement") };
    expect(build([...before.journey.deck.filter(entry => entry.entryId !== selected.entryId), replacement])?.engineInit.guaranteedOpeningHand).toBeUndefined();
    settleDeferredOpponentLog(23, false);
  });
});
