import { testJourneySeed } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { JourneyContent } from "../../data/journey-content";
import type { JourneyState } from "../../types/journey";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDreamsignTemplate,
  makeAuguryTestJourneyState,
  makeAuguryTestSite,
} from "../testing/fixtures";
import { buildAuguryContext } from "../context/buildAuguryContext";
import {
  compareCodeUnits,
  generateAuguryEncounter,
  generateAuguryEncounterWithDebug,
} from "./generateAuguryEncounter";
import { parseSiteId } from "../../types/identifiers";
import { testCardId, testDreamsignId } from "../../types/test-identities";

function poolCards(count: number): CardData[] {
  const cards: CardData[] = [];
  for (let i = 0; i < count; i += 1) {
    const cardNumber = 1000 + i;
    const id = `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`;
    cards.push(
      makeAuguryTestCard({
        id: testCardId(id),
        cardNumber,
        name: parseCardName(`Pool ${String(cardNumber)}`),
      }),
    );
  }
  return cards;
}

function dreamsignTemplates(count: number) {
  const templates = [];
  for (let i = 0; i < count; i += 1) {
    const id = `dsign-${String(i)}`;
    templates.push(
      makeAuguryTestDreamsignTemplate({
        id: testDreamsignId(id),
        name: `Sign ${String(i)}`,
      }),
    );
  }
  return templates;
}

function fixtureContent(input: {
  poolCount?: number;
  dreamsignCount?: number;
}): JourneyContent {
  const cards = poolCards(input.poolCount ?? 30);
  const templates = dreamsignTemplates(input.dreamsignCount ?? 10);
  return makeAuguryTestContent({
    cards,
    dreamsignTemplates: templates,
  });
}

function contextFor(content: JourneyContent, state: JourneyState) {
  return buildAuguryContext({
    journeyState: state,
    journeyContent: content,
    site: makeAuguryTestSite({ id: parseSiteId("site-gen-fixture") }),
  });
}

describe("generateAuguryEncounter", () => {
  it("uses locale-free code-unit ordering for signature inputs", () => {
    expect(compareCodeUnits("B", "a")).toBeLessThan(0);
    expect(["a", "B"].sort(compareCodeUnits)).toEqual(["B", "a"]);
  });

  it("produces exactly two offers from different families across seeds", () => {
    const content = fixtureContent({});
    for (let s = 0; s < 30; s += 1) {
      const state = makeAuguryTestJourneyState({ seed: testJourneySeed(`seed-${String(s)}`) });
      const encounter = generateAuguryEncounter(contextFor(content, state));
      expect(encounter.offers).toHaveLength(2);
      const [a, b] = encounter.offers;
      expect(a.family).not.toBe(b.family);
      for (const offer of encounter.offers) {
        const choiceCount = offer.choiceRequest?.candidates.length ?? 0;
        expect(offer.applyPayload !== undefined || choiceCount > 0).toBe(true);
        expect(choiceCount).toBeLessThanOrEqual(4);
      }
    }
  });

  it("persists only semantic encounter and reward data", () => {
    const content = fixtureContent({});
    const state = makeAuguryTestJourneyState({ seed: testJourneySeed("semantic-data") });
    const encounter = generateAuguryEncounter(contextFor(content, state));

    expect(encounter).not.toHaveProperty("dialogue");
    expect(encounter).not.toHaveProperty("acceptReaction");
    for (const offer of encounter.offers) {
      expect(offer).not.toHaveProperty("title");
      expect(offer).not.toHaveProperty("summary");
      expect(offer).not.toHaveProperty("detailHeadline");
      expect(offer).not.toHaveProperty("detailSubtitle");
      if (offer.choiceRequest !== undefined) {
        expect(offer.choiceRequest).not.toHaveProperty("prompt");
        for (const candidate of offer.choiceRequest.candidates) {
          expect(candidate).not.toHaveProperty("title");
          expect(candidate).not.toHaveProperty("summary");
        }
      }
    }
  });

  it("records roll attempts and attaches a trace to each offer", () => {
    const content = fixtureContent({});
    for (let s = 0; s < 10; s += 1) {
      const state = makeAuguryTestJourneyState({
        seed: testJourneySeed(`rolls-${String(s)}`),
      });
      const { encounter, debug } = generateAuguryEncounterWithDebug(
        contextFor(content, state),
      );
      // The final built archetype is the last attempt in each slot's roll log.
      expect(debug.rollsA.length).toBeGreaterThan(0);
      expect(debug.rollsB.length).toBeGreaterThan(0);
      expect(debug.rollsA[debug.rollsA.length - 1]).toEqual({
        archetypeId: debug.rolledA,
        built: true,
      });
      expect(debug.rollsB[debug.rollsB.length - 1]).toEqual({
        archetypeId: debug.rolledB,
        built: true,
      });
      // Any earlier attempts are dead rolls (eligible builder, null build).
      for (const attempt of debug.rollsA.slice(0, -1)) {
        expect(attempt.built).toBe(false);
      }
      // Every offer carries a trace whose selection explains its targetKey.
      for (const offer of encounter.offers) {
        expect(offer.trace).toBeDefined();
        expect(offer.trace?.candidates.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic for the same (seed, site, state)", () => {
    const content = fixtureContent({});
    const state = makeAuguryTestJourneyState({ seed: testJourneySeed("stable-seed") });
    const a = generateAuguryEncounter(contextFor(content, state));
    const b = generateAuguryEncounter(contextFor(content, state));
    expect(a).toEqual(b);
  });

  it("yields varied outcomes when only the seed changes", () => {
    const content = fixtureContent({});
    const tuples = new Set<string>();
    for (let s = 0; s < 30; s += 1) {
      const state = makeAuguryTestJourneyState({ seed: testJourneySeed(`vary-${String(s)}`) });
      const encounter = generateAuguryEncounter(contextFor(content, state));
      const [a, b] = encounter.offers;
      tuples.add(
        `${a.archetypeId}:${a.targetKey}|${b.archetypeId}:${b.targetKey}`,
      );
    }
    expect(tuples.size).toBeGreaterThanOrEqual(5);
  });

  it("still yields a valid encounter for an empty deck", () => {
    const content = fixtureContent({});
    const state = makeAuguryTestJourneyState({
      seed: testJourneySeed("empty-deck"),
      deck: [],
    });
    const encounter = generateAuguryEncounter(contextFor(content, state));
    expect(encounter.offers).toHaveLength(2);
    expect(encounter.offers[0].family).not.toBe(encounter.offers[1].family);
  });

  it("forces an eligible archetype into slot A when requested", () => {
    const content = fixtureContent({});
    const state = makeAuguryTestJourneyState({ seed: testJourneySeed("force-seed") });
    const baseContext = contextFor(content, state);
    const { debug } = generateAuguryEncounterWithDebug(baseContext);

    expect(debug.eligibleArchetypeIds.length).toBeGreaterThan(0);
    for (const archetypeId of debug.eligibleArchetypeIds) {
      const forced = generateAuguryEncounterWithDebug({
        ...baseContext,
        forcedArchetypeId: archetypeId,
      });
      // An eligible archetype is always honored in slot A.
      expect(forced.debug.forcedArchetypeId).toBe(archetypeId);
      expect(forced.encounter.offers[0].archetypeId).toBe(archetypeId);
      expect(forced.encounter.offers[0].family).not.toBe(
        forced.encounter.offers[1].family,
      );
    }
  });

  it("ignores a forced archetype that is not eligible", () => {
    const content = fixtureContent({});
    const state = makeAuguryTestJourneyState({ seed: testJourneySeed("force-ineligible") });
    const baseContext = contextFor(content, state);
    const baseline = generateAuguryEncounter(baseContext);
    const { encounter, debug } = generateAuguryEncounterWithDebug({
      ...baseContext,
      // A syntactically valid id that is excluded from the eligible set here.
      forcedArchetypeId: "add_site",
    });

    if (!debug.eligibleArchetypeIds.includes("add_site")) {
      expect(debug.forcedArchetypeId).toBeNull();
      // Falls back to the unforced encounter for the same parameters.
      expect(encounter).toEqual(baseline);
    }
  });

  it("forcing is deterministic for the same parameters", () => {
    const content = fixtureContent({});
    const state = makeAuguryTestJourneyState({ seed: testJourneySeed("force-deterministic") });
    const baseContext = contextFor(content, state);
    const { debug } = generateAuguryEncounterWithDebug(baseContext);
    const archetypeId = debug.eligibleArchetypeIds[0];
    const forcedContext = { ...baseContext, forcedArchetypeId: archetypeId };
    expect(generateAuguryEncounter(forcedContext)).toEqual(
      generateAuguryEncounter(forcedContext),
    );
  });
});
