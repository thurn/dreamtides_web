/**
 * The frozen reference policies stay frozen: their modules and reference
 * data match the manifest's hashes, and their public decisions on fixed
 * synthetic positions match the decisions recorded when they were frozen.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI } from "../../../content/ai";
import { opponent, SIDES, type Side } from "../../state/ids";
import type { BattleState } from "../../state/types";
import { NO_PROMPTS } from "../../steps/sources";
import { SYNTHETIC } from "../../testing/synthetic-cards";
import { runPolicy } from "../decide";
import { board, deck, engine, entries, topLevelRequest } from "../policy.fixtures";
import type { PolicyId } from "../types";
import { REFERENCE_MANIFEST } from "./manifest";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const REFERENCES = ["greedy@5", "greedy@7.2"] as const satisfies readonly PolicyId[];

const decklists = { player: entries(deck), enemy: entries(deck) };
const { vanilla1, vanilla3, vanilla5 } = SYNTHETIC;

/** Fixed synthetic decisions: a Day with a character to deploy and challengers to position, and a Dusk with a blocker to place. */
function positions(side: Side): Record<string, BattleState> {
  const other = opponent(side);
  const day = board({ active: side, phase: "day", [side]: { deck, hand: [vanilla3.id], back: [vanilla1.id], energy: 3 }, [other]: { deck, front: [vanilla1.id] } }).state;
  const beforeDusk = board({ active: other, phase: "day", [side]: { deck, back: [null, null, vanilla5.id] }, [other]: { deck, front: [vanilla3.id] } }).state;
  return { day, dusk: engine.apply(beforeDusk, other, { kind: "pass" }, NO_PROMPTS).state };
}

/** The decisions each reference made when it was frozen, as JSON of its chosen action. */
const CHARACTERIZATION: Readonly<Record<(typeof REFERENCES)[number], Readonly<Record<Side, Readonly<Record<string, string>>>>>> = {
  "greedy@5": {
    player: { day: '{"kind":"action","action":{"kind":"play","card":"i2","from":"hand"}}', dusk: '{"kind":"action","action":{"kind":"pass"}}' },
    enemy: { day: '{"kind":"action","action":{"kind":"play","card":"i9","from":"hand"}}', dusk: '{"kind":"action","action":{"kind":"pass"}}' },
  },
  "greedy@7.2": {
    player: {
      day: '{"kind":"action","action":{"kind":"reposition","card":"i1","to":{"rank":"front","index":1}}}',
      dusk: '{"kind":"action","action":{"kind":"reposition","card":"i1","to":{"rank":"front","index":0}}}',
    },
    enemy: {
      day: '{"kind":"action","action":{"kind":"reposition","card":"i8","to":{"rank":"front","index":1}}}',
      dusk: '{"kind":"action","action":{"kind":"reposition","card":"i8","to":{"rank":"front","index":0}}}',
    },
  },
};

describe("the frozen reference policies", () => {
  for (const policy of REFERENCES) {
    it(`keeps ${policy}'s modules and reference data at their manifest hashes`, () => {
      const entry = REFERENCE_MANIFEST[policy];
      expect(entry).toBeDefined();
      for (const [path, hash] of Object.entries(entry?.modules ?? {})) expect(sha256(readFileSync(path)), path).toBe(hash);
      const data = Object.fromEntries((entry?.data ?? []).map((key) => [key, (AI.references as Record<string, unknown>)[key]]));
      expect(sha256(canonical(data))).toBe(entry?.dataSha256);
    });

    for (const side of SIDES) {
      it(`makes ${policy}'s recorded decisions for ${side}`, () => {
        for (const [name, state] of Object.entries(positions(side))) {
          const result = runPolicy(engine, topLevelRequest(state, side, policy, decklists, { iterations: 64 }));
          expect(JSON.stringify(result.choice), name).toBe(CHARACTERIZATION[policy][side][name]);
        }
      });
    }
  }
});
