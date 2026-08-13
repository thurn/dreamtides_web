import { assertLocalized } from "@trox/runtime";
import { resolveChecked } from "../../runtime/localization/runtime";
// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import {
  ENERGY_ICON_COLOR,
  SPARK_ICON_COLOR,
} from "../components/controls/StandaloneGlyph";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../components/hud/JourneyStatusBar";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import {
  ExplorationSiteScreen,
  type ExplorationDeckModificationView,
  type ExplorationSiteView,
} from "./ExplorationSiteScreen";
import {
  localizedTransfigurationFormFixture,
  transfigurationFormFixture,
} from "../test-helpers/transfiguration-fixture";
import { localizedDreamsignFixture } from "../test-helpers/dreamsign-fixture";

const reducedMotionPreference = vi.hoisted(() => ({ value: true }));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MotionElement = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      layout?: unknown;
      onAnimationComplete?: () => void;
    }
  >(function MotionElement(
    {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      onAnimationComplete,
      ...props
    },
    ref,
  ) {
    return React.createElement("div", {
      ...props,
      ref,
      onContextMenu: onAnimationComplete,
    });
  });
  return {
    motion: {
      div: MotionElement,
      img: MotionElement,
      main: MotionElement,
      section: MotionElement,
      span: MotionElement,
    },
    useReducedMotion: () => reducedMotionPreference.value,
  };
});

function makeCard(): CardData {
  return {
    id: asCardId("00000000-0000-4000-8000-000000000017"),
    name: asCardName("Exploration Fixture"),
    cardNumber: 17,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: 17,
    artOwned: true,
  };
}

function view(resolved = false): ExplorationSiteView {
  const selected = makeCard();
  return {
    siteId: "exploration-site",
    scene: null,
    guide: {
      id: "layaway",
      name: assertLocalized('"Layaway"'),
      line: assertLocalized("Every card dreams, friend. Draw one, and we'll step inside."),
      art: artRef.dreamGuide("layaway"),
    },
    card: {
      cardId: selected.id,
      displaySnapshot: selected,
    },
    fullArt: artRef.explorationCard(selected.imageNumber),
    narrative: assertLocalized("A synthetic encounter waits in the dark."),
    actions: [
      {
        id: "choice-a",
        effectKind: "gain-card",
        mechanics: { effectKind: "gain-card" },
        label: assertLocalized("Choose A"),
        effectText: assertLocalized("Gain the fixture."),
        followup: { kind: "none" },
        available: true,
      },
      {
        id: "choice-b",
        effectKind: "change-subtype-selected",
        mechanics: { effectKind: "change-subtype-selected" },
        label: assertLocalized("Choose B"),
        effectText: assertLocalized("Change the fixture."),
        followup: { kind: "none" },
        available: true,
      },
    ],
    resolvedActionId: resolved ? "choice-a" : null,
    reward: null,
    outcomeKind: null,
  };
}

function siteInsertionRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    outcomeKind: "site-insertion",
    reward: {
      kind: "site-insertion",
      sourceKind: "add-fixed-site",
      targetNodeId: "current-atlas-node",
      insertionIndex: 3,
      siblingSiteIdsBefore: ["site-a", "site-b", "exploration-site"],
      model: {
        site: {
          id: "site-exploration-source-action",
          type: "Duplication",
          isEnhanced: false,
          isVisited: false,
        },
        pos: { x: 50, y: 50 },
        index: 3,
        isBattle: false,
        isLocked: false,
        isInteractive: false,
        label: assertLocalized("Synthetic Duplication Site"),
        lockedGuidance: assertLocalized(""),
        blurb: assertLocalized("A synthetic site reward."),
        icon: GLYPHS.copy,
      },
    },
  };
}

function fixtureDreamsign(id: string, label: string) {
  return localizedDreamsignFixture({
    id,
    name: label,
    effectDescription: `Synthetic effect for ${label}.`,
    imageName: `${label.toLowerCase().replace(/ /gu, "-")}.webp`,
    imageAlt: `${label} art`,
  });
}

function dreamsignMutationRewardView(
  sourceKind:
    | "replace-selected-dreamsign-with-offered"
    | "replace-all-dreamsigns-random"
    | "purge-selected-dreamsign-and-gain-random" = "purge-selected-dreamsign-and-gain-random",
): ExplorationSiteView {
  const base = view(true);
  const held = [
    fixtureDreamsign("10000000-0000-4000-8000-000000000001", "Held One"),
    fixtureDreamsign("10000000-0000-4000-8000-000000000002", "Held Two"),
  ];
  const gained = [
    fixtureDreamsign("30000000-0000-4000-8000-000000000001", "Random One"),
    fixtureDreamsign("30000000-0000-4000-8000-000000000002", "Random Two"),
  ];
  const mutation =
    sourceKind === "replace-selected-dreamsign-with-offered"
      ? {
          before: held,
          after: [held[0], gained[0]],
          offered: [gained[0]],
          gained: [gained[0]],
          purged: [held[1]],
          replacements: [{ removed: held[1], gained: gained[0] }],
        }
      : sourceKind === "replace-all-dreamsigns-random"
        ? {
            before: held,
            after: gained,
            offered: [],
            gained,
            purged: held,
            replacements: [
              { removed: held[0], gained: gained[0] },
              { removed: held[1], gained: gained[1] },
            ],
          }
        : {
            before: held,
            after: gained,
            offered: [],
            gained,
            purged: held,
            replacements: [{ removed: held[1], gained: gained[1] }],
          };
  return {
    ...base,
    outcomeKind: "dreamsign-mutation",
    reward: {
      kind: "dreamsign-mutation",
      sourceKind,
      ...mutation,
      poolRegenerated: false,
    },
  };
}

function nightmareDreamsignBundleRewardView(): ExplorationSiteView {
  const base = view(true);
  const removed = fixtureDreamsign(
    "50000000-0000-4000-8000-000000000001",
    "Removed Dreamsign",
  );
  const gained = fixtureDreamsign(
    "50000000-0000-4000-8000-000000000002",
    "Gained Dreamsign",
  );
  return {
    ...base,
    outcomeKind: "nightmare-dreamsign-bundle",
    reward: {
      kind: "nightmare-dreamsign-bundle",
      sourceKind: "gain-nightmare-and-dreamsign",
      nightmares: [
        { entryId: "nightmare-entry-a", model: base.card, isBane: true },
        { entryId: "nightmare-entry-b", model: base.card, isBane: true },
      ],
      before: [removed],
      after: [gained],
      offered: [],
      gained: [gained],
      purged: [removed],
      replacements: [{ removed, gained }],
      poolRegenerated: false,
    },
  };
}

function starterCardMutationRewardView(
  mode: "purge" | "replace",
): ExplorationSiteView {
  const base = view(true);
  const secondPurged = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000032"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000032"),
      name: asCardName("Second Starter Fixture"),
      cardNumber: 32,
      imageNumber: 32,
      isStarter: true,
    },
  };
  const firstGained = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000034"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000034"),
      name: asCardName("First Gained Fixture"),
      cardNumber: 34,
      imageNumber: 34,
    },
  };
  const secondGained = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000035"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000035"),
      name: asCardName("Second Gained Fixture"),
      cardNumber: 35,
      imageNumber: 35,
    },
  };
  const purged = [
    { entryId: "starter-entry-a", model: base.card, isBane: false },
    { entryId: "starter-entry-b", model: secondPurged, isBane: false },
  ];
  const replacements =
    mode === "purge"
      ? []
      : [
          {
            purged: purged[0],
            gained: {
              entryId: "gained-entry-a",
              model: firstGained,
              isBane: false,
            },
          },
          {
            purged: purged[1],
            gained: {
              entryId: "gained-entry-b",
              model: secondGained,
              isBane: false,
            },
          },
        ];
  return {
    ...base,
    outcomeKind: "starter-card-mutation",
    reward: {
      kind: "starter-card-mutation",
      sourceKind:
        mode === "purge"
          ? "purge-random-starter-card"
          : "replace-all-starter-cards",
      mode,
      purged: mode === "purge" ? [purged[0]] : purged,
      replacements,
    },
  };
}

function starterCardTransfigurationRewardView(count = 2): ExplorationSiteView {
  const base = view(true);
  const suffixes = ["a", "b", "c", "d"] as const;
  const cardIds = [
    base.card.cardId,
    asCardId("00000000-0000-4000-8000-000000000025"),
    asCardId("00000000-0000-4000-8000-000000000026"),
    asCardId("00000000-0000-4000-8000-000000000027"),
  ] as const;
  const forms = ["Empowered", "Kindled", "Inspired", "Enduring"] as const;
  const beforeCards = Array.from({ length: count }, (_, index) => {
    const suffix = suffixes[index];
    const cardId = cardIds[index];
    if (suffix === undefined || cardId === undefined) {
      throw new Error("starter transfiguration fixture supports four cards");
    }
    const cardNumber = index === 0 ? 17 : 24 + index;
    return {
      entryId: `starter-transfiguration-entry-${suffix}`,
      model: {
        ...base.card,
        cardId,
        displaySnapshot: {
          ...base.card.displaySnapshot,
          id: cardId,
          name: asCardName(`Starter Transfiguration Fixture ${suffix}`),
          cardNumber,
          imageNumber: cardNumber,
          isStarter: true,
        },
      },
      isBane: false,
    };
  });
  return {
    ...base,
    outcomeKind: "starter-card-transfiguration",
    reward: {
      kind: "starter-card-transfiguration",
      sourceKind: "transfigure-random-starter-cards",
      transfigurations: beforeCards.map((before, index) => {
        const form = forms[index];
        if (form === undefined) throw new Error("fixture form is required");
        return {
          entryId: before.entryId,
          cardId: before.model.cardId,
          beforeTransfiguration: null,
          afterTransfiguration: form,
          before,
          after: {
            ...before,
            model: {
              ...before.model,
              transfiguration: {
                type: form,
                form: transfigurationFormFixture(form),
                markedText: before.model.displaySnapshot.renderedText,
                energyChanged: form === "Empowered",
                energyChangeName:
                  form === "Empowered" ? "Fixture energy form" : null,
                sparkChanged: form === "Kindled",
                sparkChangeName:
                  form === "Kindled" ? "Fixture spark form" : null,
                fastChanged: false,
              },
            },
          },
        };
      }),
    },
  };
}

function multiCardTransfigurationRewardView(): ExplorationSiteView {
  const starterView = starterCardTransfigurationRewardView();
  if (
    starterView.reward === null ||
    !("kind" in starterView.reward) ||
    starterView.reward.kind !== "starter-card-transfiguration"
  ) {
    throw new Error("expected transfiguration reward fixture");
  }
  return {
    ...starterView,
    outcomeKind: "multi-card-transfiguration",
    reward: {
      kind: "multi-card-transfiguration",
      sourceKind: "transfigure-selected",
      transfigurations: starterView.reward.transfigurations.map((mapping) => ({
        ...mapping,
        before: {
          ...mapping.before,
          model: {
            ...mapping.before.model,
            displaySnapshot: {
              ...mapping.before.model.displaySnapshot,
              isStarter: false,
            },
          },
        },
        after: {
          ...mapping.after,
          model: {
            ...mapping.after.model,
            displaySnapshot: {
              ...mapping.after.model.displaySnapshot,
              isStarter: false,
            },
          },
        },
      })),
    },
  };
}

function compoundCardMutationRewardView(
  sourceKind:
    | "make-predicate-fast-and-gain-nightmares"
    | "purge-one-transfigure-and-copy-others",
): ExplorationSiteView {
  const base = starterCardTransfigurationRewardView(3);
  if (
    base.reward === null ||
    !("kind" in base.reward) ||
    base.reward.kind !== "starter-card-transfiguration"
  ) {
    throw new Error("expected transfiguration reward fixture");
  }
  const originals = base.reward.transfigurations.map(
    (mapping) => mapping.before,
  );
  const after = base.reward.transfigurations.map((mapping) => mapping.after);
  const nightmares = originals.slice(0, 2).map((card, index) => ({
    ...card,
    entryId: `nightmare-entry-${String(index)}`,
    model: {
      ...card.model,
      cardId: asCardId("ffffffff-ffff-4fff-8fff-ffffffffffff"),
      displaySnapshot: {
        ...card.model.displaySnapshot,
        id: asCardId("ffffffff-ffff-4fff-8fff-ffffffffffff"),
        name: asCardName("Nightmare"),
      },
    },
    isBane: true,
  }));
  return {
    ...base,
    outcomeKind: "compound-card-mutation",
    reward: {
      kind: "compound-card-mutation",
      sourceKind,
      purged:
        sourceKind === "purge-one-transfigure-and-copy-others"
          ? originals.slice(0, 1)
          : [],
      transfigurations:
        sourceKind === "purge-one-transfigure-and-copy-others"
          ? base.reward.transfigurations
          : [],
      keywordChanges:
        sourceKind === "make-predicate-fast-and-gain-nightmares"
          ? originals.slice(0, 2).map((card) => ({
              entryId: card.entryId,
              cardId: card.model.cardId,
              beforeKeywordModification: null,
              afterKeywordModification: { fast: true },
              before: card,
              after: {
                ...card,
                model: {
                  ...card.model,
                  displaySnapshot: {
                    ...card.model.displaySnapshot,
                    isFast: true,
                  },
                },
              },
            }))
          : [],
      nightmares:
        sourceKind === "make-predicate-fast-and-gain-nightmares"
          ? nightmares
          : [],
      copies:
        sourceKind === "purge-one-transfigure-and-copy-others"
          ? after.map((card, index) => ({
              source: card,
              copy: {
                ...card,
                entryId: `compound-copy-${String(index)}`,
              },
            }))
          : [],
    },
  };
}

function multiCardReplacementRewardView(
  sourceKind:
    "replace-selected" | "replace-random-with-card" = "replace-selected",
  count = 2,
): ExplorationSiteView {
  const starterView = starterCardMutationRewardView("replace");
  if (
    starterView.reward === null ||
    !("kind" in starterView.reward) ||
    starterView.reward.kind !== "starter-card-mutation"
  ) {
    throw new Error("expected starter replacement fixture");
  }
  return {
    ...starterView,
    outcomeKind: "card-replacements",
    reward: {
      kind: "card-replacements",
      sourceKind,
      replacements: starterView.reward.replacements
        .slice(0, count)
        .map((pair) => ({
          purged: {
            ...pair.purged,
            model: {
              ...pair.purged.model,
              displaySnapshot: {
                ...pair.purged.model.displaySnapshot,
                isStarter: false,
              },
            },
          },
          gained: pair.gained,
        })),
    },
  };
}

function cardTypeChangesRewardView(
  sourceKind:
    | "change-random-card-type"
    | "change-card-type-selected" = "change-random-card-type",
  count = 2,
): ExplorationSiteView {
  const base = view(true);
  const secondId = asCardId("00000000-0000-4000-8000-000000000029");
  const before = [
    base.card,
    {
      ...base.card,
      cardId: secondId,
      displaySnapshot: {
        ...base.card.displaySnapshot,
        id: secondId,
        name: asCardName("Second Type Change Fixture"),
        cardNumber: 29,
        imageNumber: 29,
      },
    },
  ];
  const afterTypeChange = {
    predicateId: "exploration:card-type:Event",
    cardType: "Event" as const,
    subtype: "",
    label: "Event",
  };
  return {
    ...base,
    outcomeKind: "card-type-changes",
    reward: {
      kind: "card-type-changes",
      sourceKind,
      changes: before.slice(0, count).map((model, index) => ({
        entryId: `type-change-entry-${String(index + 1)}`,
        cardId: model.cardId,
        beforeCardType: "Character" as const,
        afterCardType: "Event" as const,
        beforeTypeChange: null,
        afterTypeChange,
        before: {
          entryId: `type-change-entry-${String(index + 1)}`,
          model,
          isBane: false,
        },
        after: {
          entryId: `type-change-entry-${String(index + 1)}`,
          model: {
            ...model,
            displaySnapshot: {
              ...model.displaySnapshot,
              cardType: "Event" as const,
              subtype: "",
            },
          },
          isBane: false,
        },
      })),
    },
  };
}

function multiTransfigurationFollowupView(): ExplorationSiteView {
  const base = view();
  const secondCard = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000028"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000028"),
      name: asCardName("Second Transfiguration Fixture"),
      cardNumber: 28,
      imageNumber: 28,
    },
  };
  const candidate = (
    entryId: string,
    model: typeof base.card,
    types: readonly ("Empowered" | "Kindled")[],
  ) => ({
    entryId,
    model,
    availability: "available" as const,
    reforgedType: null,
    forms: types.map((type) => ({
      type,
      presentation: localizedTransfigurationFormFixture(type),
      change:
        type === "Empowered"
          ? ({ kind: "energy-delta", from: 2, to: 1 } as const)
          : ({ kind: "spark-delta", from: 2, to: 4 } as const),
      effectDetails: { entryId, type },
      essenceCost: 0,
      affordable: true,
      previewModel: {
        ...model,
        transfiguration: {
          type,
          form: transfigurationFormFixture(type),
          markedText: model.displaySnapshot.renderedText,
          energyChanged: type === "Empowered",
          energyChangeName: type === "Empowered" ? "Fixture energy form" : null,
          sparkChanged: type === "Kindled",
          sparkChangeName: type === "Kindled" ? "Fixture spark form" : null,
          fastChanged: false,
        },
      },
    })),
  });
  return {
    ...base,
    actions: [
      {
        ...base.actions[0],
        effectKind: "transfigure-selected",
        mechanics: {
          effectKind: "transfigure-selected",
          predicate: "event",
          count: 2,
        },
        followup: {
          kind: "multi-card-transfiguration",
          title: assertLocalized("Fixture multi-card choice"),
          subtitle: assertLocalized("Fixture exact selection"),
          count: 2,
          candidates: [
            candidate("multi-entry-a", base.card, ["Empowered", "Kindled"]),
            candidate("multi-entry-b", secondCard, ["Empowered", "Kindled"]),
          ],
        },
      },
      base.actions[1],
    ],
  };
}

function twoCardRewardView(): ExplorationSiteView {
  const base = view(true);
  const second = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Survivor Fixture"),
      cardNumber: 18,
      imageNumber: 18,
    },
  };
  return {
    ...base,
    reward: {
      objects: { cards: [base.card, second], purgedCards: [], dreamsigns: [] },
      deckModification: null,
    },
  };
}

function purgeAndCopyRewardView(): ExplorationSiteView {
  const base = twoCardRewardView();
  if (base.reward === null || "kind" in base.reward) return base;
  const copiedCardModel = base.reward.objects.cards[0];
  const purgedCardModel = base.reward.objects.cards[1];
  if (copiedCardModel === undefined || purgedCardModel === undefined)
    return base;
  return {
    ...base,
    outcomeKind: "purge-and-copy",
    reward: {
      kind: "purge-and-copy",
      purgedCard: {
        entryId: "purged-entry",
        model: purgedCardModel,
        isBane: false,
      },
      sourceEntryId: "source-entry",
      source: {
        entryId: "source-entry",
        model: copiedCardModel,
        isBane: false,
      },
      cards: [
        {
          entryId: "copy-entry",
          model: copiedCardModel,
          isBane: false,
        },
      ],
      count: 1,
    },
  };
}

function dreamsignRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    reward: {
      objects: {
        cards: [],
        purgedCards: [],
        dreamsigns: [
          localizedDreamsignFixture({
            id: "reward-dreamsign-id",
            name: "Reward Dreamsign",
            effectDescription: "A synthetic reward sign.",
            imageName: "reward-dreamsign.webp",
            imageAlt: "Reward Dreamsign art",
          }),
        ],
      },
      deckModification: null,
    },
  };
}

function transfigurationRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    reward: {
      kind: "transfiguration",
      entryId: "deck-entry-transfigured",
      before: base.card,
      after: {
        cardId: base.card.cardId,
        displaySnapshot: {
          ...base.card.displaySnapshot,
          spark: (base.card.displaySnapshot.spark ?? 0) * 2,
        },
        transfiguration: {
          type: "Kindled",
          form: transfigurationFormFixture("Kindled"),
          markedText: base.card.displaySnapshot.renderedText,
          energyChanged: false,
          energyChangeName: null,
          sparkChanged: true,
          sparkChangeName: "Fixture spark form",
          fastChanged: false,
        },
      },
    },
  };
}

function deckModificationRewardView(
  kind: "spark" | "fast" = "spark",
): ExplorationSiteView {
  const base = view(true);
  const first =
    kind === "fast"
      ? {
          ...base.card,
          displaySnapshot: { ...base.card.displaySnapshot, isFast: true },
        }
      : base.card;
  const second = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Modified Fixture"),
      cardNumber: 18,
      spark: 4,
      isFast: kind === "fast",
      imageNumber: 18,
    },
  };
  const common = {
    announcement: assertLocalized(
        kind === "spark"
          ? "All characters in your deck gain +1✦"
          : "All cards in your deck become ❖ (fast)",
      ),
    cards: [
      { entryId: "deck-entry-a", model: first, isBane: false },
      { entryId: "deck-entry-b", model: second, isBane: false },
    ],
  };
  const deckModification: ExplorationDeckModificationView =
    kind === "spark"
      ? { ...common, kind: "spark", amount: 1 }
      : { ...common, kind: "fast" };
  return {
    ...base,
    reward: {
      objects: { cards: [], purgedCards: [], dreamsigns: [] },
      deckModification,
    },
  };
}

function bulkTransfigurationRewardView(): ExplorationSiteView {
  const base = deckModificationRewardView();
  if (base.reward === null || "kind" in base.reward) return base;
  const transfiguration = {
    type: "Inspired" as const,
    form: transfigurationFormFixture("Inspired"),
    markedText: base.card.displaySnapshot.renderedText,
    energyChanged: false,
    energyChangeName: null,
    sparkChanged: false,
    sparkChangeName: null,
    fastChanged: false,
  };
  return {
    ...base,
    outcomeKind: "transfiguration",
    reward: {
      ...base.reward,
      deckModification: {
        kind: "transfiguration",
        transfiguration: "Inspired",
        formName: assertLocalized("Fixture Inspired"),
        essenceSpent: 100,
        announcement: assertLocalized(
          "Authored bulk transfiguration outcome.",
        ),
        cards:
          base.reward.deckModification?.cards.map((card) => ({
            ...card,
            model: { ...card.model, transfiguration },
          })) ?? [],
      },
    },
  };
}

function essenceRewardView(): ExplorationSiteView {
  const base = view(true);
  const cards = Array.from({ length: 6 }, (_unused, index) => ({
    entryId: `spirit-animal-entry-${String(index + 1)}`,
    model: {
      ...base.card,
      cardId: asCardId(
        `00000000-0000-4000-8000-${String(index + 21).padStart(12, "0")}`,
      ),
      displaySnapshot: {
        ...base.card.displaySnapshot,
        id: asCardId(
          `00000000-0000-4000-8000-${String(index + 21).padStart(12, "0")}`,
        ),
        name: asCardName(`Spirit Animal ${String(index + 1)}`),
        cardNumber: index + 21,
        imageNumber: index + 21,
        subtype: "Spirit Animal",
      },
    },
    isBane: false,
  }));
  return {
    ...base,
    reward: {
      kind: "essence",
      cards,
      essencePerCard: 15,
      totalEssence: 90,
    },
  };
}

function directEssenceRewardView(
  sourceKind: "gain-essence" | "gain-random-essence" | "double-essence",
  essenceBefore: number,
  essenceGained: number,
  essenceAfter: number,
): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    actions: [
      {
        ...base.actions[0],
        effectKind: sourceKind,
        mechanics: { effectKind: sourceKind },
      },
      base.actions[1],
    ],
    outcomeKind: "direct-essence",
    reward: {
      kind: "direct-essence",
      sourceKind,
      essenceBefore,
      essenceGained,
      essenceAfter,
      ...(sourceKind === "gain-random-essence"
        ? { minimumEssence: 50, maximumEssence: 150 }
        : {}),
    },
  };
}

function purgedDreamsignEssenceRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    reward: {
      kind: "purged-dreamsign-essence",
      dreamsign: localizedDreamsignFixture({
        id: "purged-dreamsign-id",
        name: "Purged Dreamsign",
        effectDescription: "A synthetic purged sign.",
        imageName: "purged-dreamsign.webp",
        imageAlt: "Purged Dreamsign art",
      }),
      totalEssence: 50,
    },
  };
}

function cardCopiesRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    outcomeKind: "card-copies",
    reward: {
      kind: "card-copies",
      sourceEntryId: "source-entry",
      source: { entryId: "source-entry", model: base.card, isBane: false },
      count: 2,
      cards: [
        { entryId: "copy-entry-a", model: base.card, isBane: false },
        { entryId: "copy-entry-b", model: base.card, isBane: false },
      ],
    },
  };
}

function multipleCardCopiesRewardView(): ExplorationSiteView {
  const base = view(true);
  const secondCard = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Copy Fixture"),
      cardNumber: 18,
      imageNumber: 18,
    },
  };
  return {
    ...base,
    outcomeKind: "card-copies-multiple",
    reward: {
      kind: "card-copies-multiple",
      count: 2,
      pairs: [
        {
          source: {
            entryId: "source-entry-a",
            model: base.card,
            isBane: false,
          },
          copy: { entryId: "copy-entry-a", model: base.card, isBane: false },
        },
        {
          source: {
            entryId: "source-entry-b",
            model: secondCard,
            isBane: false,
          },
          copy: { entryId: "copy-entry-b", model: secondCard, isBane: false },
        },
      ],
    },
  };
}

function purgedCardEssenceRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    outcomeKind: "purged-card-essence",
    reward: {
      kind: "purged-card-essence",
      card: { entryId: "purged-entry", model: base.card, isBane: false },
      spark: 2,
      essencePerSpark: 20,
      totalEssence: 40,
    },
  };
}

function battleModifierRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "battle-modifier",
    reward: {
      kind: "battle-modifier",
      modifier: "starting-energy",
      amount: 2,
      battlesRemaining: 1,
    },
  };
}

function smallerHandDiscountRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "smaller-hand-and-cost-discount",
    reward: {
      kind: "smaller-hand-and-cost-discount",
      openingHandDelta: -1,
      energyCostReduction: 1,
      battlesRemaining: 1,
    },
  };
}

function dreamAvatarRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "dream-avatar",
    reward: {
      kind: "dream-avatar",
      previous: null,
      current: {
        id: "dream-avatar-new",
        name: "New Dream Avatar",
        title: "The Synthetic",
        renderedText: "A synthetic ability.",
        imageNumber: "017",
        startingEssence: 250,
      },
    },
  };
}

function siteOfferModifierRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "site-offer-modifier",
    reward: {
      kind: "site-offer-modifier",
      modifier: "transfigure-next-draft-or-shop",
      sourceSiteId: "exploration-site",
      sourceActionId: "choice-a",
    },
  };
}

function shopModifierRewardView(
  modifier: "free-next-shop" | "free-purchases",
): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "shop-modifier",
    reward:
      modifier === "free-next-shop"
        ? {
            kind: "shop-modifier",
            modifier,
            sourceSiteId: "exploration-site",
            sourceActionId: "choice-a",
          }
        : {
            kind: "shop-modifier",
            modifier,
            sourceSiteId: "exploration-site",
            sourceActionId: "choice-a",
            freePurchaseCount: 3,
            essenceBefore: 255,
            essenceSpent: 127,
            essenceAfter: 128,
          },
  };
}

function emptyCardAcquisitionRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "card-acquisition",
    reward: {
      semanticKind: "card-acquisition",
      objects: { cards: [], purgedCards: [], dreamsigns: [] },
      deckModification: null,
    },
  };
}

function stubMatchMedia(): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

function pointer(
  type: "pointerdown" | "pointerup",
  options: {
    readonly pointerId: number;
    readonly timeStamp: number;
  },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 280,
    clientY: 160,
  });
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    pointerId: { value: options.pointerId },
    timeStamp: { value: options.timeStamp },
  });
  return event;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  reducedMotionPreference.value = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ExplorationSiteScreen", () => {
  it("breaks the selected card's licensed art into a dismissible fullscreen layer", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onChannel = vi.fn();
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={onChannel}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const cardSlot = container.querySelector<HTMLElement>(
      "[data-exploration-card-slot]",
    );
    const channel = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-channel"]',
    );
    expect(
      container.querySelector('[data-testid="cumulus-exploration-panel"]'),
    ).toBeNull();
    expect(
      container.querySelector("[data-guide-gallery-guide]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-guide-art"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-speech"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Channel A Possibility");
    expect(container.textContent).not.toContain(
      "A single thread rises from your deck.",
    );
    expect(cardSlot?.dataset.cardId).toBe(view().card.cardId);
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-revealed-card"]')
        ?.getAttribute("data-card-id"),
    ).toBe(view().card.cardId);
    expect(channel?.textContent).toContain("Delve");
    expect(channel?.dataset.glassVariant).toBe("accent");
    expect(channel?.dataset.glassPlacement).toBe("onMedia");

    const fullArtPreload = container.querySelector<HTMLImageElement>(
      'img[aria-hidden="true"][style*="display: none"]',
    );
    if (fullArtPreload === null) throw new Error("Expected full-art preload");
    Object.defineProperties(fullArtPreload, {
      naturalWidth: { configurable: true, value: 1060 },
      naturalHeight: { configurable: true, value: 1600 },
    });
    act(() => {
      fullArtPreload.dispatchEvent(new Event("load"));
    });

    act(() => channel?.click());
    expect(onChannel).toHaveBeenCalledOnce();
    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationFrameBreakPhase).toBe("open");
    expect(frameBreak?.dataset.explorationFullArtImageNumber).toBe("17");
    expect(frameBreak?.dataset.explorationArtPresentation).toBe(
      "contain-with-blur",
    );
    const blurFill = frameBreak?.querySelector<HTMLElement>(
      "[data-exploration-full-art-blur-fill]",
    );
    expect(blurFill).not.toBeNull();
    expect(blurFill?.querySelector("img")?.style.filter).toContain(
      "var(--glass-blur)",
    );
    const fullArt = frameBreak?.querySelector<HTMLImageElement>(
      "[data-exploration-full-art]",
    );
    expect(fullArt?.getAttribute("src")).toContain("/exploration/17.jpg");
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    const returnButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Return to Exploration"]',
    );
    act(() => returnButton?.click());
    expect(onExit).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("keeps landscape art on the existing full-bleed presentation", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const fullArtPreload = container.querySelector<HTMLImageElement>(
      'img[aria-hidden="true"][style*="display: none"]',
    );
    if (fullArtPreload === null) throw new Error("Expected full-art preload");
    Object.defineProperties(fullArtPreload, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 1060 },
    });
    act(() => {
      fullArtPreload.dispatchEvent(new Event("load"));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );

    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationArtPresentation).toBe("cover");
    expect(
      frameBreak?.querySelector("[data-exploration-full-art-blur-fill]"),
    ).toBeNull();
    act(() => root.unmount());
  });

  it("shows the authored narrative and resolves a direct choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const directView = view();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={directView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-narrative-copy"]',
      )?.textContent,
    ).toBe("A synthetic encounter waits in the dark.");
    const tutorialAnchor = container.querySelector(
      '[data-tutorial-guidance-concept="exploration-actions"]',
    );
    expect(
      tutorialAnchor?.hasAttribute("data-tutorial-guidance-obstacle"),
    ).toBe(true);
    expect(tutorialAnchor?.hasAttribute("data-tutorial-guidance-anchor")).toBe(
      true,
    );
    expect(tutorialAnchor?.hasAttribute("data-cumulus-reveal-anchor")).toBe(
      true,
    );
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-narrative-panel"]')
        ?.querySelector("[data-glass-panel-header]"),
    ).toBeNull();
    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    expect(action?.dataset.explorationActionId).toBe(directView.actions[0].id);
    expect(action?.dataset.explorationEffectKind).toBe(
      directView.actions[0].effectKind,
    );
    act(() => action?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a");
    act(() => root.unmount());
  });

  it("submits a preselected deck-card target without opening a picker", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const base = view();
    const automaticView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          automaticSelection: { entryIds: ["minted-entry"] },
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={automaticView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    expect(container.querySelector("[data-exploration-followup]")).toBeNull();
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["minted-entry"],
    });
    act(() => root.unmount());
  });

  it("exposes the prepared starter entity by UUID and submits an empty automatic selection", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const base = view();
    const starterEntryId = "prepared-starter-entry";
    const starterView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "purge-starter-card",
          mechanics: { effectKind: "purge-starter-card" },
          effectText: assertLocalized(
            `Purge ${base.card.displaySnapshot.name}.`,
          ),
          effectParts: [
            {
              kind: "entity",
              entity: {
                kind: "card",
                card: base.card.displaySnapshot,
                entryId: starterEntryId,
              },
            },
          ],
          automaticSelection: {},
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const choice = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    expect(choice?.dataset.explorationEntityPreview).toBe("card");
    expect(choice?.dataset.explorationDeckEntryId).toBe(starterEntryId);
    expect(choice?.dataset.entityId).toBe(base.card.cardId);
    expect(
      choice?.querySelector<HTMLElement>("[data-exploration-entity-label]")
        ?.dataset.explorationDeckEntryId,
    ).toBe(starterEntryId);
    act(() => choice?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a", {});
    act(() => root.unmount());
  });

  it("renders resource marks in structured Exploration choice copy", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const resourceView: ExplorationSiteView = {
      ...view(),
      actions: [
        {
          ...view().actions[0],
          effectText: assertLocalized(
            "Spend 1● to gain +1✦ and Exploration Fixture.",
          ),
          effectParts: [
            { kind: "entity", entity: { kind: "card", card: makeCard() } },
          ],
        },
        view().actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={resourceView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const effect = container.querySelector<HTMLElement>(
      "#exploration-effect-0",
    );
    const energyGlyph = effect?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="energy"]',
    );
    const sparkGlyph = effect?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="spark"]',
    );
    expect(effect?.textContent).not.toMatch(/[●✦]/u);
    expect(energyGlyph?.querySelector("i")?.className).toContain("bx-fire-alt");
    expect(energyGlyph?.parentElement?.style.color).toContain(
      ENERGY_ICON_COLOR,
    );
    expect(sparkGlyph?.querySelector("i")?.className).toContain("bx-sparkle");
    expect(sparkGlyph?.parentElement?.style.color).toContain(SPARK_ICON_COLOR);

    act(() => root.unmount());
  });

  it("keeps repeated entity labels independently interactive", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const first = makeCard();
    const second = {
      ...makeCard(),
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      cardNumber: 18,
    };
    const base = view();
    const repeatedEntityView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: assertLocalized(
            "Abandon Exploration Fixture, then copy Exploration Fixture.",
          ),
          effectParts: [
            { kind: "entity", entity: { kind: "card", card: first } },
            { kind: "entity", entity: { kind: "card", card: second } },
          ],
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={repeatedEntityView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const labels = container.querySelectorAll(
      "#exploration-effect-0 [data-exploration-entity-label]",
    );
    expect(labels).toHaveLength(2);
    expect(
      Array.from(labels, (label) => label.getAttribute("data-entity-id")),
    ).toEqual([first.id, second.id]);

    act(() => root.unmount());
  });

  it("renders a structured card-type variable without exposing its authored token", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const cardTypeView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: assertLocalized("Resolved Character fixture"),
          effectParts: [
            { kind: "entity", entity: { kind: "card", card: makeCard() } },
            { kind: "card-type", cardType: "Character" },
          ],
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={cardTypeView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const effect = container.querySelector<HTMLElement>(
      "#exploration-effect-0",
    );
    const cardType = effect?.querySelector<HTMLElement>(
      "[data-exploration-card-type-variable]",
    );
    expect(cardType?.dataset.cardType).toBe("Character");
    expect(cardType?.textContent?.trim()).not.toBe("");
    expect(effect?.textContent).not.toContain("{card_type}");

    act(() => root.unmount());
  });

  it("types the narrative for one second before revealing the choices", () => {
    vi.useFakeTimers();
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLElement>("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector<HTMLElement>("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    const narrative = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-narrative-copy"]',
    );
    const choices = container.querySelector<HTMLElement>(
      '[data-exploration-choices-state="waiting"]',
    );
    const firstChoice = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    const secondChoice = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-1"]',
    );
    expect(narrative?.textContent).toBe("");
    expect(narrative?.dataset.explorationTypewriterState).toBe("typing");
    expect(choices?.getAttribute("aria-hidden")).toBe("true");
    expect(firstChoice?.getAttribute("aria-disabled")).toBe("true");
    expect(secondChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    const halfwayCount = Number(
      narrative?.dataset.explorationVisibleCharacterCount,
    );
    expect(halfwayCount).toBeGreaterThan(0);
    expect(halfwayCount).toBeLessThan(resolveChecked(view().narrative).length);
    expect(narrative?.textContent).toBe(
      resolveChecked(view().narrative).slice(0, halfwayCount),
    );
    expect(
      container.querySelector("[data-exploration-choices-state='revealed']"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(narrative?.dataset.explorationTypewriterState).toBe("typing");
    expect(firstChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(narrative?.textContent).toBe(resolveChecked(view().narrative));
    expect(narrative?.dataset.explorationTypewriterState).toBe("complete");
    expect(
      container.querySelector<HTMLElement>(
        "[data-exploration-choices-state='staggering']",
      ),
    ).not.toBeNull();
    expect(firstChoice?.hasAttribute("aria-disabled")).toBe(false);
    expect(secondChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(
      container.querySelector("[data-exploration-choices-state='revealed']"),
    ).toBeNull();
    expect(secondChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelector("[data-exploration-choices-state='revealed']"),
    ).not.toBeNull();
    expect(secondChoice?.hasAttribute("aria-disabled")).toBe(false);
    act(() => root.unmount());
  });

  it("makes the full referenced choice cell the reveal and activation source", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const referencedCard = makeCard();
    const referencedView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: assertLocalized(`Gain 3 ${referencedCard.name} cards.`),
          effectParts: [
            {
              kind: "entity",
              entity: {
                kind: "card",
                card: {
                  ...referencedCard,
                  renderedText: `${referencedCard.renderedText} Draw a card.`,
                },
                transfiguration: {
                  type: "Inspired",
                  form: transfigurationFormFixture("Inspired"),
                  markedText: `${referencedCard.renderedText} Draw a card.`,
                  energyChanged: false,
                  energyChangeName: null,
                  sparkChanged: false,
                  sparkChangeName: null,
                  fastChanged: false,
                },
                copies: 3,
              },
            },
          ],
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={referencedView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const source = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    const label = container.querySelector<HTMLElement>(
      '[data-exploration-entity-label="card"]',
    );
    expect(source?.textContent).toContain(referencedCard.name);
    expect(source?.dataset.explorationEntityPreview).toBe("card");
    expect(source?.dataset.entityId).toBe(referencedCard.id);
    expect(source?.dataset.entityCopies).toBe("3");
    expect(source?.dataset.revealSourceRetain).toBe("true");
    expect(source?.dataset.revealPrimaryVariant).toBe("gameCard");
    expect(label?.textContent).toBe(referencedCard.name);
    expect(label?.querySelector("span")?.style.textDecoration).toBe(
      "underline",
    );
    expect(label?.hasAttribute("data-reveal-entity-id")).toBe(false);
    expect(label?.tabIndex).toBe(-1);
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-cumulus-reveal-portal]"),
      ).not.toBeNull(),
    );
    act(() => source?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a");
    act(() => root.unmount());
  });

  it("reveals on a full-cell touch hold while preserving quick-touch activation", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const referencedCard = makeCard();
    const referencedView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: assertLocalized(`Gain ${referencedCard.name}.`),
          effectParts: [
            {
              kind: "entity",
              entity: { kind: "card", card: referencedCard },
            },
          ],
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={referencedView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const source = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    )!;

    act(() => {
      source.dispatchEvent(
        pointer("pointerdown", { pointerId: 8, timeStamp: 100 }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(35);
    });
    expect(source.dataset.revealActive).toBe("true");
    act(() => {
      source.dispatchEvent(
        pointer("pointerup", { pointerId: 8, timeStamp: 401 }),
      );
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onResolve).not.toHaveBeenCalled();

    act(() => {
      source.dispatchEvent(
        pointer("pointerdown", { pointerId: 9, timeStamp: 500 }),
      );
    });
    act(() => {
      source.dispatchEvent(
        pointer("pointerup", { pointerId: 9, timeStamp: 600 }),
      );
    });
    expect(onResolve).toHaveBeenCalledOnce();
    act(() => {
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onResolve).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("collects a card follow-up before resolving the choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "cards",
            title: assertLocalized("Choose a Fixture"),
            subtitle: assertLocalized("Choose one card."),
            cards: [
              { entryId: "entry-fixture", model: base.card, isBane: false },
            ],
            mode: "single",
            selectionKey: "entryIds",
            selectionOperation: "transfigure",
            min: 1,
            max: 1,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    const followup = container.querySelector<HTMLElement>(
      '[data-exploration-followup="cards"]',
    );
    expect(followup).not.toBeNull();
    expect(followup?.dataset.explorationActionId).toBe(
      followupView.actions[0].id,
    );
    expect(followup?.dataset.explorationEffectKind).toBe(
      followupView.actions[0].effectKind,
    );
    expect(followup?.style.bottom).toBe(
      `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-3xl")})`,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-entry-fixture"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector(
        '[data-card-choice-operation="transfigure"] .fa-hammer',
      ),
    ).not.toBeNull();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-fixture"],
    });
    act(() => root.unmount());
  });

  it("collects an exact multi-card set, preserves per-card forms across back navigation, and dispatches once", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={multiTransfigurationFollowupView()}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector(
        '[data-exploration-multi-transfiguration-step="cards"]',
      ),
    ).not.toBeNull();
    for (const entryId of ["multi-entry-a", "multi-entry-b"]) {
      act(() =>
        container
          .querySelector<HTMLElement>(
            `[data-testid="cumulus-exploration-multi-transfiguration-card-${entryId}"]`,
          )
          ?.click(),
      );
    }
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-multi-transfiguration-cards-confirm"]',
        )
        ?.click(),
    );
    const formStep = () =>
      container.querySelector<HTMLElement>(
        '[data-exploration-multi-transfiguration-step="form"]',
      );
    expect(
      formStep()?.dataset.explorationMultiTransfigurationCurrentEntryId,
    ).toBe("multi-entry-a");
    expect(formStep()?.getAttribute("aria-label")?.trim()).not.toBe("");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-form-Empowered"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );
    expect(
      formStep()?.dataset.explorationMultiTransfigurationCurrentEntryId,
    ).toBe("multi-entry-b");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-form-Kindled"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-choose-again"]',
        )
        ?.click(),
    );
    expect(
      formStep()?.dataset.explorationMultiTransfigurationCurrentEntryId,
    ).toBe("multi-entry-a");
    expect(formStep()?.dataset.explorationMultiTransfigurationCurrentForm).toBe(
      "Empowered",
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );
    expect(
      formStep()?.dataset.explorationMultiTransfigurationCurrentEntryId,
    ).toBe("multi-entry-b");
    expect(formStep()?.dataset.explorationMultiTransfigurationCurrentForm).toBe(
      "Kindled",
    );
    expect(onResolve).not.toHaveBeenCalled();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledOnce();
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["multi-entry-a", "multi-entry-b"],
      transfigurations: ["Empowered", "Kindled"],
    });
    act(() => root.unmount());
  });

  it("resolves a Dreamsign follow-up directly from its UUID-backed artwork", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const dreamsignId = "held-dreamsign-id";
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "dreamsigns",
            title: assertLocalized("Break the suspended pattern"),
            subtitle: assertLocalized("Choose a Dreamsign to purge."),
            selectionKey: "dreamsignId",
            dreamsigns: [
              localizedDreamsignFixture({
                id: dreamsignId,
                name: "Amplified Acorn",
                effectDescription: "A synthetic Dreamsign effect.",
                imageName: "amplified-acorn.webp",
                imageAlt: "Amplified Acorn art",
              }),
            ],
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    const choice = container.querySelector<HTMLElement>(
      `[data-testid="cumulus-exploration-dreamsign-${dreamsignId}"]`,
    );
    expect(choice?.dataset.dreamsignId).toBe(dreamsignId);
    expect(choice?.querySelector("img")?.getAttribute("src")).toContain(
      "/dreamsigns/amplified-acorn.webp",
    );
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-followup="dreamsigns"] [data-glass-panel-height-contract]',
      )?.dataset.glassPanelHeightContract,
    ).toBe("content");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-followup-confirm"]',
      ),
    ).toBeNull();

    act(() => choice?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      dreamsignId,
    });
    act(() => root.unmount());
  });

  it("chooses the compound offered Dreamsign before the exact persisted capacity replacement", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const offered = fixtureDreamsign(
      "20000000-0000-4000-8000-000000000001",
      "Offered One",
    );
    const held = fixtureDreamsign(
      "10000000-0000-4000-8000-000000000001",
      "Held One",
    );
    const flowView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "gain-nightmare-and-offered-dreamsign",
          followup: {
            kind: "dreamsign-flow",
            title: assertLocalized("Read the offered patterns"),
            subtitle: assertLocalized(
              "Choose one sign, then make room for it.",
            ),
            mode: "gain-offered",
            offered: [offered],
            held: [held],
            requiredOverflowReplacementCount: 1,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={flowView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    expect(
      container.querySelector("[data-dreamsign-choice-role='offered']"),
    ).not.toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).toBe(
      `cumulus-exploration-dreamsign-offered-${offered.id}`,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-offered-${offered.id}"]`,
        )
        ?.click(),
    );
    expect(onResolve).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-dreamsign-flow="gain-offered"]',
      )?.dataset.explorationDreamsignFlowStep,
    ).toBe("replacement");
    expect(document.activeElement?.getAttribute("data-testid")).toBe(
      `cumulus-exploration-dreamsign-replacement-${held.id}`,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-replacement-${held.id}"]`,
        )
        ?.click(),
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    expect(confirm?.disabled).toBe(false);
    act(() => confirm?.click());
    expect(onResolve).toHaveBeenCalledOnce();
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      offeredDreamsignId: offered.id,
      replacedDreamsignId: held.id,
    });
    act(() => root.unmount());

    const capacityFollowup = flowView.actions[0].followup;
    if (capacityFollowup.kind !== "dreamsign-flow") {
      throw new Error("Expected compound Dreamsign follow-up fixture");
    }
    const belowCapacityResolve = vi.fn();
    const belowCapacity = mount(
      <ExplorationSiteScreen
        view={{
          ...flowView,
          actions: [
            {
              ...flowView.actions[0],
              followup: {
                ...capacityFollowup,
                requiredOverflowReplacementCount: 0,
              },
            },
            flowView.actions[1],
          ],
        }}
        onChannel={vi.fn()}
        onResolve={belowCapacityResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      belowCapacity.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      belowCapacity.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    act(() =>
      belowCapacity.container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-offered-${offered.id}"]`,
        )
        ?.click(),
    );
    expect(belowCapacityResolve).toHaveBeenCalledWith("choice-a", {
      offeredDreamsignId: offered.id,
    });
    expect(
      belowCapacity.container.querySelector(
        '[data-dreamsign-choice-role="replacement"]',
      ),
    ).toBeNull();
    act(() => belowCapacity.root.unmount());
  });

  it("resolves the fixed compound bundle directly below cap and chooses one held replacement at cap", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const held = fixtureDreamsign(
      "10000000-0000-4000-8000-000000000001",
      "Held One",
    );
    const belowCapResolve = vi.fn();
    const belowCap = mount(
      <ExplorationSiteScreen
        view={{
          ...base,
          actions: [
            {
              ...base.actions[0],
              effectKind: "gain-nightmare-and-dreamsign",
              followup: { kind: "none" },
            },
            base.actions[1],
          ],
        }}
        onChannel={vi.fn()}
        onResolve={belowCapResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      belowCap.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      belowCap.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(belowCapResolve).toHaveBeenCalledWith("choice-a");
    expect(
      belowCap.container.querySelector("[data-exploration-dreamsign-choices]"),
    ).toBeNull();
    act(() => belowCap.root.unmount());

    const atCapResolve = vi.fn();
    const atCap = mount(
      <ExplorationSiteScreen
        view={{
          ...base,
          actions: [
            {
              ...base.actions[0],
              effectKind: "gain-nightmare-and-dreamsign",
              followup: {
                kind: "dreamsigns",
                title: assertLocalized("Make room"),
                subtitle: assertLocalized("Choose one held Dreamsign."),
                selectionKey: "replacedDreamsignId",
                dreamsigns: [held],
              },
            },
            base.actions[1],
          ],
        }}
        onChannel={vi.fn()}
        onResolve={atCapResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      atCap.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      atCap.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    act(() =>
      atCap.container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-${held.id}"]`,
        )
        ?.click(),
    );
    expect(atCapResolve).toHaveBeenCalledWith("choice-a", {
      replacedDreamsignId: held.id,
    });
    act(() => atCap.root.unmount());
  });

  it("commits held and offered Dreamsign selections as one replacement intent", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const offered = fixtureDreamsign(
      "20000000-0000-4000-8000-000000000001",
      "Offered One",
    );
    const held = fixtureDreamsign(
      "10000000-0000-4000-8000-000000000001",
      "Held One",
    );
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={{
          ...base,
          actions: [
            {
              ...base.actions[0],
              effectKind: "replace-selected-dreamsign-with-offered",
              followup: {
                kind: "dreamsign-flow",
                title: assertLocalized("Exchange the pattern"),
                subtitle: assertLocalized(
                  "Choose one held sign and one offered sign.",
                ),
                mode: "replace-with-offered",
                offered: [offered],
                held: [held],
                requiredOverflowReplacementCount: 0,
              },
            },
            base.actions[1],
          ],
        }}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-offered-${offered.id}"]`,
        )
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
    });
    act(() => {
      container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-exchange-${held.id}"]`,
        )
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        );
    });
    expect(onResolve).not.toHaveBeenCalled();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      offeredDreamsignId: offered.id,
      replacedDreamsignId: held.id,
    });
    act(() => root.unmount());
  });

  it("purges first, then requires exact overflow targets without exposing random gains", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const held = [
      fixtureDreamsign("10000000-0000-4000-8000-000000000001", "Held One"),
      fixtureDreamsign("10000000-0000-4000-8000-000000000002", "Held Two"),
      fixtureDreamsign("10000000-0000-4000-8000-000000000003", "Held Three"),
      fixtureDreamsign("10000000-0000-4000-8000-000000000004", "Held Four"),
    ];
    const randomDreamsignId = "30000000-0000-4000-8000-000000000001";
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={{
          ...base,
          actions: [
            {
              ...base.actions[0],
              effectKind: "purge-selected-dreamsign-and-gain-random",
              effectText: assertLocalized(
                "Purge one sign and gain three at random.",
              ),
              followup: {
                kind: "dreamsign-flow",
                title: assertLocalized("Break the pattern"),
                subtitle: assertLocalized(
                  "Choose the signs that leave your collection.",
                ),
                mode: "purge-and-gain-random",
                offered: [],
                held,
                requiredOverflowReplacementCount: 2,
              },
            },
            base.actions[1],
          ],
        }}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(container.textContent).not.toContain(randomDreamsignId);
    act(() =>
      container
        .querySelector<HTMLElement>(
          `[data-testid="cumulus-exploration-dreamsign-purge-${held[0].id}"]`,
        )
        ?.click(),
    );
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-dreamsign-flow="purge-and-gain-random"]',
      )?.dataset.explorationDreamsignFlowStep,
    ).toBe("overflow");
    for (const item of held.slice(1)) {
      act(() =>
        container
          .querySelector<HTMLElement>(
            `[data-testid="cumulus-exploration-dreamsign-replacement-${item.id}"]`,
          )
          ?.click(),
      );
    }
    expect(
      container.querySelectorAll(
        '[data-dreamsign-choice-role="replacement"] [data-dreamsign-choice-selected="true"]',
      ),
    ).toHaveLength(2);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      purgedDreamsignId: held[0].id,
      overflowReplacementDreamsignIds: [held[1].id, held[2].id],
    });
    act(() => root.unmount());
  });

  it("resolves replace-all directly and reveals persisted random Dreamsign outcomes under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const directBase = view();
    const directResolve = vi.fn();
    const direct = mount(
      <ExplorationSiteScreen
        view={{
          ...directBase,
          actions: [
            {
              ...directBase.actions[0],
              effectKind: "replace-all-dreamsigns-random",
            },
            directBase.actions[1],
          ],
        }}
        onChannel={vi.fn()}
        onResolve={directResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      direct.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      direct.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(directResolve).toHaveBeenCalledWith("choice-a");
    act(() => direct.root.unmount());

    const onExit = vi.fn();
    const outcome = mount(
      <ExplorationSiteScreen
        view={dreamsignMutationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );
    const mutation = outcome.container.querySelector<HTMLElement>(
      '[data-exploration-outcome="dreamsign-mutation"]',
    );
    expect(mutation?.dataset.explorationDreamsignMutationPhase).toBe("gaining");
    expect(mutation?.dataset.explorationDreamsignGainedIds).toBe(
      "30000000-0000-4000-8000-000000000001,30000000-0000-4000-8000-000000000002",
    );
    expect(mutation?.dataset.explorationDreamsignReplacementCount).toBe("1");
    expect(
      mutation?.querySelectorAll(
        '[data-exploration-dreamsign-mutation-object="gained"]',
      ),
    ).toHaveLength(2);
    const replacement = mutation?.querySelector<HTMLElement>(
      "[data-exploration-dreamsign-replacement]",
    );
    expect(replacement?.dataset.removedDreamsignId).toBe(
      "10000000-0000-4000-8000-000000000002",
    );
    expect(replacement?.dataset.gainedDreamsignId).toBe(
      "30000000-0000-4000-8000-000000000002",
    );
    expect(replacement?.getAttribute("role")).toBe("group");
    expect(replacement?.getAttribute("aria-label")).toBeTruthy();
    expect(
      replacement?.querySelector(
        '[data-exploration-dreamsign-mutation-object="removed"]',
      ),
    ).not.toBeNull();
    expect(
      replacement?.querySelector(
        '[data-exploration-dreamsign-mutation-object="gained"]',
      ),
    ).not.toBeNull();
    expect(
      replacement?.querySelector(
        "[data-exploration-dreamsign-replacement-arrow]",
      ),
    ).not.toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => outcome.root.unmount());
  });

  it("immediately renders the exact persisted Nightmare stack and Dreamsign replacement under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={nightmareDreamsignBundleRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="nightmare-dreamsign-bundle"]',
    );
    expect(outcome?.dataset.explorationNightmareDreamsignSource).toBe(
      "gain-nightmare-and-dreamsign",
    );
    expect(outcome?.dataset.explorationNightmareCount).toBe("2");
    expect(outcome?.dataset.explorationNightmareEntryIds).toBe(
      "nightmare-entry-a,nightmare-entry-b",
    );
    expect(outcome?.dataset.explorationDreamsignGainedIds).toBe(
      "50000000-0000-4000-8000-000000000002",
    );
    expect(outcome?.dataset.explorationDreamsignReplacementCount).toBe("1");
    expect(outcome?.getAttribute("role")).toBe("status");
    expect(outcome?.getAttribute("aria-label")).toBeTruthy();
    const nightmareCards = outcome?.querySelectorAll<HTMLElement>(
      "[data-exploration-nightmare-stack-card]",
    );
    expect(nightmareCards).toHaveLength(2);
    expect(nightmareCards?.item(0).dataset.explorationEntryId).toBe(
      "nightmare-entry-a",
    );
    expect(nightmareCards?.item(1).dataset.explorationEntryId).toBe(
      "nightmare-entry-b",
    );
    const replacement = outcome?.querySelector<HTMLElement>(
      "[data-exploration-dreamsign-replacement]",
    );
    expect(replacement?.dataset.removedDreamsignId).toBe(
      "50000000-0000-4000-8000-000000000001",
    );
    expect(replacement?.dataset.gainedDreamsignId).toBe(
      "50000000-0000-4000-8000-000000000002",
    );
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("immediately presents persisted starter-card pairs with semantic UUIDs under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterCardMutationRewardView("replace")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="starter-card-mutation"]',
    );
    expect(outcome?.dataset.explorationStarterCardSource).toBe(
      "replace-all-starter-cards",
    );
    expect(outcome?.dataset.explorationStarterCardMode).toBe("replace");
    expect(outcome?.dataset.explorationStarterCardPhase).toBe("terminal");
    expect(outcome?.dataset.explorationStarterCardPurgedEntryIds).toBe(
      "starter-entry-a,starter-entry-b",
    );
    expect(outcome?.dataset.explorationStarterCardGainedEntryIds).toBe(
      "gained-entry-a,gained-entry-b",
    );
    expect(outcome?.dataset.explorationStarterCardReplacementCount).toBe("2");
    expect(outcome?.getAttribute("role")).toBe("status");
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    const pairs = outcome?.querySelectorAll<HTMLElement>(
      "[data-exploration-starter-card-replacement]",
    );
    expect(pairs).toHaveLength(2);
    expect(pairs?.item(0).dataset.purgedEntryId).toBe("starter-entry-a");
    expect(pairs?.item(0).dataset.gainedEntryId).toBe("gained-entry-a");
    expect(pairs?.item(1).dataset.purgedEntryId).toBe("starter-entry-b");
    expect(pairs?.item(1).dataset.gainedEntryId).toBe("gained-entry-b");
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-starter-card-mutation-object="purged"]',
      ),
    ).toHaveLength(2);
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-starter-card-mutation-object="gained"]',
      ),
    ).toHaveLength(2);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents starter-card purges before persisted replacements", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterCardMutationRewardView("replace")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = () =>
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="starter-card-mutation"]',
      );
    expect(outcome()?.dataset.explorationStarterCardPhase).toBe("purging");
    expect(
      outcome()?.querySelectorAll("[data-exploration-purge-card]"),
    ).toHaveLength(2);
    expect(
      outcome()?.querySelectorAll(
        "[data-exploration-starter-card-replacement]",
      ),
    ).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(outcome()?.dataset.explorationStarterCardPhase).toBe("replacing");
    expect(
      outcome()?.querySelectorAll("[data-exploration-purge-card]"),
    ).toHaveLength(0);
    expect(
      outcome()?.querySelectorAll(
        "[data-exploration-starter-card-replacement]",
      ),
    ).toHaveLength(2);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents a persisted starter-card purge without a replacement pair", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterCardMutationRewardView("purge")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="starter-card-mutation"]',
    );
    expect(outcome?.dataset.explorationStarterCardMode).toBe("purge");
    expect(outcome?.dataset.explorationStarterCardReplacementCount).toBe("0");
    expect(outcome?.dataset.explorationStarterCardPurgedEntryIds).toBe(
      "starter-entry-a",
    );
    expect(
      outcome?.querySelectorAll("[data-exploration-purge-card]"),
    ).toHaveLength(1);
    expect(
      outcome?.querySelectorAll("[data-exploration-starter-card-replacement]"),
    ).toHaveLength(0);
    act(() => root.unmount());
  });

  it("presents persisted starter-card base-to-form mappings immediately under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterCardTransfigurationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="starter-card-transfiguration"]',
    );
    expect(outcome?.dataset.explorationStarterCardTransfigurationSource).toBe(
      "transfigure-random-starter-cards",
    );
    expect(outcome?.dataset.explorationStarterCardTransfigurationPhase).toBe(
      "terminal",
    );
    expect(outcome?.dataset.explorationStarterCardTransfigurationCount).toBe(
      "2",
    );
    expect(outcome?.dataset.explorationStarterCardTransfigurationEntryIds).toBe(
      "starter-transfiguration-entry-a,starter-transfiguration-entry-b",
    );
    expect(outcome?.dataset.explorationStarterCardTransfigurationForms).toBe(
      "Empowered,Kindled",
    );
    expect(outcome?.getAttribute("role")).toBe("status");
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    const pairs = outcome?.querySelectorAll<HTMLElement>(
      "[data-exploration-starter-card-transfiguration-pair]",
    );
    expect(pairs).toHaveLength(2);
    expect(pairs?.item(0).dataset.explorationDeckEntryId).toBe(
      "starter-transfiguration-entry-a",
    );
    expect(pairs?.item(0).dataset.cardId).toBe(
      "00000000-0000-4000-8000-000000000017",
    );
    expect(pairs?.item(0).dataset.beforeTransfiguration).toBe("none");
    expect(pairs?.item(0).dataset.afterTransfiguration).toBe("Empowered");
    expect(pairs?.item(0).getAttribute("aria-label")?.trim()).not.toBe("");
    expect(pairs?.item(1).dataset.explorationDeckEntryId).toBe(
      "starter-transfiguration-entry-b",
    );
    expect(pairs?.item(1).dataset.cardId).toBe(
      "00000000-0000-4000-8000-000000000025",
    );
    expect(pairs?.item(1).dataset.afterTransfiguration).toBe("Kindled");
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-starter-card-transfiguration-face="before"]',
      ),
    ).toHaveLength(2);
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-starter-card-transfiguration-face="after"]',
      ),
    ).toHaveLength(2);
    const pairContainer = outcome?.querySelector<HTMLElement>(
      "[data-exploration-starter-card-transfiguration-pairs]",
    );
    expect(pairContainer?.style.flexWrap).toBe("wrap");
    expect(pairContainer?.style.overflow).toBe("auto");
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents generic persisted multi-card mappings in a bounded reduced-motion review region", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={multiCardTransfigurationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="multi-card-transfiguration"]',
    );
    expect(outcome?.dataset.explorationCardTransfigurationSource).toBe(
      "transfigure-selected",
    );
    expect(outcome?.dataset.explorationCardTransfigurationPhase).toBe(
      "terminal",
    );
    expect(outcome?.dataset.explorationCardTransfigurationCount).toBe("2");
    expect(outcome?.dataset.explorationCardTransfigurationEntryIds).toBe(
      "starter-transfiguration-entry-a,starter-transfiguration-entry-b",
    );
    expect(outcome?.dataset.explorationStarterCardTransfigurationSource).toBe(
      undefined,
    );
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    const reviewRegion = outcome?.querySelector<HTMLElement>(
      "[data-exploration-multi-card-transfiguration-pairs]",
    );
    expect(reviewRegion?.style.maxHeight).toBe("100%");
    expect(reviewRegion?.style.overflow).toBe("auto");
    expect(outcome?.style.bottom).toBe(
      JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
    );
    const pairs = outcome?.querySelectorAll<HTMLElement>(
      "[data-exploration-multi-card-transfiguration-pair]",
    );
    expect(pairs).toHaveLength(2);
    expect(pairs?.item(0).dataset.explorationDeckEntryId).toBe(
      "starter-transfiguration-entry-a",
    );
    expect(pairs?.item(0).dataset.afterTransfiguration).toBe("Empowered");
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-card-transfiguration-face="before"]',
      ),
    ).toHaveLength(2);
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-card-transfiguration-face="after"]',
      ),
    ).toHaveLength(2);
    expect(
      outcome?.querySelectorAll(
        "[data-exploration-starter-card-transfiguration-pair]",
      ),
    ).toHaveLength(0);
    act(() => root.unmount());
  });

  it("presents nonstarter replacement mappings in a bounded reduced-motion review region", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={multiCardReplacementRewardView("replace-random-with-card")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-replacements"]',
    );
    expect(outcome?.dataset.explorationCardReplacementSource).toBe(
      "replace-random-with-card",
    );
    expect(outcome?.dataset.explorationCardReplacementPhase).toBe("terminal");
    expect(outcome?.dataset.explorationCardReplacementCount).toBe("2");
    expect(outcome?.dataset.explorationCardReplacementPurgedEntryIds).toBe(
      "starter-entry-a,starter-entry-b",
    );
    expect(outcome?.dataset.explorationCardReplacementGainedEntryIds).toBe(
      "gained-entry-a,gained-entry-b",
    );
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    const region = outcome?.querySelector<HTMLElement>(
      "[data-exploration-card-replacement-pairs]",
    );
    expect(region?.style.maxHeight).toBe("100%");
    expect(region?.style.overflow).toBe("auto");
    expect(outcome?.style.bottom).toBe(
      JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
    );
    const pairs = outcome?.querySelectorAll<HTMLElement>(
      "[data-exploration-multi-card-replacement]",
    );
    expect(pairs).toHaveLength(2);
    expect(pairs?.item(0).dataset.purgedEntryId).toBe("starter-entry-a");
    expect(pairs?.item(0).dataset.gainedEntryId).toBe("gained-entry-a");
    expect(
      outcome?.querySelectorAll("[data-exploration-starter-card-replacement]"),
    ).toHaveLength(0);
    act(() => root.unmount());
  });

  it("dismisses a fully visible T48 replacement outcome under normal motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        return this.hasAttribute("data-exploration-card-replacement-pairs")
          ? 244
          : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.hasAttribute("data-exploration-card-replacement-pairs")
          ? 244
          : 0;
      },
    );
    const onExit = vi.fn();
    const onChannel = vi.fn();
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={multiCardReplacementRewardView("replace-random-with-card", 1)}
        onChannel={onChannel}
        onResolve={onResolve}
        onExit={onExit}
      />,
    );
    const outcome = () =>
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="card-replacements"]',
      );

    expect(outcome()?.dataset.explorationCardReplacementReviewed).toBe("true");
    act(() => {
      root.render(
        <CumulusRoot>
          <ExplorationSiteScreen
            view={multiCardReplacementRewardView("replace-random-with-card", 1)}
            onChannel={onChannel}
            onResolve={onResolve}
            onExit={onExit}
          />
        </CumulusRoot>,
      );
    });
    expect(outcome()?.dataset.explorationCardReplacementReviewed).toBe("true");
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents exact card-type mappings in a bounded reduced-motion review region", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={cardTypeChangesRewardView("change-card-type-selected")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-type-changes"]',
    );
    expect(outcome?.dataset.explorationCardTypeChangeSource).toBe(
      "change-card-type-selected",
    );
    expect(outcome?.dataset.explorationCardTypeChangePhase).toBe("terminal");
    expect(outcome?.dataset.explorationCardTypeChangeCount).toBe("2");
    expect(outcome?.dataset.explorationCardTypeChangeEntryIds).toBe(
      "type-change-entry-1,type-change-entry-2",
    );
    expect(outcome?.dataset.explorationCardTypeChangeBeforeTypes).toBe(
      "Character,Character",
    );
    expect(outcome?.dataset.explorationCardTypeChangeAfterTypes).toBe(
      "Event,Event",
    );
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    const region = outcome?.querySelector<HTMLElement>(
      "[data-exploration-card-type-change-pairs]",
    );
    expect(region?.style.maxHeight).toBe("100%");
    expect(region?.style.overflow).toBe("auto");
    expect(outcome?.style.bottom).toBe(
      JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
    );
    const pairs = outcome?.querySelectorAll<HTMLElement>(
      "[data-exploration-card-type-change-pair]",
    );
    expect(pairs).toHaveLength(2);
    expect(pairs?.item(0).dataset.explorationDeckEntryId).toBe(
      "type-change-entry-1",
    );
    expect(pairs?.item(0).dataset.cardId).toBe(
      "00000000-0000-4000-8000-000000000017",
    );
    expect(pairs?.item(0).dataset.beforeCardType).toBe("Character");
    expect(pairs?.item(0).dataset.afterCardType).toBe("Event");
    expect(pairs?.item(0).dataset.beforeTypeChangePredicateId).toBe("none");
    expect(pairs?.item(0).dataset.afterTypeChangePredicateId).toBe(
      "exploration:card-type:Event",
    );
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-card-type-change-face="before"][data-card-type="Character"]',
      ),
    ).toHaveLength(2);
    expect(
      outcome?.querySelectorAll(
        '[data-exploration-card-type-change-face="after"][data-card-type="Event"]',
      ),
    ).toHaveLength(2);
    act(() => root.unmount());
  });

  it("dismisses a fully visible T53 type-change outcome under normal motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        return this.hasAttribute("data-exploration-card-type-change-pairs")
          ? 244
          : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.hasAttribute("data-exploration-card-type-change-pairs")
          ? 244
          : 0;
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={cardTypeChangesRewardView("change-card-type-selected", 1)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-type-changes"]',
    );

    expect(outcome?.dataset.explorationCardTypeChangeReviewed).toBe("true");
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(outcome?.dataset.explorationCardTypeChangePhase).toBe(
      "transfigured",
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("keeps an overflowing narrow transfiguration outcome in the HUD-safe region until every pair is reviewed", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        return this.hasAttribute(
          "data-exploration-starter-card-transfiguration-pairs",
        )
          ? 500
          : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.hasAttribute(
          "data-exploration-starter-card-transfiguration-pairs",
        )
          ? 720
          : 0;
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterCardTransfigurationRewardView(4)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="starter-card-transfiguration"]',
    );
    const pairContainer = outcome?.querySelector<HTMLElement>(
      "[data-exploration-starter-card-transfiguration-pairs]",
    );

    expect(
      outcome?.querySelectorAll(
        "[data-exploration-starter-card-transfiguration-pair]",
      ),
    ).toHaveLength(4);
    expect(outcome?.style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect(outcome?.style.bottom).toBe(
      JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
    );
    expect(outcome?.style.overflow).toBe("hidden");
    expect(pairContainer?.style.maxHeight).toBe("100%");
    expect(pairContainer?.style.overflow).toBe("auto");
    expect(pairContainer?.getAttribute("role")).toBe("region");
    expect(pairContainer?.tabIndex).toBe(0);
    expect(outcome?.dataset.explorationStarterCardTransfigurationReviewed).toBe(
      "false",
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onExit).not.toHaveBeenCalled();

    if (pairContainer === undefined || pairContainer === null) {
      throw new Error("starter transfiguration pair container is required");
    }
    Object.defineProperty(pairContainer, "scrollTop", {
      configurable: true,
      value: 220,
    });
    act(() => {
      pairContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(outcome?.dataset.explorationStarterCardTransfigurationReviewed).toBe(
      "true",
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("stages starter-card transfiguration from original cards into staggered form reveals", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={starterCardTransfigurationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );
    const outcome = () =>
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="starter-card-transfiguration"]',
      );
    expect(outcome()?.dataset.explorationStarterCardTransfigurationPhase).toBe(
      "original",
    );
    expect(
      outcome()?.querySelectorAll(
        '[data-exploration-starter-card-transfiguration-side="concealed"]',
      ),
    ).toHaveLength(2);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(outcome()?.dataset.explorationStarterCardTransfigurationPhase).toBe(
      "transfigured",
    );
    expect(
      outcome()?.querySelectorAll(
        '[data-exploration-starter-card-transfiguration-side="revealed"]',
      ),
    ).toHaveLength(2);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("renders persisted T30 and T63 Dreamsign replacement mappings", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const cases = [
      {
        sourceKind: "replace-selected-dreamsign-with-offered" as const,
        pairs: [
          [
            "10000000-0000-4000-8000-000000000002",
            "30000000-0000-4000-8000-000000000001",
          ],
        ],
      },
      {
        sourceKind: "replace-all-dreamsigns-random" as const,
        pairs: [
          [
            "10000000-0000-4000-8000-000000000001",
            "30000000-0000-4000-8000-000000000001",
          ],
          [
            "10000000-0000-4000-8000-000000000002",
            "30000000-0000-4000-8000-000000000002",
          ],
        ],
      },
    ] as const;

    for (const fixture of cases) {
      const outcome = mount(
        <ExplorationSiteScreen
          view={dreamsignMutationRewardView(fixture.sourceKind)}
          onChannel={vi.fn()}
          onResolve={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      const mutation = outcome.container.querySelector<HTMLElement>(
        '[data-exploration-outcome="dreamsign-mutation"]',
      );
      expect(mutation?.dataset.explorationDreamsignMutationSource).toBe(
        fixture.sourceKind,
      );
      expect(mutation?.dataset.explorationDreamsignReplacementCount).toBe(
        String(fixture.pairs.length),
      );
      const renderedPairs = mutation?.querySelectorAll<HTMLElement>(
        "[data-exploration-dreamsign-replacement]",
      );
      expect(renderedPairs).toHaveLength(fixture.pairs.length);
      fixture.pairs.forEach(([removedId, gainedId], index) => {
        const pair = renderedPairs?.item(index);
        expect(pair?.dataset.removedDreamsignId).toBe(removedId);
        expect(pair?.dataset.gainedDreamsignId).toBe(gainedId);
        expect(
          pair?.querySelector(
            `[data-exploration-dreamsign-mutation-object="removed"][data-dreamsign-id="${removedId}"]`,
          ),
        ).not.toBeNull();
        expect(
          pair?.querySelector(
            `[data-exploration-dreamsign-mutation-object="gained"][data-dreamsign-id="${gainedId}"]`,
          ),
        ).not.toBeNull();
      });
      act(() => outcome.root.unmount());
    }
  });

  it("uses the standard transfiguration picker and commits the chosen free form", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const transformed = {
      ...base.card.displaySnapshot,
      energyCost: 1,
    };
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "transfiguration",
            candidates: [
              {
                entryId: "entry-fixture",
                model: base.card,
                availability: "available",
                reforgedType: null,
                forms: [
                  {
                    type: "Empowered",
                    presentation:
                      localizedTransfigurationFormFixture("Empowered"),
                    change: { kind: "energy-delta", from: 2, to: 1 },
                    effectDetails: { energyCost: { before: 2, after: 1 } },
                    essenceCost: 0,
                    affordable: true,
                    previewModel: {
                      cardId: transformed.id,
                      displaySnapshot: transformed,
                      transfiguration: {
                        type: "Empowered",
                        form: transfigurationFormFixture("Empowered"),
                        markedText: transformed.renderedText,
                        energyChanged: true,
                        energyChangeName: "Fixture energy form",
                        sparkChanged: false,
                        sparkChangeName: null,
                        fastChanged: false,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-picker"]'),
    ).not.toBeNull();

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-card-entry-fixture"]',
        )
        ?.click(),
    );
    const form = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-transfiguration-form-Empowered"]',
    );
    expect(
      form?.querySelector("[data-transfiguration-button-price]"),
    ).toBeNull();
    expect(form?.getAttribute("aria-disabled")).toBeNull();
    act(() => form?.click());
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );

    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-fixture"],
      transfiguration: "Empowered",
    });
    act(() => root.unmount());
  });

  it("resolves a pack from its explicit Choose button", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "packs",
            title: assertLocalized("Answer Their Muster"),
            subtitle: assertLocalized("Choose one pack to add to your deck."),
            packs: [0, 1].map((index) => ({
              index,
              cards: [0, 1, 2].map((cardIndex) => ({
                entryId: `pack-${String(index)}-card-${String(cardIndex)}`,
                model: base.card,
                isBane: false,
              })),
            })),
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    const secondPack = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-pack-1"]',
    );
    expect(
      container.querySelector("[data-exploration-pack-offer]"),
    ).not.toBeNull();
    expect(secondPack?.tagName).toBe("SECTION");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-followup-confirm"]',
      ),
    ).toBeNull();
    act(() => secondPack?.click());
    expect(onResolve).not.toHaveBeenCalled();

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-pack-1-choose"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", { packIndex: 1 });
    act(() => root.unmount());
  });

  it("presents four offered cards in the centered Augury choice grid without a Back button", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const offeredCards = [
      "offered-a",
      "offered-b",
      "offered-c",
      "offered-d",
    ].map((entryId) => ({ entryId, model: base.card, isBane: false }));
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          label: assertLocalized("Choose a Guide"),
          followup: {
            kind: "cards",
            title: assertLocalized("Choose a Guide"),
            subtitle: assertLocalized("Choose one offered card."),
            cards: offeredCards,
            mode: "single",
            selectionKey: "cardIds",
            min: 1,
            max: 1,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    const offer = container.querySelector<HTMLElement>(
      "[data-exploration-card-offer]",
    );
    expect(offer).not.toBeNull();
    expect(
      offer
        ?.querySelector("[data-card-choice-grid]")
        ?.getAttribute("data-card-choice-grid-columns"),
    ).toBe("4");
    expect(
      offer?.querySelector<HTMLElement>("[data-card-choice-grid]")
        ?.parentElement?.style.containerType,
    ).toBe("inline-size");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-card-followup"]',
      ),
    ).toBeNull();
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Back",
      ),
    ).toBe(false);

    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-offered-c"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      cardIds: ["offered-c"],
    });
    act(() => root.unmount());
  });

  it("lets the player undo the purge target in a purge-and-copy follow-up", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "cards",
            title: assertLocalized("Exchange Familiar Forms"),
            subtitle: assertLocalized(
              "Choose a card to purge, then a card to copy.",
            ),
            cards: [
              { entryId: "entry-a", model: base.card, isBane: false },
              { entryId: "entry-b", model: base.card, isBane: false },
            ],
            mode: "purge-and-copy",
            selectionKey: "entryIds",
            min: 2,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-entry-id]"),
      ).map((entry) => entry.dataset.entryId),
    ).toEqual(["entry-a", "entry-b"]);
    const purgeCard = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-card-entry-a"]',
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    act(() => purgeCard?.click());
    expect(confirm?.textContent).toContain("Choose a card to copy");
    expect(
      container.querySelector(
        '[data-gallery-entry-id="entry-a"] [data-card-choice-operation="purge"]',
      ),
    ).not.toBeNull();

    const copyCard = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-card-entry-b"]',
    );
    act(() => copyCard?.click());
    expect(
      container.querySelector(
        '[data-gallery-entry-id="entry-b"] [data-card-choice-operation="copy"]',
      ),
    ).not.toBeNull();
    expect(confirm?.textContent).toContain("Confirm Choice");

    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-entry-a"]',
        )
        ?.click(),
    );
    expect(confirm?.textContent).toContain("Choose a card to purge");
    expect(container.querySelector("[data-card-choice-operation]")).toBeNull();
    act(() => root.unmount());
  });

  it("submits exactly two UUID-selected cards for the multi-copy follow-up", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "copy-selected-cards",
          followup: {
            kind: "cards",
            title: assertLocalized("Copy two"),
            subtitle: assertLocalized("Choose two cards to copy."),
            cards: ["entry-a", "entry-b", "entry-c"].map((entryId) => ({
              entryId,
              model: base.card,
              isBane: false,
            })),
            mode: "exact",
            selectionKey: "entryIds",
            selectionOperation: "copy",
            min: 2,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    for (const entryId of ["entry-a", "entry-b"]) {
      act(() =>
        container
          .querySelector<HTMLElement>(
            `[data-testid="cumulus-exploration-card-${entryId}"]`,
          )
          ?.click(),
      );
    }
    expect(
      container.querySelectorAll('[data-card-choice-operation="copy"]'),
    ).toHaveLength(2);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );

    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-a", "entry-b"],
    });
    act(() => root.unmount());
  });

  it("submits zero to two UUID-selected cards for an optional bounded purge", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "purge-selected",
          followup: {
            kind: "cards",
            title: assertLocalized("Stand Down the Escort"),
            subtitle: assertLocalized(
              "Choose up to two Warrior cards to purge.",
            ),
            cards: ["entry-a", "entry-b", "entry-c"].map((entryId) => ({
              entryId,
              model: base.card,
              isBane: false,
            })),
            mode: "exact",
            selectionKey: "entryIds",
            selectionOperation: "purge",
            min: 0,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const openChoice = (container: HTMLElement): void => {
      act(() =>
        container
          .querySelector<HTMLButtonElement>(
            '[data-testid="cumulus-exploration-channel"]',
          )
          ?.click(),
      );
      act(() =>
        container
          .querySelector<HTMLButtonElement>(
            '[data-testid="cumulus-exploration-choice-0"]',
          )
          ?.click(),
      );
    };

    const resolveNone = vi.fn();
    const empty = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={resolveNone}
        onExit={vi.fn()}
      />,
    );
    openChoice(empty.container);
    const emptyConfirm = empty.container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    expect(emptyConfirm?.disabled).toBe(false);
    act(() => emptyConfirm?.click());
    expect(resolveNone).toHaveBeenCalledWith("choice-a", { entryIds: [] });
    act(() => empty.root.unmount());

    const resolveTwo = vi.fn();
    const selected = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={resolveTwo}
        onExit={vi.fn()}
      />,
    );
    openChoice(selected.container);
    for (const entryId of ["entry-a", "entry-b", "entry-c"]) {
      act(() =>
        selected.container
          .querySelector<HTMLElement>(
            `[data-testid="cumulus-exploration-card-${entryId}"]`,
          )
          ?.click(),
      );
    }
    expect(
      selected.container.querySelectorAll(
        '[data-card-choice-operation="purge"]',
      ),
    ).toHaveLength(2);
    act(() =>
      selected.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(resolveTwo).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-a", "entry-b"],
    });
    act(() => selected.root.unmount());
  });

  it("requires one concealed multi-replacement source and submits only selected entry UUIDs", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const replacementView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "replace-selected",
          mechanics: {
            effectKind: "replace-selected",
            predicate: "event",
            count: 2,
          },
          followup: {
            kind: "cards",
            title: assertLocalized("Choose echoes"),
            subtitle: assertLocalized("Choose one or two Events."),
            cards: ["replacement-source-a", "replacement-source-b"].map(
              (entryId) => ({ entryId, model: base.card, isBane: false }),
            ),
            mode: "exact",
            selectionKey: "entryIds",
            selectionOperation: "purge",
            min: 1,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={replacementView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    expect(
      container.querySelector("[data-exploration-card-replacement]"),
    ).toBeNull();
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-replacement-source-a"]',
        )
        ?.click(),
    );
    expect(confirm?.getAttribute("aria-disabled")).toBeNull();
    expect(
      container.querySelectorAll('[data-card-choice-operation="purge"]'),
    ).toHaveLength(1);
    act(() => confirm?.click());
    expect(onResolve).toHaveBeenCalledOnce();
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["replacement-source-a"],
    });
    act(() => root.unmount());
  });

  it("submits an exact fixed-form multi-transfiguration without a form step", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const fixedView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "transfigure-fixed-selected",
          mechanics: {
            effectKind: "transfigure-fixed-selected",
            transfiguration: "Kindled",
            count: 2,
          },
          effectDisclosure: assertLocalized(
            "Fixture fixed form disclosure.",
          ),
          followup: {
            kind: "cards",
            title: assertLocalized("Share the fire"),
            subtitle: assertLocalized("Choose exactly two Warriors."),
            cards: ["fixed-source-a", "fixed-source-b"].map((entryId) => ({
              entryId,
              model: base.card,
              isBane: false,
            })),
            mode: "exact",
            selectionKey: "entryIds",
            selectionOperation: "transfigure",
            min: 2,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={fixedView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    for (const entryId of ["fixed-source-a", "fixed-source-b"]) {
      act(() =>
        container
          .querySelector<HTMLElement>(
            `[data-testid="cumulus-exploration-card-${entryId}"]`,
          )
          ?.click(),
      );
    }
    expect(confirm?.getAttribute("aria-disabled")).toBeNull();
    expect(
      container.querySelectorAll('[data-card-choice-operation="transfigure"]'),
    ).toHaveLength(2);
    expect(
      container.querySelector(
        '[data-exploration-multi-transfiguration-step="form"]',
      ),
    ).toBeNull();
    act(() => confirm?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["fixed-source-a", "fixed-source-b"],
    });
    act(() => root.unmount());
  });

  it("returns immediately after a choice without a tangible reward", () => {
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view(true)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-narrative-copy"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-continue"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).toBeNull();

    expect(
      container
        .querySelector("[data-exploration-frame-break]")
        ?.getAttribute("data-exploration-frame-break-phase"),
    ).toBe("collapsing");

    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    const cardReturn = container.querySelector(
      "[data-exploration-card-return]",
    );
    expect(cardReturn?.getAttribute("data-exploration-destination")).toBe(
      "journey-deck",
    );
    expect(cardReturn?.querySelector('[data-card-back=""]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      cardReturn?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("flips a deck card into its transfigured form and returns it to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-transfiguration-card")) {
          return new DOMRect(520, 170, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={transfigurationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const reward = container.querySelector<HTMLElement>(
      "[data-exploration-transfiguration-reward]",
    );
    expect(reward?.dataset.explorationTransfigurationPhase).toBe("original");
    expect(reward?.dataset.explorationDeckEntryId).toBe(
      "deck-entry-transfigured",
    );
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      container.querySelector<HTMLElement>(
        "[data-exploration-transfiguration-reward]",
      )?.dataset.explorationTransfigurationPhase,
    ).toBe("transfigured");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-transfigured-card"] i[aria-label]',
      ),
    ).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    const cardReturn = container.querySelector<HTMLElement>(
      "[data-exploration-transfiguration-return]",
    );
    expect(cardReturn?.dataset.explorationDestination).toBe("journey-deck");
    expect(cardReturn?.dataset.explorationDeckEntryId).toBe(
      "deck-entry-transfigured",
    );
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      cardReturn?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("shows a two-card reward at reading size and flies both cards to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-reward-object")) {
          const offset = this.dataset.explorationRewardId?.endsWith("18")
            ? 660
            : 390;
          return new DOMRect(offset, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={twoCardRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(
      container.querySelectorAll('[data-exploration-reward-object="card"]'),
    ).toHaveLength(2);
    expect(container.querySelector("[data-exploration-narrative]")).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-continue"]'),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      '[data-exploration-reward-flight="card"]',
    );
    expect(flights).toHaveLength(2);
    expect(
      [...flights].map((flight) =>
        flight.getAttribute("data-exploration-destination"),
      ),
    ).toEqual(["journey-deck", "journey-deck"]);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("purges first, then emits a copy from its source and flies both to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-card-copy-role")) {
          return new DOMRect(
            this.dataset.explorationCardCopyRole === "original" ? 520 : 700,
            180,
            240,
            336,
          );
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgeAndCopyRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="purge-and-copy"]',
      )?.dataset.explorationCompoundPhase,
    ).toBe("purging");
    expect(
      container.querySelector("[data-exploration-purge-icon] .bx-trash"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-exploration-card-copy-stage]"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(container.querySelector("[data-exploration-purge-card]")).toBeNull();
    const copyOutcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purge-and-copy"][data-exploration-compound-phase="copying"]',
    );
    expect(copyOutcome?.dataset.explorationCardCopiesPhase).toBe("original");
    expect(
      [...container.querySelectorAll("[data-exploration-card-copy-role]")].map(
        (card) => ({
          role: card.getAttribute("data-exploration-card-copy-role"),
          entryId: card.getAttribute("data-exploration-deck-entry-id"),
        }),
      ),
    ).toEqual([
      { role: "original", entryId: "source-entry" },
      { role: "copy", entryId: "copy-entry" },
    ]);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="purge-and-copy"][data-exploration-compound-phase="copying"]',
      )?.dataset.explorationCardCopiesPhase,
    ).toBe("copies");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      '[data-exploration-card-copy-flight][data-exploration-outcome="purge-and-copy"]',
    );
    expect(
      [...flights].map((flight) => ({
        role: flight.getAttribute("data-exploration-card-copy-role"),
        entryId: flight.getAttribute("data-exploration-deck-entry-id"),
        destination: flight.getAttribute("data-exploration-destination"),
      })),
    ).toEqual([
      {
        role: "original",
        entryId: "source-entry",
        destination: "journey-deck",
      },
      {
        role: "copy",
        entryId: "copy-entry",
        destination: "journey-deck",
      },
    ]);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents both purge-and-copy phases without travel under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgeAndCopyRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="purge-and-copy"]',
      )?.dataset.explorationCompoundPhase,
    ).toBe("purging");
    expect(
      container.querySelector("[data-exploration-purge-card]"),
    ).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const copyOutcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purge-and-copy"]',
    );
    expect(copyOutcome?.dataset.explorationCompoundPhase).toBe("copying");
    expect(copyOutcome?.dataset.explorationCardCopiesPhase).toBe("copies");
    expect(
      [...container.querySelectorAll("[data-exploration-card-copy-role]")].map(
        (card) => card.getAttribute("data-exploration-card-copy-role"),
      ),
    ).toEqual(["original", "copy"]);
    expect(
      container.querySelector("[data-exploration-card-copy-flight]"),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("fans every affected card around a semantic deck-modification announcement", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={deckModificationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    const reward = container.querySelector<HTMLElement>(
      "[data-exploration-deck-modification-reward]",
    );
    const cards = reward?.querySelectorAll<HTMLElement>(
      "[data-exploration-deck-modification-card]",
    );
    expect(reward?.dataset.explorationDeckModificationKind).toBe("spark");
    expect(reward?.dataset.explorationDeckModificationCount).toBe("2");
    expect(reward?.getAttribute("aria-label")).not.toBe("");
    expect(reward?.getAttribute("aria-label")).not.toContain(
      "exploration-deck-modification",
    );
    expect(
      [...(cards ?? [])].map((card) => card.dataset.explorationDeckEntryId),
    ).toEqual(["deck-entry-a", "deck-entry-b"]);
    const sparkAnnouncement = reward?.querySelector<HTMLElement>(
      "[data-radial-announcement]",
    );
    const sparkGlyph = sparkAnnouncement?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="spark"]',
    );
    expect(sparkAnnouncement?.textContent).not.toBe("");
    expect(sparkGlyph?.querySelector("i")?.className).toContain("bx-sparkle");
    expect(sparkGlyph?.parentElement?.style.color).toContain(SPARK_ICON_COLOR);
    expect(
      reward?.querySelector<HTMLElement>(
        '[data-testid="cumulus-exploration-deck-modification-card-deck-entry-a"] .card-view',
      )?.style.boxShadow,
    ).toContain("var(--spark)");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents a localized paid bulk transfiguration with exact cost and targets", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={bulkTransfigurationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    const reward = container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="transfiguration"]',
    );
    expect(reward?.dataset.explorationDeckModificationCount).toBe("2");
    expect(reward?.getAttribute("aria-label")).not.toBe("");
    expect(reward?.getAttribute("aria-label")).not.toContain(
      "exploration-bulk-transfiguration-complete",
    );
    expect(
      reward?.querySelector("[data-radial-announcement-headline]")?.textContent,
    ).not.toBe("");
    const cards = reward?.querySelectorAll<HTMLElement>(
      "[data-exploration-deck-modification-card]",
    );
    expect(
      [...(cards ?? [])].map((card) => ({
        entryId: card.dataset.explorationDeckEntryId,
        essenceSpent: card.dataset.explorationEssenceSpent,
        transfiguration: card.dataset.explorationTransfiguration,
      })),
    ).toEqual([
      {
        entryId: "deck-entry-a",
        essenceSpent: "100",
        transfiguration: "Inspired",
      },
      {
        entryId: "deck-entry-b",
        essenceSpent: "100",
        transfiguration: "Inspired",
      },
    ]);
    expect(
      reward?.querySelectorAll(
        "[data-exploration-deck-modification-card] i[aria-label]",
      ),
    ).toHaveLength(2);
    act(() => root.unmount());
  });

  it("shows the fast modifier and canonical bolt on every modified card", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const fastView = deckModificationRewardView("fast");
    const unresolvedFastView: ExplorationSiteView = {
      ...fastView,
      actions: [
        {
          ...fastView.actions[0],
          effectText: assertLocalized(
            "All cards in your deck become ❖ (fast)",
          ),
        },
        fastView.actions[1],
      ],
      resolvedActionId: null,
      reward: null,
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={unresolvedFastView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const effect = container.querySelector<HTMLElement>(
      "#exploration-effect-0",
    );
    expect(effect?.textContent).not.toContain("❖");
    expect(effect?.querySelector("[data-inline-glyph] i")?.className).toContain(
      "bx-bolt",
    );
    act(() => root.unmount());

    const persisted = mount(
      <ExplorationSiteScreen
        view={deckModificationRewardView("fast")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const reward = persisted.container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="fast"]',
    );
    const announcement = reward?.querySelector<HTMLElement>(
      "[data-radial-announcement]",
    );
    expect(announcement?.textContent).not.toContain("Fast");
    expect(
      announcement?.querySelector("[data-inline-glyph] i")?.className,
    ).toContain("bx-bolt");
    expect(
      reward?.querySelectorAll('[data-attribute-chip="fast"]'),
    ).toHaveLength(2);
    act(() => persisted.root.unmount());
  });

  it("presents tangible rewards after a composite deck modification", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const modified = deckModificationRewardView();
    const baseDeckModification =
      modified.reward !== null && !("kind" in modified.reward)
        ? modified.reward.deckModification
        : null;
    if (baseDeckModification === null) {
      throw new Error("fixture requires a deck modification reward");
    }
    const deckModification = {
      ...baseDeckModification,
      kind: "energy-cost" as const,
      amount: 1,
    };
    const composite: ExplorationSiteView = {
      ...modified,
      reward: {
        objects: { cards: [modified.card], purgedCards: [], dreamsigns: [] },
        deckModification,
      },
    };
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={composite}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const modification = container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="energy-cost"]',
    );
    expect(modification).not.toBeNull();
    const energyGlyph = modification?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="energy"]',
    );
    expect(
      modification?.querySelector("[data-radial-announcement-headline]")
        ?.textContent,
    ).not.toBe("");
    expect(energyGlyph?.querySelector("i")?.className).toContain("bx-fire-alt");
    expect(energyGlyph?.parentElement?.style.color).toContain(
      ENERGY_ICON_COLOR,
    );
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-exploration-reward-stage]"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3_360);
    });
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).toBeNull();
    expect(
      container.querySelector("[data-exploration-reward-stage]"),
    ).not.toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("presents the complete purge-then-Reclaim sequence under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const modified = deckModificationRewardView();
    if (modified.reward === null || "kind" in modified.reward) {
      throw new Error("fixture requires a deck modification reward");
    }
    const purgedCard = modified.reward.deckModification?.cards[0]?.model;
    const survivorCards = modified.reward.deckModification?.cards;
    if (purgedCard === undefined || survivorCards === undefined) {
      throw new Error("fixture requires purged and surviving cards");
    }
    const reclaimView: ExplorationSiteView = {
      ...modified,
      reward: {
        objects: {
          cards: [],
          purgedCards: [
            { entryId: "purged-entry-a", model: purgedCard, isBane: false },
            { entryId: "purged-entry-b", model: purgedCard, isBane: false },
          ],
          dreamsigns: [],
        },
        deckModification: {
          kind: "reclaim",
          announcement: assertLocalized(
            "Purge all copies of every duplicated card from your deck. Every card remaining in your deck gains reclaim.",
          ),
          cards: survivorCards,
          reclaimCostByEntryId: {
            "deck-entry-a": 2,
            "deck-entry-b": 4,
          },
        },
      },
    };
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={reclaimView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const purgedCards = container.querySelectorAll<HTMLElement>(
      "[data-exploration-purge-card]",
    );
    expect(purgedCards).toHaveLength(2);
    expect(
      [...purgedCards].map((card) => card.dataset.explorationDeckEntryId),
    ).toEqual(["purged-entry-a", "purged-entry-b"]);
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_100);
    });
    expect(container.querySelector("[data-exploration-purge-card]")).toBeNull();
    const reclaim = container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="reclaim"]',
    );
    expect(reclaim?.dataset.explorationDeckModificationCount).toBe("2");
    expect(
      reclaim?.querySelector<HTMLElement>(
        '[data-exploration-deck-entry-id="deck-entry-a"]',
      )?.dataset.explorationReclaimCost,
    ).toBe("2");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents a purged card before strengthening the survivors", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const modified = deckModificationRewardView();
    if (modified.reward === null || "kind" in modified.reward) {
      throw new Error("fixture requires a deck modification reward");
    }
    const purgedCard = modified.reward.deckModification?.cards[0]?.model;
    const survivorCards = modified.reward.deckModification?.cards;
    if (purgedCard === undefined || survivorCards === undefined) {
      throw new Error("fixture requires purged and surviving cards");
    }
    const purgeAndStrengthenView: ExplorationSiteView = {
      ...modified,
      reward: {
        objects: {
          cards: [],
          purgedCards: [
            { entryId: "purged-warrior", model: purgedCard, isBane: false },
          ],
          dreamsigns: [],
        },
        deckModification: {
          kind: "spark",
          announcement: assertLocalized(
            "Purge a random Warrior. Every other Warrior in your deck gains +1 spark.",
          ),
          cards: survivorCards,
          amount: 1,
        },
      },
    };
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgeAndStrengthenView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-deck-entry-id="purged-warrior"]',
      )?.dataset.explorationPurgeCard,
    ).toBe("");
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_100);
    });
    expect(container.querySelector("[data-exploration-purge-card]")).toBeNull();
    const spark = container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="spark"]',
    );
    expect(spark?.dataset.explorationDeckModificationCount).toBe("2");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("resumes a persisted deck modification directly at the reward moment", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={deckModificationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("flies a gained Dreamsign to its UUID-matched HUD dock", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-reward-object")) {
          return new DOMRect(520, 190, 240, 240);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const dreamsignTarget = document.createElement("span");
    dreamsignTarget.dataset.dreamsignId = "reward-dreamsign-id";
    dreamsignTarget.getBoundingClientRect = () =>
      new DOMRect(1140, 730, 58, 58);
    document.body.append(dreamsignTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={dreamsignRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-exploration-reward-object="dreamsign"]'),
    ).not.toBeNull();
    expect(dreamsignTarget.style.visibility).toBe("hidden");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flight = container.querySelector(
      '[data-exploration-reward-flight="dreamsign"]',
    );
    expect(flight?.getAttribute("data-exploration-destination")).toBe(
      "journey-dreamsign",
    );
    act(() => {
      flight?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(dreamsignTarget.style.visibility).toBe("");
  });

  it("counts the contributing Spirit Animals before announcing the total Essence", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={essenceRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(
      container.querySelectorAll("[data-exploration-essence-card]"),
    ).toHaveLength(6);
    expect(
      container.querySelectorAll('[data-essence-value-variant="rewardBadge"]'),
    ).toHaveLength(6);
    expect(
      container.querySelector("[data-exploration-essence-cards]")?.textContent,
    ).toContain("+15");
    expect(
      container.querySelector("[data-exploration-essence-announcement]"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(
      container.querySelector("[data-exploration-essence-cards]"),
    ).toBeNull();
    const announcement = container.querySelector(
      "[data-exploration-essence-announcement]",
    );
    expect(announcement?.textContent).toContain("+90");
    expect(announcement?.textContent).toContain("15");
    expect(announcement?.textContent).toContain("6");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("immediately presents persisted direct Essence amounts and exits at zero under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const randomExit = vi.fn();
    const random = mount(
      <ExplorationSiteScreen
        view={directEssenceRewardView("gain-random-essence", 250, 87, 337)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={randomExit}
      />,
    );

    const randomOutcome = random.container.querySelector<HTMLElement>(
      '[data-exploration-outcome="direct-essence"]',
    );
    expect(randomOutcome?.dataset.explorationEssenceSource).toBe(
      "gain-random-essence",
    );
    expect(randomOutcome?.dataset.explorationEssenceBefore).toBe("250");
    expect(randomOutcome?.dataset.explorationEssenceGained).toBe("87");
    expect(randomOutcome?.dataset.explorationEssenceAfter).toBe("337");
    expect(randomOutcome?.dataset.explorationMinimumEssence).toBe("50");
    expect(randomOutcome?.dataset.explorationMaximumEssence).toBe("150");
    expect(
      randomOutcome?.querySelector("[data-radial-announcement-essence]"),
    ).not.toBeNull();
    expect(
      randomOutcome
        ?.querySelector("[data-radial-announcement-detail]")
        ?.textContent?.trim(),
    ).not.toBe("");
    expect(randomExit).not.toHaveBeenCalled();
    act(() => random.root.unmount());

    const zeroExit = vi.fn();
    const zero = mount(
      <ExplorationSiteScreen
        view={directEssenceRewardView("double-essence", 0, 0, 0)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={zeroExit}
      />,
    );
    const zeroOutcome = zero.container.querySelector<HTMLElement>(
      '[data-exploration-outcome="direct-essence"]',
    );
    expect(zeroOutcome?.dataset.explorationEssenceSource).toBe(
      "double-essence",
    );
    expect(zeroOutcome?.dataset.explorationEssenceBefore).toBe("0");
    expect(zeroOutcome?.dataset.explorationEssenceGained).toBe("0");
    expect(zeroOutcome?.dataset.explorationEssenceAfter).toBe("0");
    expect(
      zeroOutcome?.querySelector("[data-radial-announcement-essence]")
        ?.textContent,
    ).toContain("0");
    expect(zeroExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(zeroExit).toHaveBeenCalledOnce();
    act(() => zero.root.unmount());
  });

  it("purges the chosen Dreamsign before announcing the gained Essence", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgedDreamsignEssenceRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const purgedDreamsign = container.querySelector<HTMLElement>(
      "[data-exploration-purged-dreamsign]",
    );
    expect(purgedDreamsign?.dataset.dreamsignId).toBe("purged-dreamsign-id");
    expect(
      container.querySelector(
        "[data-exploration-purged-dreamsign-announcement]",
      ),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      purgedDreamsign?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(
      container.querySelector("[data-exploration-purged-dreamsign-stage]"),
    ).toBeNull();
    const announcement = container.querySelector(
      "[data-exploration-purged-dreamsign-announcement]",
    );
    expect(announcement?.textContent?.trim()).not.toBe("");
    expect(announcement?.textContent).toContain("+50");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("dissolves the exact purged card before announcing its spark-priced Essence", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgedCardEssenceRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const purgeOutcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purged-card-essence"][data-exploration-purged-card-phase="purging"]',
    );
    expect(purgeOutcome?.dataset.explorationDeckEntryId).toBe("purged-entry");
    expect(purgeOutcome?.dataset.cardId).toBe(view().card.cardId);
    expect(purgeOutcome?.dataset.explorationPurgedCardSpark).toBe("2");
    expect(purgeOutcome?.dataset.explorationEssencePerSpark).toBe("20");
    expect(purgeOutcome?.dataset.explorationEssenceGained).toBe("40");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-purged-card"]',
      ),
    ).not.toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector("[data-exploration-purged-card]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    const announcement = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purged-card-essence"][data-exploration-purged-card-phase="announcement"]',
    );
    expect(announcement?.dataset.explorationPurgedCardSpark).toBe("2");
    expect(announcement?.dataset.explorationEssencePerSpark).toBe("20");
    expect(announcement?.dataset.explorationEssenceGained).toBe("40");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("stages a face-down-to-face-up travel from the bottom-right deck anchor", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);

    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    const travel = container.querySelector("[data-exploration-card-travel]");
    expect(travel?.getAttribute("data-exploration-source")).toBe(
      "journey-deck",
    );
    expect(travel?.querySelector("[data-card-back]")).not.toBeNull();
    expect(
      travel?.querySelector(`[data-card-id="${view().card.cardId}"]`),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-exploration-channel-state]")
        ?.getAttribute("data-exploration-channel-state"),
    ).toBe("waiting");

    act(() => root.unmount());
  });

  it("shows the original, emits exact copied entries, and flies every card to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-copy-role")) {
          const role = this.dataset.explorationCardCopyRole;
          const entryId = this.dataset.explorationDeckEntryId;
          const left =
            role === "original" ? 430 : entryId === "copy-entry-a" ? 590 : 750;
          return new DOMRect(left, 180, 240, 336);
        }
        return new DOMRect(100, 100, 240, 336);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={cardCopiesRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-copies"]',
    );
    expect(outcome?.dataset.explorationSourceEntryId).toBe("source-entry");
    expect(outcome?.dataset.explorationCopyCount).toBe("2");
    expect(outcome?.dataset.explorationCardCopiesPhase).toBe("original");
    expect(
      container.querySelector(
        '[data-exploration-card-copy-role="original"][data-exploration-deck-entry-id="source-entry"]',
      ),
    ).not.toBeNull();
    expect(
      [...container.querySelectorAll("[data-exploration-copied-entry-id]")].map(
        (element) => element.getAttribute("data-exploration-copied-entry-id"),
      ),
    ).toEqual(["copy-entry-a", "copy-entry-b"]);
    expect(outcome?.getAttribute("aria-label")).toContain("2");
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="card-copies"]',
      )?.dataset.explorationCardCopiesPhase,
    ).toBe("copies");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      "[data-exploration-card-copy-flight]",
    );
    expect(flights).toHaveLength(3);
    expect(
      [...flights].map((flight) => ({
        entryId: flight.getAttribute("data-exploration-deck-entry-id"),
        destination: flight.getAttribute("data-exploration-destination"),
      })),
    ).toEqual([
      { entryId: "source-entry", destination: "journey-deck" },
      { entryId: "copy-entry-a", destination: "journey-deck" },
      { entryId: "copy-entry-b", destination: "journey-deck" },
    ]);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents two source-to-copy pairs as a dedicated multi-copy outcome", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={multipleCardCopiesRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-copies-multiple"]',
    );
    expect(outcome?.dataset.explorationSourceEntryIds).toBe(
      "source-entry-a,source-entry-b",
    );
    expect(outcome?.dataset.explorationCopyCount).toBe("2");
    expect(
      [
        ...container.querySelectorAll(
          '[data-exploration-card-copy-role="original"]',
        ),
      ].map((element) =>
        element.getAttribute("data-exploration-deck-entry-id"),
      ),
    ).toEqual(["source-entry-a", "source-entry-b"]);
    expect(
      [
        ...container.querySelectorAll(
          '[data-exploration-card-copy-role="copy"]',
        ),
      ].map((element) =>
        element.getAttribute("data-exploration-deck-entry-id"),
      ),
    ).toEqual(["copy-entry-a", "copy-entry-b"]);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      "[data-exploration-card-copy-flight]",
    );
    expect(flights).toHaveLength(4);
    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents the persisted next-battle modifier with its exact amount", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={battleModifierRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="battle-modifier"]',
    );
    expect(outcome?.dataset.explorationBattleModifier).toBe("starting-energy");
    expect(outcome?.dataset.explorationBattleModifierAmount).toBe("2");
    expect(outcome?.dataset.explorationBattlesRemaining).toBe("1");
    expect(outcome?.textContent?.trim()).not.toBe("");
    act(() => root.unmount());
  });

  it("presents the exact compound next-battle modifier under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={smallerHandDiscountRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="smaller-hand-and-cost-discount"]',
    );
    expect(outcome?.dataset.explorationOpeningHandDelta).toBe("-1");
    expect(outcome?.dataset.explorationEnergyCostReduction).toBe("1");
    expect(outcome?.dataset.explorationBattlesRemaining).toBe("1");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents the exact persisted replacement Dream Avatar", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={dreamAvatarRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="dream-avatar"]',
    );
    expect(outcome?.dataset.explorationDreamAvatarId).toBe("dream-avatar-new");
    expect(outcome?.textContent).toContain("New Dream Avatar");
    expect(outcome?.getAttribute("aria-label")).toContain("New Dream Avatar");
    act(() => root.unmount());
  });

  it("presents the persisted future-site modifier as a dedicated semantic outcome", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={siteOfferModifierRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="site-offer-modifier"]',
    );
    expect(outcome?.dataset.explorationSiteOfferModifier).toBe(
      "transfigure-next-draft-or-shop",
    );
    expect(outcome?.dataset.explorationSourceSiteId).toBe("exploration-site");
    expect(outcome?.dataset.explorationSourceActionId).toBe("choice-a");
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(outcome?.textContent?.trim()).not.toBe("");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it.each([
    ["free-next-shop", undefined, undefined, undefined, undefined],
    ["free-purchases", "3", "255", "127", "128"],
  ] as const)(
    "presents the persisted %s shop benefit under reduced motion",
    (modifier, count, essenceBefore, essenceSpent, essenceAfter) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      reducedMotionPreference.value = true;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        new DOMRect(100, 100, 240, 336),
      );
      const onExit = vi.fn();
      const { container, root } = mount(
        <ExplorationSiteScreen
          view={shopModifierRewardView(modifier)}
          onChannel={vi.fn()}
          onResolve={vi.fn()}
          onExit={onExit}
        />,
      );

      const outcome = container.querySelector<HTMLElement>(
        '[data-exploration-outcome="shop-modifier"]',
      );
      expect(outcome?.dataset.explorationShopModifier).toBe(modifier);
      expect(outcome?.dataset.explorationSourceSiteId).toBe("exploration-site");
      expect(outcome?.dataset.explorationSourceActionId).toBe("choice-a");
      expect(outcome?.dataset.explorationFreePurchaseCount).toBe(count);
      expect(outcome?.dataset.explorationEssenceBefore).toBe(essenceBefore);
      expect(outcome?.dataset.explorationEssenceSpent).toBe(essenceSpent);
      expect(outcome?.dataset.explorationEssenceAfter).toBe(essenceAfter);
      expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
      expect(outcome?.textContent?.trim()).not.toBe("");
      expect(onExit).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(onExit).toHaveBeenCalledOnce();
      act(() => root.unmount());
    },
  );

  it.each([
    {
      sourceKind: "make-predicate-fast-and-gain-nightmares" as const,
      expectedSections: ["fast", "nightmares"],
      expectedFastEntries: 2,
      expectedNightmares: 2,
      expectedCopies: 0,
    },
    {
      sourceKind: "purge-one-transfigure-and-copy-others" as const,
      expectedSections: ["purged", "transfigured", "copies"],
      expectedFastEntries: 0,
      expectedNightmares: 0,
      expectedCopies: 3,
    },
  ])(
    "presents the persisted $sourceKind compound review under reduced motion",
    ({
      sourceKind,
      expectedSections,
      expectedFastEntries,
      expectedNightmares,
      expectedCopies,
    }) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      reducedMotionPreference.value = true;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        new DOMRect(100, 100, 240, 336),
      );
      const onExit = vi.fn();
      const { container, root } = mount(
        <ExplorationSiteScreen
          view={compoundCardMutationRewardView(sourceKind)}
          onChannel={vi.fn()}
          onResolve={vi.fn()}
          onExit={onExit}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(0);
      });

      const outcome = container.querySelector<HTMLElement>(
        '[data-exploration-outcome="compound-card-mutation"]',
      );
      expect(outcome?.dataset.explorationCompoundCardMutationSource).toBe(
        sourceKind,
      );
      expect(outcome?.dataset.explorationCompoundSource).toBe(sourceKind);
      expect(outcome?.dataset.explorationCompoundCardMutationPhase).toBe(
        "terminal",
      );
      expect(outcome?.getAttribute("role")).toBe("status");
      expect(outcome?.getAttribute("aria-live")).toBe("polite");
      expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
      expect(
        Array.from(
          outcome?.querySelectorAll<HTMLElement>(
            "[data-exploration-compound-section]",
          ) ?? [],
        ).map((section) => section.dataset.explorationCompoundSection),
      ).toEqual(expectedSections);
      expect(
        outcome?.querySelectorAll(
          '[data-exploration-compound-card-pair="keyword"]',
        ),
      ).toHaveLength(expectedFastEntries);
      expect(
        outcome?.querySelectorAll("[data-exploration-compound-nightmare-card]"),
      ).toHaveLength(expectedNightmares);
      expect(
        outcome?.querySelectorAll(
          '[data-exploration-compound-card-pair="copy"]',
        ),
      ).toHaveLength(expectedCopies);
      expect(
        outcome?.dataset.explorationCopyEntryMappings
          ?.split(",")
          .filter(Boolean),
      ).toHaveLength(expectedCopies);
      const review = outcome?.querySelector<HTMLElement>(
        "[data-exploration-compound-card-mutation-review]",
      );
      review?.focus();
      expect(document.activeElement).toBe(review);
      expect(review?.getAttribute("aria-label")?.trim()).not.toBe("");
      expect(onExit).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(onExit).toHaveBeenCalledOnce();
      act(() => root.unmount());
    },
  );

  it("presents an exact zero-card acquisition under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={emptyCardAcquisitionRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-acquisition"]',
    );
    expect(outcome?.dataset.explorationRewardCount).toBe("0");
    expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(outcome?.textContent?.trim()).not.toBe("");
    act(() => root.unmount());
  });

  it.each([
    { reduceMotion: false, activation: "click" as const },
    { reduceMotion: true, activation: "keyboard" as const },
  ])(
    "renders only prepared site choices and submits the typed choice ($activation)",
    ({ reduceMotion, activation }) => {
      if (!reduceMotion) {
        vi.useFakeTimers();
        window.requestAnimationFrame = (callback) => {
          callback(0);
          return 1;
        };
      }
      reducedMotionPreference.value = reduceMotion;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        new DOMRect(100, 100, 240, 336),
      );
      const base = view();
      const siteTypes = ["Shop", "Purge", "Transfiguration"] as const;
      const choiceView: ExplorationSiteView = {
        ...base,
        narrative: assertLocalized(""),
        actions: [
          {
            ...base.actions[0],
            effectKind: "choose-site-type",
            mechanics: { effectKind: "choose-site-type", offerCount: 3 },
            followup: {
              kind: "site-types",
              title: assertLocalized("Synthetic Site Choice"),
              subtitle: assertLocalized("Choose one synthetic site."),
              choices: siteTypes.map((siteType, index) => ({
                siteType,
                model: {
                  site: {
                    id: `prepared-site-${String(index)}`,
                    type: siteType,
                    isEnhanced: false,
                    isVisited: false,
                  },
                  pos: { x: 50, y: 50 },
                  index,
                  isBattle: false,
                  isLocked: false,
                  isInteractive: true,
                  label: assertLocalized(`Synthetic site ${String(index)}`),
                  lockedGuidance: assertLocalized(""),
                  blurb: assertLocalized(
                    `Synthetic description ${String(index)}`,
                  ),
                  icon: GLYPHS.copy,
                },
              })),
            },
          },
        ],
      };
      const onResolve = vi.fn();
      const onChannel = vi.fn();
      const { container, root } = mount(
        <ExplorationSiteScreen
          view={choiceView}
          onChannel={onChannel}
          onResolve={onResolve}
          onExit={vi.fn()}
        />,
      );

      if (!reduceMotion) {
        const cardTravel = container.querySelector<HTMLElement>(
          "[data-exploration-card-travel]",
        );
        expect(cardTravel).not.toBeNull();
        act(() => {
          cardTravel?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true }),
          );
        });
      }

      const channel = container.querySelector<HTMLButtonElement>(
        '[data-testid="cumulus-exploration-channel"]',
      );
      expect(channel).not.toBeNull();
      expect(channel?.disabled).toBe(false);
      act(() => channel?.click());
      expect(onChannel).toHaveBeenCalledOnce();
      if (!reduceMotion) {
        act(() => {
          container
            .querySelector<HTMLElement>("[data-exploration-frame-break]")
            ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        });
        expect(
          container.querySelector<HTMLElement>("[data-exploration-frame-break]")
            ?.dataset.explorationFrameBreakPhase,
        ).toBe("open");
      }
      const openChooser = (): void => {
        const action = container.querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        );
        expect(action).not.toBeNull();
        expect(action?.disabled).toBe(false);
        act(() => action?.click());
      };
      openChooser();

      const group = container.querySelector<HTMLElement>(
        "[data-exploration-site-type-choices]",
      );
      expect(group?.getAttribute("role")).toBe("group");
      expect(group?.getAttribute("aria-label")?.trim()).not.toBe("");
      const choices = Array.from(
        group?.querySelectorAll<HTMLButtonElement>(
          '[data-site-node-presentation="choice"]',
        ) ?? [],
      );
      expect(choices).toHaveLength(3);
      expect(choices.map((choice) => choice.dataset.siteType)).toEqual(
        siteTypes,
      );
      expect(choices.map((choice) => choice.dataset.siteId)).toEqual([
        "prepared-site-0",
        "prepared-site-1",
        "prepared-site-2",
      ]);
      for (const choice of choices) {
        expect(choice.dataset.interactive).toBe("true");
        expect(choice.getAttribute("aria-disabled")).toBe("false");
        expect(choice.getAttribute("aria-label")?.trim()).not.toBe("");
        expect(choice.classList.contains("floaty")).toBe(!reduceMotion);
        choice.focus();
        expect(document.activeElement).toBe(choice);
      }

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      expect(
        container.querySelector('[data-exploration-followup="site-types"]'),
      ).toBeNull();
      openChooser();
      const selected = container.querySelector<HTMLButtonElement>(
        activation === "click"
          ? '[data-exploration-site-type-choice="Shop"] [data-site-node-presentation="choice"]'
          : '[data-exploration-site-type-choice="Purge"] [data-site-node-presentation="choice"]',
      );
      act(() => {
        if (activation === "click") {
          selected?.click();
        } else {
          selected?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
          );
        }
      });
      expect(onResolve).toHaveBeenCalledOnce();
      expect(onResolve).toHaveBeenCalledWith("choice-a", {
        siteType: activation === "click" ? "Shop" : "Purge",
      });
      act(() => root.unmount());
    },
  );

  it.each([
    { reduceMotion: false, phase: "scale-fade", floats: true },
    { reduceMotion: true, phase: "terminal", floats: false },
  ])(
    "presents the persisted site insertion as a centered noninteractive reward ($phase)",
    ({ reduceMotion, phase, floats }) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      reducedMotionPreference.value = reduceMotion;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        new DOMRect(100, 100, 240, 336),
      );
      const onExit = vi.fn();
      const { container, root } = mount(
        <ExplorationSiteScreen
          view={siteInsertionRewardView()}
          onChannel={vi.fn()}
          onResolve={vi.fn()}
          onExit={onExit}
        />,
      );
      const outcome = container.querySelector<HTMLElement>(
        '[data-exploration-outcome="site-insertion"]',
      );
      const siteNode = outcome?.querySelector<HTMLButtonElement>(
        '[data-site-node-presentation="reward"]',
      );

      expect(outcome?.dataset.explorationSiteInsertionPhase).toBe(phase);
      expect(outcome?.dataset.explorationSiteInsertionSource).toBe(
        "add-fixed-site",
      );
      expect(outcome?.dataset.explorationSiteId).toBe(
        "site-exploration-source-action",
      );
      expect(outcome?.dataset.explorationSiteType).toBe("Duplication");
      expect(outcome?.dataset.explorationTargetNodeId).toBe(
        "current-atlas-node",
      );
      expect(outcome?.dataset.explorationInsertionIndex).toBe("3");
      expect(outcome?.getAttribute("role")).toBe("status");
      expect(outcome?.getAttribute("aria-live")).toBe("polite");
      expect(outcome?.getAttribute("aria-label")?.trim()).not.toBe("");
      expect(siteNode?.dataset.siteId).toBe("site-exploration-source-action");
      expect(siteNode?.dataset.siteType).toBe("Duplication");
      expect(siteNode?.dataset.interactive).toBe("false");
      expect(siteNode?.getAttribute("aria-disabled")).toBe("true");
      expect(siteNode?.classList.contains("floaty")).toBe(floats);
      expect(onExit).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(onExit).toHaveBeenCalledOnce();
      act(() => root.unmount());
    },
  );
});
