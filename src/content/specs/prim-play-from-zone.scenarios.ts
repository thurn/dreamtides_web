/** Real catalog compositions across filtering, trigger duration, and hidden-source AI sampling. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import god from "../cards/god-of-the-veil-fa036c27";
import salvager from "../cards/clockwork-salvager-6f1833a0";
import technician from "../cards/echo-technician-cd3d8e4a";
import riftwalker from "../cards/riftwalker-a9b5afaa";
import fragments from "../cards/fragments-of-vision-3725379c";
import seek from "../cards/seek-answers-8f69312f";

const GOD = parseCardId(god.id), SALVAGER = parseCardId(salvager.id), TECHNICIAN = parseCardId(technician.id);
const RIFTWALKER = parseCardId(riftwalker.id), FRAGMENTS = parseCardId(fragments.id), SEEK = parseCardId(seek.id);
const DECK = Array.from({ length: 10 }, () => v.vanilla1.id);
const engine = createEngine(testCatalog([god, salvager, technician, riftwalker, fragments, seek].map(engineCardFromContent)));
const plays = (state: Parameters<typeof engine.legalActions>[0]) => engine.legalActions(state, "player").filter((a) => a.kind === "play" && a.from === "void");

export default {
  slug: "prim-play-from-zone",
  scenarios: [
    {
      name: `${technician.id} its Materialized trigger erodes four cards`,
      spec: {
        board: { active: "player", phase: "day", player: { hand: [TECHNICIAN], energy: 2, deck: DECK }, enemy: { deck: DECK } },
        steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }],
      },
      check: ({ state, events, ids }) => {
        expect(events.filter((e) => e.kind === "eroded" && e.side === "player").map((e) => e.kind === "eroded" ? e.instance : null)).toEqual(ids.player.deck.slice(0, 4));
        expect(state.sides.player.void).toEqual(ids.player.deck.slice(0, 4).reverse());
        expect(state.instances[ids.player.hand[0]]?.zone).toBe("play");
      },
    },
    {
      name: `${god.id} covers only affordable small void characters for normal costs while in play`,
      spec: {
        board: { active: "player", phase: "day", player: { back: [GOD, RIFTWALKER], void: [v.vanilla2.id, v.vanilla3.id, v.event0.id], energy: 8, deck: DECK }, enemy: { deck: DECK } },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.void[0], from: "void" } },
          { side: "player", action: { kind: "activate", source: ids.player.back[1]!, ability: 0 } },
        ],
        answers: (ids) => [[ids.player.back[0]!]],
      },
      check: ({ start, state, ids }) => {
        expect(plays(start)).toEqual([{ kind: "play", card: ids.player.void[0], from: "void" }]);
        expect(state.instances[ids.player.void[0]]?.zone).toBe("play");
        expect(state.instances[ids.player.void[0]]?.status.reclaimed).toBe(false);
        expect(state.sides.player.currentEnergy).toBe(5);
        expect(state.instances[ids.player.back[0]!].zone).toBe("hand");
        expect(plays(state)).toEqual([]);
      },
    },
    {
      name: `${salvager.id} its discard trigger names only that card through source hiding and expires at Ending`,
      spec: {
        board: { active: "player", phase: "day", player: { back: [SALVAGER, RIFTWALKER], hand: [SEEK, v.vanilla2.id, FRAGMENTS], void: [v.vanilla3.id], energy: 12, deck: DECK }, enemy: { deck: DECK } },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "activate", source: ids.player.back[1]!, ability: 0 } },
          { side: "player", action: { kind: "play", card: ids.player.hand[2], from: "hand" } },
        ],
        answers: (ids) => [[ids.player.hand[1]], [ids.player.back[0]!, ids.player.deck[0]]],
      },
      check: ({ state, events, ids }) => {
        const source = ids.player.back[0]!, discarded = ids.player.hand[1];
        expect(events).toContainEqual(expect.objectContaining({ kind: "discarded", instance: discarded }));
        expect(state.instances[source]?.zone).toBe("deck");
        expect(plays(state)).toEqual([{ kind: "play", card: discarded, from: "void" }]);
        for (const side of ["player", "enemy"] as const) {
          const permission = engine.view(state, side).floating;
          expect(permission).toHaveLength(1);
          expect(permission[0]).toMatchObject({ source: null, expiry: { at: "endOfTurn" }, change: { instance: discarded } });
        }
        const ended = passUntil(engine, state, at(engine, "enemy", "day")).state;
        expect(ended.floating).toEqual([]);
      },
    },
    {
      name: `${technician.id} its next-event permission survives source hiding until used`,
      spec: {
        board: { active: "player", phase: "day", player: { back: [TECHNICIAN, RIFTWALKER], hand: [FRAGMENTS], void: [v.event1.id, v.vanilla1.id], energy: 12, deck: DECK }, enemy: { deck: DECK } },
        steps: (ids) => [
          { side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 1 } },
          { side: "player", action: { kind: "activate", source: ids.player.back[1]!, ability: 0 } },
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
        ],
        answers: (ids) => [[ids.player.back[0]!, ids.player.deck[0]]],
      },
      check: ({ state, ids }) => {
        const source = ids.player.back[0]!, spell = ids.player.void[0];
        expect(state.instances[source]?.zone).toBe("deck");
        expect(plays(state)).toHaveLength(2);
        expect(plays(state)).toEqual(expect.arrayContaining([{ kind: "play", card: spell, from: "void" }, { kind: "play", card: ids.player.hand[0], from: "void" }]));
        const seen = engine.view(state, "player");
        expect(seen.floating).toHaveLength(1);
        expect(seen.floating[0]).toMatchObject({ source: null, expiry: { at: "never" }, change: { filter: { cardType: "event" }, next: true } });
        const entries = Object.values(state.instances).filter((i) => i.owner === "player" && i.printing.kind === "card").map((i) => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : v.vanilla1.id }));
        const sample = engine.determinize(seen, { player: entries, enemy: DECK.map((cardId) => ({ cardId })) }, () => 0.5);
        expect(plays(sample)).toEqual(plays(state));
        const used = engine.apply(sample, "player", { kind: "play", card: spell, from: "void" }, { answer: () => { throw new Error("vanilla event has no prompt"); } }).state;
        expect(used.floating).toEqual([]);
      },
    },
  ],
} satisfies ScenarioModule;
