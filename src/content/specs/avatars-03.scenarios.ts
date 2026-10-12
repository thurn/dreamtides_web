/** D20: turn-limited discard subjects and random grants after successive void departures. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../engine/catalog";
import { activated, energy, fromVoid } from "../../engine/dsl/builders";
import { returnFromVoid } from "../../engine/effects/primitives";
import { createEngine } from "../../engine/engine";
import { hasKeyword } from "../../engine/rules/keywords";
import { opponent } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import { runScenario, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseAvatarId } from "../../types/identifiers";
import corvath from "../avatars/corvath-b8c1b0ab";
import vaela from "../avatars/vaela-60bd584b";

const CORVATH = parseAvatarId(corvath.id), VAELA = parseAvatarId(vaela.id);
const deck = Array.from({ length: 10 }, () => v.vanilla1.id);
const avatars = [corvath, vaela].map((avatar) => ({
  id: parseAvatarId(avatar.id), status: "authored" as const, abilities: avatar.abilities!,
}));
const returner: EngineCardDefinition = {
  ...v.vanilla0, id: syntheticId(0x22301), status: "authored", costs: [energy(0)],
  abilities: () => [activated([], returnFromVoid(fromVoid()))],
};
const local = createEngine(testCatalog([returner], { avatars }));
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  scenarios.push({
    name: `${corvath.id} ${side} grants only the first discard each turn, expires and renews`,
    spec: {
      board: { active: side, phase: "day", [side]: {
        avatar: CORVATH, back: [v.discardOne.id],
        hand: [v.event0.id, v.event1.id, v.vanilla2.id], deck,
      }, [other]: { hand: [v.event0.id], back: [v.discardOne.id], deck } },
      steps: (ids) => [0, 1].map(() => ({ side, action: {
        kind: "activate" as const, source: ids[side].back[0]!, ability: 0,
      } })),
      answers: (ids) => [[ids[side].hand[0]], [ids[side].hand[1]]],
    },
    check: ({ state, ids, events }) => {
      const source = { kind: "avatar", side } as const;
      const grants = events.filter((entry) => entry.kind === "effectStarted");
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ source, controller: side, expiry: { at: "endOfTurn" },
        change: { kind: "keyword", instance: ids[side].hand[0], keyword: "reclaim", gains: true } });
      expect(events.filter((entry) => entry.kind === "triggerResolved" &&
        entry.source !== null && typeof entry.source === "object" && entry.source.kind === "avatar" && entry.source.side === side)).toHaveLength(1);
      expect(hasKeyword(state, local.catalog, ids[side].hand[0], "reclaim")).toBe(true);
      expect(hasKeyword(state, local.catalog, ids[side].hand[1], "reclaim")).toBe(false);
      const away = passUntil(local, state, at(local, other, "day"));
      expect(away.events).toContainEqual(expect.objectContaining({ kind: "effectEnded", effect: grants[0].effect }));
      expect(hasKeyword(away.state, local.catalog, ids[side].hand[0], "reclaim")).toBe(false);
      const opponentDiscard = local.apply(away.state, other,
        { kind: "activate", source: ids[other].back[0]!, ability: 0 },
        new ScriptedSource([[ids[other].hand[0]]]));
      expect(opponentDiscard.events.filter((entry) => entry.kind === "triggerResolved")).toEqual([]);
      const next = passUntil(local, opponentDiscard.state, at(local, side, "day"));
      const renewed = local.apply(next.state, side,
        { kind: "activate", source: ids[side].back[0]!, ability: 0 },
        new ScriptedSource([[ids[side].hand[2]]]));
      expect(renewed.events).toContainEqual(expect.objectContaining({ kind: "effectStarted", source,
        expiry: { at: "endOfTurn" }, change: { kind: "keyword", instance: ids[side].hand[2], keyword: "reclaim", gains: true } }));
      expect(hasKeyword(renewed.state, local.catalog, ids[side].hand[2], "reclaim")).toBe(true);
      expect(hasKeyword(renewed.state, local.catalog, ids[side].hand[1], "reclaim")).toBe(false);
    },
  });
  scenarios.push({
    name: `${vaela.id} ${side} grants a remaining random void card permanently and nothing from an empty void`,
    // The shared runner registers this case; the check runs its explicit private synthetic fixture.
    spec: { board: { active: side, phase: "day", [side]: { avatar: VAELA, deck }, [other]: { deck } }, steps: () => [] },
    check: () => {
      const result = runScenario(local, {
        board: { active: side, phase: "day", [side]: {
          avatar: VAELA, back: [returner.id], void: [v.event0.id, v.event1.id], deck,
        }, [other]: { void: [v.vanilla1.id], deck } },
        steps: (ids) => [0, 1].map(() => ({ side, action: { kind: "activate" as const, source: ids[side].back[0]!, ability: 0 } })),
        // The second departure has one legal target and is answered by the engine.
        answers: (ids) => [[ids[side].void[0]]],
      });
      const { state, ids, events } = result;
      const source = { kind: "avatar", side } as const;
      const subjects = events.flatMap((entry) => entry.kind === "triggerQueued" &&
        entry.source !== null && typeof entry.source === "object" && entry.source.kind === "avatar" && entry.source.side === side ? [entry.subject] : []);
      expect(subjects).toEqual(ids[side].void);
      const grants = events.filter((entry) => entry.kind === "effectStarted");
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ source, controller: side, expiry: { at: "never" },
        change: { kind: "keyword", instance: ids[side].void[1], keyword: "reclaim", gains: true } });
      expect(events.filter((entry) => entry.kind === "triggerResolved" &&
        entry.source !== null && typeof entry.source === "object" && entry.source.kind === "avatar" && entry.source.side === side)).toHaveLength(2);
      expect(state.rng["random:selection"] ?? 0).toBe((result.start.rng["random:selection"] ?? 0) + 1);
      for (const instance of ids[side].void) expect(state.instances[instance].zone).toBe("hand");
      expect(hasKeyword(state, local.catalog, ids[side].void[0], "reclaim")).toBe(false);
      expect(hasKeyword(state, local.catalog, ids[side].void[1], "reclaim")).toBe(true);
      expect(hasKeyword(state, local.catalog, ids[other].void[0], "reclaim")).toBe(false);
      const away = passUntil(local, state, at(local, other, "day"));
      expect(hasKeyword(away.state, local.catalog, ids[side].void[1], "reclaim")).toBe(true);
      expect(away.events.filter((entry) => entry.kind === "effectEnded")).toEqual([]);
    },
  });
}

export default { slug: "avatars-03", scenarios } satisfies ScenarioModule;
