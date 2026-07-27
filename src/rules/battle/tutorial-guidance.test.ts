import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import cardsSource from "../../../data/tabula/cards_v2.toml?raw";
import dreamwellSource from "../../../data/tabula/dreamwell.toml?raw";
import dreamAvatarsSource from "../../../data/tabula/dream_avatars_v2.toml?raw";
import figmentsSource from "../../../data/tabula/figments.toml?raw";
import tutorialSource from "../../../data/tabula/tutorial.toml?raw";
import { isHighlightedRulesTextTerm } from "../../cumulus/components/card/RulesText";
import { lookupGlossaryTerm } from "../../data/glossary";
import { parseTutorialTriggers } from "../../data/tutorial-actions";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import { matchTutorialGuidance } from "./tutorial-guidance";

function glossaryTrigger(
  id: string,
  priority: number,
): TutorialTriggerDefinition {
  return {
    id,
    on: ["card-play", "dreamwell-resolve"],
    priority,
    speaker: "mira",
    duration: 3,
    verticalOffset: 0,
    bubbleWidth: 700,
    match: { kind: "glossary", id },
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
      seenTriggerIds: new Set<string>(),
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
        seenTriggerIds: new Set(["support"]),
      },
    );
    expect(matches.map((match) => match.id)).toEqual(["foresee"]);
  });

  it("defers a matching keyword until after the general Event explanation", () => {
    const triggers: readonly TutorialTriggerDefinition[] = [
      {
        id: "event-card",
        on: ["card-play"],
        priority: 10,
        speaker: "mira",
        duration: 3,
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
        seenTriggerIds: new Set<string>(),
      } as const;

    const firstMatches = matchTutorialGuidance(triggers, input);
    expect(firstMatches.map((match) => match.id)).toEqual(["event-card"]);

    const secondMatches = matchTutorialGuidance(triggers, {
      ...input,
      seenTriggerIds: new Set(["event-card"]),
    });
    expect(secondMatches.map((match) => match.id)).toEqual(["erode"]);
  });
});

describe("tutorial trigger coverage", () => {
  it("covers every yellow term currently used by battle entities", () => {
    const sources = [
      ...(parse(cardsSource).cards as Array<Record<string, unknown>>),
      ...(parse(dreamwellSource).dreamwell as Array<Record<string, unknown>>),
      ...(parse(dreamAvatarsSource).dreamAvatar as Array<Record<string, unknown>>),
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
      [...triggerGlossaryIds].filter((id) => id !== "dissolved-trigger").sort(),
    );
  });
});
