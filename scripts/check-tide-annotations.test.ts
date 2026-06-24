import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkArtifactAnnotations,
  checkTideClaims,
  formatAnnotationFailures,
  tideSignature,
} from "./lib/tide-annotation-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Guards the player-facing tide labels against the recurring drift where the
// affinity grow reshapes a tide's cards while its hand-authored label stays pinned
// to the old archetype by tide id. Each tide's `claims` ({ tribe, mechanics }) is
// validated against its ACTUAL contents, so this re-derives expectations from the
// cards rather than asserting hardcoded values — editing a TOML never trips it on
// its own; only an archetype-level shift that leaves a label stale does.
describe("tide annotation consistency", () => {
  it("every tides4 tide's label matches its deck contents and names are unique", () => {
    const result = checkArtifactAnnotations({
      artifactPath: resolve(ROOT, "data/tides4.jsonc"),
      requireClaims: true,
    });
    expect(result.ok, result.ok ? "" : formatAnnotationFailures(result)).toBe(
      true,
    );
  });

  it("tides5 inherits unique displayNames from tides4", () => {
    const result = checkArtifactAnnotations({
      artifactPath: resolve(ROOT, "data/tides5.jsonc"),
      requireClaims: false,
    });
    expect(result.ok, result.ok ? "" : formatAnnotationFailures(result)).toBe(
      true,
    );
  });

  // The check itself must actually catch the failure modes it exists to prevent.
  // These use synthetic tides so they never depend on production card data.
  it("flags a swapped tribe claim", () => {
    const warriorDeck = {
      id: "test",
      claims: { tribe: "Spirit Animal" },
      cards: Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        subtype: "Warrior",
        text: "",
      })),
    };
    const { ok, problems } = checkTideClaims(warriorDeck);
    expect(ok).toBe(false);
    expect(problems.join(" ")).toMatch(/Spirit Animal/);
  });

  it("flags a claimed mechanic the deck lacks", () => {
    const noCopyDeck = {
      id: "test",
      claims: { mechanics: ["copy"] },
      cards: Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        subtype: "Survivor",
        text: "Abandon a character: gain 1 energy.",
      })),
    };
    const { ok, problems } = checkTideClaims(noCopyDeck);
    expect(ok).toBe(false);
    expect(problems.join(" ")).toMatch(/copy/);
  });

  it("passes a claim that matches contents", () => {
    const deck = {
      id: "test",
      claims: { tribe: "Survivor", mechanics: ["abandon"] },
      cards: Array.from({ length: 12 }, (_, i) => ({
        id: `c${i}`,
        subtype: "Survivor",
        text: "Abandon a character: draw a card.",
      })),
    };
    expect(checkTideClaims(deck).ok).toBe(true);
  });

  it("treats a character tribe as dominant even when events outnumber it", () => {
    // A sacrifice deck can hold more events than any single character subtype yet
    // still legitimately be a Survivor deck.
    const cards = [
      ...Array.from({ length: 14 }, (_, i) => ({
        id: `s${i}`,
        subtype: "Survivor",
        text: "Abandon a character.",
      })),
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `e${i}`,
        text: "Draw a card.",
      })),
    ];
    expect(checkTideClaims({ claims: { tribe: "Survivor" }, cards }).ok).toBe(
      true,
    );
  });

  it("rejects an unknown mechanic key", () => {
    const { ok, problems } = checkTideClaims({
      claims: { mechanics: ["telepathy"] },
      cards: [{ id: "c", text: "" }],
    });
    expect(ok).toBe(false);
    expect(problems.join(" ")).toMatch(/unknown mechanic/);
  });

  it("counts mechanics from rules text", () => {
    const sig = tideSignature({
      cards: [
        { id: "a", text: "Reclaim 2." },
        { id: "b", text: "Discard a card." },
        { id: "c", text: "Gain 1 ●." },
      ],
    });
    expect(sig.mechanics.reclaim).toBe(1);
    expect(sig.mechanics.discard).toBe(1);
  });
});
