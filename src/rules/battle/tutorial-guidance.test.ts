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
    duration: 3,
    match: { kind: "glossary", id },
    text: id,
  };
}

describe("matchTutorialGuidance", () => {
  it("matches glossary variants and orders all unseen explanations", () => {
    const matches = matchTutorialGuidance(
      [
        glossaryTrigger("support", 100),
        glossaryTrigger("foresee", 50),
      ],
      {
        event: "card-play",
        renderedText: "Foresee 1. Supports adjacent characters.",
        cardKind: "character",
        seenTriggerIds: new Set(),
      },
    );
    expect(matches.map((match) => match.id)).toEqual(["foresee", "support"]);
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

  it("matches the general Event explanation before its keyword", () => {
    const matches = matchTutorialGuidance(
      [
        {
          id: "event-card",
          on: ["card-play"],
          priority: 10,
          duration: 3,
          match: { kind: "card-type", cardType: "event" },
          text: "event",
        },
        glossaryTrigger("erode", 100),
      ],
      {
        event: "card-play",
        renderedText: "Erode 3.",
        cardKind: "event",
        seenTriggerIds: new Set(),
      },
    );
    expect(matches.map((match) => match.id)).toEqual([
      "event-card",
      "erode",
    ]);
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
