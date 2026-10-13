/** D20: a departed Warrior supplies the strict return bound, including the reader itself and a ceased copy. */
import { expect } from "vitest";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import { NO_DECK_MODS } from "../../engine/dsl/types";
import { NO_PROMPTS, ScriptedSource } from "../../engine/steps/sources";
import { runStep } from "../../engine/steps/runner";
import cinder from "../cards/cinderblade-legionnaire-4b2f044c";
import pathfinder from "../cards/pathfinder-b5a5c1ba";
import cavalier from "../cards/infernal-cavalier-b64f0beb";
import { parseCardId } from "../../types/card-identity";
import revenant from "../cards/burning-revenant-426825c7";

const SOURCE = parseCardId(revenant.id);
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
function scenario(side: "player" | "enemy", copy: boolean): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  const cost = copy ? 5 : revenant.energyCost ?? 0;
  const costs = [0, 1, 3, 5, revenant.energyCost ?? 0];
  const eligible = costs.flatMap((candidate, index) => candidate < cost ? [index] : []);
  const candidates = eligible.filter(index => index < 4);
  const chosen = candidates[candidates.length - 1];
  return {
    name: `${revenant.id} ${side} captures ${copy ? "a ceased other Warrior copy" : "its own departure"}`,
    spec: {
      board: { active: side, phase: "day",
        [side]: { back: [SOURCE, v.vanilla5.id], hand: [copy ? v.dissolveFigmentCopy.id : v.dissolveVictim.id],
          void: [v.vanilla0.id, v.vanilla1.id, v.vanilla3.id, v.vanilla5.id, SOURCE, v.event0.id], energy: 10, deck },
        [other]: { void: [v.vanilla0.id], deck },
      },
      steps: ids => [playFromHand(ids, side)],
      answers: ids => [[ids[side].back[copy ? 1 : 0]!], ...(eligible.length > 1 && chosen !== undefined ? [[ids[side].void[chosen]]] : [])],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].back[0]!;
      const created = events.find(e => e.kind === "cardCreated" && e.printing.kind === "figmentCopy" && e.printing.cardId === v.vanilla5.id);
      if (copy && created?.kind !== "cardCreated") throw new Error("Missing public Warrior copy");
      const subject = copy && created?.kind === "cardCreated" ? created.instance : source;
      const dissolved = events.findIndex(e => e.kind === "dissolved" && e.instance === subject);
      const queued = events.findIndex(e => e.kind === "triggerQueued" && e.source === source && e.subject === subject);
      expect(dissolved).toBeGreaterThanOrEqual(0);
      expect(queued).toBeGreaterThan(dissolved);
      expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source, subject, controller: side, lastKnownSubjectCost: cost }));
      if (copy) {
        expect(state.instances[subject]).toBeUndefined();
        expect(state.instances[source].zone).toBe("play");
        expect(state.instances[ids[side].back[1]!].zone).toBe("play");
      } else expect(state.instances[source].zone).toBe("void");
      const returned = events.flatMap(e => e.kind === "returnedToHand" ? [e.instance] : []);
      expect(returned).toEqual(chosen === undefined ? [] : [ids[side].void[chosen]]);
      if (chosen !== undefined) {
        const id = ids[side].void[chosen];
        expect(state.instances[id]).toMatchObject({ zone: "hand", owner: side, controller: side });
        expect(events.findIndex(e => e.kind === "returnedToHand" && e.instance === id)).toBeGreaterThan(queued);
      }
      for (const [index, id] of ids[side].void.entries()) if (index !== chosen) expect(state.instances[id].zone).toBe("void");
      expect(state.instances[ids[other].void[0]].zone).toBe("void");
      expect(state.stack).toEqual([]);
    },
  };
}

const leaves = [revenant, cinder, pathfinder, cavalier];
const engine = createEngine(testCatalog(leaves.map(engineCardFromContent)));
const idsOfLeaves = leaves.map(raw => parseCardId(raw.id));
const typeScenarios: NamedScenario[] = (["player", "enemy"] as const).map(side => ({
  name: `${revenant.id} ${side} excludes a discarded Warrior-tagged event from all four returns`,
  spec: {
    board: { active: side, phase: "day", [side]: { back: [...idsOfLeaves, v.discardOne.id],
      hand: [{ cardId: v.vanilla0.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "Warrior" } } }, v.dissolveVictim.id],
      void: [v.vanilla0.id, v.vanilla0.id, v.vanilla0.id], deck },
    },
    steps: ids => [{ side, action: { kind: "activate", source: ids[side].back[4]!, ability: 0 } }],
    answers: ids => [[ids[side].hand[0]]],
  },
  check: ({ state, ids }) => {
    const changed = ids[side].hand[0], spell = ids[side].hand[1];
    expect(state.instances[changed].zone).toBe("void");
    for (const source of ids[side].back.slice(0, 4)) {
      const cast = runStep(state, { kind: "play", card: spell, from: "hand" }, new ScriptedSource([[source!]]), engine.catalog);
      if (cast.kind !== "done") throw new Error("Missing public dissolve play");
      const dissolved = runStep(cast.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
      if (dissolved.kind !== "done") throw new Error("Missing public dissolution");
      let current = dissolved.state, choices = 0;
      while (current.triggerQueue.length > 0) {
        const resolved = runStep(current, { kind: "resolveTrigger" }, {
          answer(prompt) {
            if (prompt.kind !== "chooseTargets") throw new Error("Unexpected return choice");
            expect(prompt.candidates).not.toContain(changed);
            const genuine = ids[side].void.find(id => prompt.candidates.includes(id));
            expect(genuine).toBeDefined();
            choices += 1;
            return [genuine!];
          },
        }, engine.catalog);
        if (resolved.kind !== "done") throw new Error("Missing public return resolution");
        current = resolved.state;
      }
      // A zero-cost subject gives the strict reader no target; each unbounded leaf still offers Warriors.
      const raw = leaves[ids[side].back.indexOf(source)];
      expect(choices).toBeGreaterThanOrEqual(parseCardId(raw.id) === SOURCE && (raw.energyCost ?? 0) === 0 ? 0 : 1);
      expect(current.instances[changed].zone).toBe("void");
    }
  },
}));

export default { slug: "cards-94", scenarios: [...(["player", "enemy"] as const).flatMap(side => [false, true].map(copy => scenario(side, copy))), ...typeScenarios] } satisfies ScenarioModule;
