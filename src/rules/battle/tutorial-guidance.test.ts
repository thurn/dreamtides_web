import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import cardsSource from "../../../data/cards.toml?raw";
import dreamwellSource from "../../../data/dreamwell.toml?raw";
import avatarsSource from "../../../data/avatars.toml?raw";
import figmentsSource from "../../../data/figments.toml?raw";
import tutorialSource from "../../../data/tutorial.toml?raw";
import { isHighlightedRulesTextTerm } from "../../cumulus/components/card/RulesText";
import { GLOSSARY_IDS, lookupGlossaryTerm } from "../../data/glossary";
import { parseTutorialTriggers } from "../../data/tutorial-actions";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import { matchTutorialGuidance } from "./tutorial-guidance";
import type { TutorialTriggerId } from "../../types/identifiers";
import { testTutorialTriggerId, testGlossaryEntryId, testCardId } from "../../types/test-identities";

function glossaryTrigger(
  idSeed: string,
  priority: number,
): TutorialTriggerDefinition {
  const glossaryId = (() => {
    switch (idSeed) {
      case "support":
        return GLOSSARY_IDS.support;
      case "foresee":
        return GLOSSARY_IDS.foresee;
      case "erode":
        return GLOSSARY_IDS.erode;
      default:
        return testGlossaryEntryId(idSeed);
    }
  })();
  return {
    id: testTutorialTriggerId(idSeed),
    on: ["card-play", "dreamwell-resolve"],
    priority,
    speaker: "mira",
    duration: 3,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 700,
    match: {
      kind: "glossary",
      id: glossaryId,
    },
    text: idSeed,
  };
}

describe("matchTutorialGuidance", () => {
  it("selects only the highest-priority unseen explanation per event", () => {
    const triggers = [
      glossaryTrigger("support", 100),
      glossaryTrigger("foresee", 50),
    ];
    const input = {
      event: "card-play" as const,
      renderedText: "Foresee 1. Supports adjacent characters.",
      cardKind: "character" as const,
      seenTriggerIds: new Set<TutorialTriggerId>(),
    };

    const firstMatches = matchTutorialGuidance(triggers, input);
    expect(firstMatches.map((match) => match.id)).toEqual([
      testTutorialTriggerId("foresee"),
    ]);

    const secondMatches = matchTutorialGuidance(triggers, {
      ...input,
      seenTriggerIds: new Set(firstMatches.map((match) => match.id)),
    });
    expect(secondMatches.map((match) => match.id)).toEqual([
      testTutorialTriggerId("support"),
    ]);
  });

  it("suppresses room-seen ids and keeps source-order ties stable", () => {
    const matches = matchTutorialGuidance(
      [glossaryTrigger("support", 100), glossaryTrigger("foresee", 100)],
      {
        event: "card-play",
        renderedText: "Support. Foresee 1.",
        cardKind: "character",
        seenTriggerIds: new Set([testTutorialTriggerId("support")]),
      },
    );
    expect(matches.map((match) => match.id)).toEqual([
      testTutorialTriggerId("foresee"),
    ]);
  });

  it("defers a matching keyword until after the general Event explanation", () => {
    const triggers: readonly TutorialTriggerDefinition[] = [
      {
        id: testTutorialTriggerId("event-card"),
        on: ["card-play"],
        priority: 10,
        speaker: "mira",
        duration: 3,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        match: { kind: "card-type", cardType: "event" },
        text: "event",
      },
      glossaryTrigger("erode", 100),
    ];
    const input = {
      event: "card-play",
      renderedText: "Erode 3.",
      cardKind: "event",
      seenTriggerIds: new Set<TutorialTriggerId>(),
    } as const;

    const firstMatches = matchTutorialGuidance(triggers, input);
    expect(firstMatches.map((match) => match.id)).toEqual([
      testTutorialTriggerId("event-card"),
    ]);

    const secondMatches = matchTutorialGuidance(triggers, {
      ...input,
      seenTriggerIds: new Set([testTutorialTriggerId("event-card")]),
    });
    expect(secondMatches.map((match) => match.id)).toEqual([
      testTutorialTriggerId("erode"),
    ]);
  });

  it("matches a card-specific trigger by UUID", () => {
    const cardId = "4408b942-09a0-4f4e-a403-10c708c6e3c5";
    const matches = matchTutorialGuidance(
      [
        {
          id: testTutorialTriggerId("flashpoint-no-valid-targets"),
          on: ["card-no-valid-targets"],
          priority: 10,
          speaker: "mira",
          duration: 4,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 500,
          match: { kind: "card-id", cardId: testCardId(cardId) },
          text: "There are no valid targets for this card",
        },
      ],
      {
        event: "card-no-valid-targets",
        cardId: testCardId(cardId),
        renderedText: "Dissolve a low-cost enemy.",
        cardKind: "event",
        seenTriggerIds: new Set(),
      },
    );

    expect(matches.map((match) => match.id)).toEqual([
      testTutorialTriggerId("flashpoint-no-valid-targets"),
    ]);
  });
});

describe("tutorial trigger coverage", () => {
  it("covers every yellow term currently used by battle entities", () => {
    const sources = [
      ...(parse(cardsSource).cards as Array<Record<string, unknown>>),
      ...(parse(dreamwellSource).dreamwell as Array<Record<string, unknown>>),
      ...(parse(avatarsSource).avatar as Array<
        Record<string, unknown>
      >),
      ...(parse(figmentsSource).figments as Array<Record<string, unknown>>),
    ];
    const highlightedGlossaryIds = new Set<string>();
    for (const record of sources) {
      const text = record["rendered-text"];
      if (typeof text !== "string") continue;
      for (const word of text.match(/[A-Za-z]+/gu) ?? []) {
        if (!isHighlightedRulesTextTerm(word)) continue;
        const glossary = lookupGlossaryTerm(word);
        if (glossary !== undefined) highlightedGlossaryIds.add(glossary.id);
      }
    }
    const parsedTutorial = parse(tutorialSource) as Record<string, unknown>;
    const triggerGlossaryIds = new Set(
      parseTutorialTriggers(parsedTutorial.triggers).flatMap((trigger) =>
        trigger.match.kind === "glossary" ? [trigger.match.id] : [],
      ),
    );
    expect([...highlightedGlossaryIds].sort()).toEqual(
      [...triggerGlossaryIds]
        .filter((id) => id !== GLOSSARY_IDS.dissolvedTrigger)
        .sort(),
    );
  });
});
