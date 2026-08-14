import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import cardsSource from "../../../data/cards.toml?raw";
import dreamwellSource from "../../../data/dreamwell.toml?raw";
import dreamAvatarsSource from "../../../data/dream_avatars.toml?raw";
import figmentsSource from "../../../data/figments.toml?raw";
import tutorialSource from "../../../data/tutorial.toml?raw";
import { isHighlightedRulesTextTerm } from "../../cumulus/components/card/RulesText";
import { GLOSSARY_IDS, lookupGlossaryTerm } from "../../data/glossary";
import { parseTutorialTriggers } from "../../data/tutorial-actions";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import { matchTutorialGuidance } from "./tutorial-guidance";
import { asTutorialTriggerId } from "../../types/identifiers";
import type { TutorialTriggerId } from "../../types/identifiers";
import { asCardId } from "../../types/card-identity";
import { asGlossaryEntryId } from "../../types/identifiers";

function glossaryTrigger(
  id: string,
  priority: number,
): TutorialTriggerDefinition {
  return {
    id: asTutorialTriggerId(id),
    on: ["card-play", "dreamwell-resolve"],
    priority,
    speaker: "mira",
    duration: 3,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 700,
    match: {
      kind: "glossary",
      id: asGlossaryEntryId(
        {
          support: GLOSSARY_IDS.support,
          foresee: GLOSSARY_IDS.foresee,
          erode: GLOSSARY_IDS.erode,
        }[id] ?? id,
      ),
    },
    text: id,
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
    expect(firstMatches.map((match) => match.id)).toEqual(["foresee"]);

    const secondMatches = matchTutorialGuidance(triggers, {
      ...input,
      seenTriggerIds: new Set(firstMatches.map((match) => match.id)),
    });
    expect(secondMatches.map((match) => match.id)).toEqual(["support"]);
  });

  it("suppresses room-seen ids and keeps source-order ties stable", () => {
    const matches = matchTutorialGuidance(
      [glossaryTrigger("support", 100), glossaryTrigger("foresee", 100)],
      {
        event: "card-play",
        renderedText: "Support. Foresee 1.",
        cardKind: "character",
        seenTriggerIds: new Set([asTutorialTriggerId("support")]),
      },
    );
    expect(matches.map((match) => match.id)).toEqual(["foresee"]);
  });

  it("defers a matching keyword until after the general Event explanation", () => {
    const triggers: readonly TutorialTriggerDefinition[] = [
      {
        id: asTutorialTriggerId("event-card"),
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
    expect(firstMatches.map((match) => match.id)).toEqual(["event-card"]);

    const secondMatches = matchTutorialGuidance(triggers, {
      ...input,
      seenTriggerIds: new Set([asTutorialTriggerId("event-card")]),
    });
    expect(secondMatches.map((match) => match.id)).toEqual(["erode"]);
  });

  it("matches a card-specific trigger by UUID", () => {
    const cardId = "4408b942-09a0-4f4e-a403-10c708c6e3c5";
    const matches = matchTutorialGuidance(
      [
        {
          id: asTutorialTriggerId("flashpoint-no-valid-targets"),
          on: ["card-no-valid-targets"],
          priority: 10,
          speaker: "mira",
          duration: 4,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 500,
          match: { kind: "card-id", cardId: asCardId(cardId) },
          text: "There are no valid targets for this card",
        },
      ],
      {
        event: "card-no-valid-targets",
        cardId: asCardId(cardId),
        renderedText: "Dissolve a low-cost enemy.",
        cardKind: "event",
        seenTriggerIds: new Set(),
      },
    );

    expect(matches.map((match) => match.id)).toEqual([
      "flashpoint-no-valid-targets",
    ]);
  });
});

describe("tutorial trigger coverage", () => {
  it("covers every yellow term currently used by battle entities", () => {
    const sources = [
      ...(parse(cardsSource).cards as Array<Record<string, unknown>>),
      ...(parse(dreamwellSource).dreamwell as Array<Record<string, unknown>>),
      ...(parse(dreamAvatarsSource).dreamAvatar as Array<
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
