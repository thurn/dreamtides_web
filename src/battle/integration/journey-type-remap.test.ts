import { afterEach, describe, expect, it } from "vitest";
import { createEngineBattleInit } from "./engine-battle-init";
import { createCatalog, type EngineCardDefinition } from "../../engine/catalog";
import { createEngine } from "../../engine";
import { activated, count, energy, self } from "../../engine/dsl/builders";
import { createCopyInHand, createCard, gainPoints, materializeFigments, sequence } from "../../engine/effects/primitives";
import { parseFigmentId, SIDES, type Side } from "../../engine/state/ids";
import { passUntil } from "../../engine/testing/trigger-harness";
import { InlineSource, NO_PROMPTS } from "../../engine/steps/sources";
import { randomLegalAnswer } from "../../engine/prompts/answers";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { MASK, initial, accepted, choicePayload, cards, clear } from "../../rules/journey/journey-type-remap-fixtures";
import { invariantViolations } from "../../engine/testing/invariants";
afterEach(clear);
const originalFigment = parseFigmentId(testCardId("bridge-original-figment")), shadowFigment = parseFigmentId(testCardId("bridge-shadow-figment"));

describe("C12 run to physical battle-entry handoff", () => {
  it.each(SIDES.flatMap(side => (["Mage", "Shadow"] as const).map(chosen => ({ side, chosen }))))("projects current, padded and late entries and executes $chosen for $side", ({ side, chosen }) => {
    let state = initial();
    state.journey.deck = [state.journey.deck[0], state.journey.deck[1], { ...state.journey.deck[1], entryId: parseDeckEntryId("remap-mage-copy") }];
    state.journey.deck[0] = { ...state.journey.deck[0], sparkBonus: 3, transfiguration: "Amplified" };
    state = accepted(state, "ADD_DREAMSIGN", { dreamsignId: MASK });
    state = accepted(state, "RESOLVE_TYPE_REMAP", choicePayload(state, chosen));
    state = accepted(state, "REMOVE_DREAMSIGN", { dreamsignId: MASK });
    state = accepted(state, "ADD_CARD", { cardId: cards[2].id });
    const display = cards.map((card, index) => ({ ...card, subtype: index === 0 ? "Explorer" as const : card.subtype, amplifiedText: index === 0 ? "Synthetic amplified ability." : undefined }));
    const definitions: EngineCardDefinition[] = display.map((card, index) => ({ id: card.id, cardType: "character", costs: [energy(0)], spark: 2, subtype: card.subtype, speed: "standard", status: index === 0 ? "authored" : "vanilla", abilities: () => index === 0 ? [activated([], sequence(gainPoints(count({ controller: "you", subtype: "Warrior" })), materializeFigments(originalFigment, 1, { spark: 7 }))), activated([], createCopyInHand(self())), activated([], createCard(card.id))] : [] }));
    const engine = createEngine(createCatalog(definitions, [], {}, [
      { id: originalFigment, subtype: "Warrior", spark: 2, typeRemapTarget: true, status: "vanilla", abilities: () => [] },
      { id: shadowFigment, subtype: "Shadow", spark: 5, typeRemapTarget: true, status: "vanilla", abilities: () => [] },
    ]));
    const init = createEngineBattleInit({ journey: state.journey, seed: 17, scoreToWin: 100, startingSide: side, minimumDeckSize: 8, dreamwell: [], cardDatabase: new Map(display.map(card => [card.cardNumber, card])), transfigurationData: transfigurationFixture(), enemy: { deck: [cards[0].id, cards[2].id, cards[1].id], avatar: null, dreamsigns: [] } });
    expect(init.decks.player).toHaveLength(8);
    expect(init.decks.player.every(entry => entry.typeRemap === chosen)).toBe(true);
    expect(init.decks.player[0]).toMatchObject({ cardId: cards[0].id, amplified: true, transfigurations: ["Amplified"], deckMods: { sparkBonus: 3 } });
    expect(init.decks.player[3]).toMatchObject({ cardId: cards[2].id, typeRemap: chosen });
    expect(init.decks.enemy.every(entry => entry.typeRemap === undefined)).toBe(true);
    const other: Side = side === "player" ? "enemy" : "player";
    const oriented = { ...init, decks: { [side]: init.decks.player, [other]: init.decks.enemy } as typeof init.decks };
    expect(oriented.decks[side]).toBe(init.decks.player); expect(oriented.decks[other]).toBe(init.decks.enemy);
    const started = engine.createBattle({ ...oriented, setup: {
      placements: [
        ...[0, 1, 2, 3].map((deckIndex, index) => ({ side, deckIndex, zone: "play" as const, slot: { rank: "back" as const, index } })),
        ...[0, 1, 2].map((deckIndex, index) => ({ side: other, deckIndex, zone: "play" as const, slot: { rank: "back" as const, index } })),
      ], sides: { player: { currentEnergy: 10, maxEnergy: 10, score: 0 }, enemy: { currentEnergy: 10, maxEnergy: 10, score: 0 } }, turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side }, dreamwell: { deck: [], next: 0 },
    } }, NO_PROMPTS);
    const answers = new InlineSource({ player: prompt => randomLegalAnswer(prompt, () => 0), enemy: prompt => randomLegalAnswer(prompt, () => 0) });
    let board = started.state;
    const source = board.sides[side].backRank[0]!;
    expect(engine.view(board, side).instances[source]?.characteristics.subtype).toBe("Explorer");
    const applied = engine.apply(board, side, { kind: "activate", source, ability: 0 }, answers);
    board = passUntil(engine, applied.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, answers).state;
    const score = chosen === "Mage" ? 2 : 0;
    expect(board.sides[side].score).toBe(score);
    const created = Object.values(board.instances).filter(instance => instance.status.created);
    expect(created).toHaveLength(1); expect(created[0].printing).toEqual({ kind: "figment", figment: chosen === "Shadow" ? shadowFigment : originalFigment, spark: 7 });
    const createdIds = [];
    for (const ability of [1, 2]) {
      const before = new Set(Object.values(board.instances).map(instance => instance.id));
      const next = engine.apply(board, side, { kind: "activate", source, ability }, answers);
      board = passUntil(engine, next.state, state => state.stack.length === 0 && state.triggerQueue.length === 0, answers).state;
      const additions = Object.values(board.instances).filter(instance => !before.has(instance.id));
      expect(additions).toHaveLength(1);
      const added = additions[0]; createdIds.push(added.id);
      expect(added.printing).toEqual({ kind: "card", cardId: cards[0].id });
      expect(added.owner).toBe(side); expect(added.zone).toBe("hand");
      expect(engine.view(board, side).instances[added.id]?.characteristics.subtype).toBe("Explorer");
      if (ability === 1) expect(added.variant).toEqual(board.instances[source].variant);
      else expect(added.variant).toEqual({ amplified: false });
    }
    expect(createdIds[0]).not.toBe(createdIds[1]);
    expect(invariantViolations(board, engine.catalog)).toEqual([]);
    expect(board.sides[side === "player" ? "enemy" : "player"].score).toBe(0);
  });
});
