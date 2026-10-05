// Augury encounter rules and offer abilities.

export const AUGURY = {
  selection: {
    subtypeMinPoolCards: 12,
    costBands: {
      cheapMaximum: 1,
      midMinimum: 2,
      midMaximum: 3,
      bigMinimum: 4,
      cheapCharacterMaximum: 2,
    },
  },
  encounter: {
    // Allows the player to leave without accepting either offer.
    allowDecline: true,
  },
  archetypes: [
    {
      // Effect of this reward offer. A `selectionPolicy` ranks eligible
      // targets for the ability.
      id: "fit_card_grant",
      // Internal label used by debugging and authoring tools.
      name: "Grant: Fit card (gift)",
      // Player-facing offer copy. Placeholders resolve from the surfaced reward.
      presentation: {
        headline: {
          kind: "text",
          text: "Gain a Card",
        },
        subtitle: {
          kind: "text",
          text: "Gain {card_name}",
        },
      },
      enabled: true,
      family: "grant",
      // Relative selection weight among eligible definitions.
      weight: 10,
      selectionPolicyId: "card-fit",
      quantities: {
        grantedCopies: 1,
      },
    },
    {
      id: "fit_card_draft",
      name: "Grant: Fit card draft",
      presentation: {
        headline: {
          kind: "text",
          text: "Choose a Card",
        },
        subtitle: {
          kind: "text",
          text: "Choose a card to add to your deck.",
        },
      },
      enabled: true,
      family: "grant",
      weight: 10,
      selectionPolicyId: "card-fit",
      quantities: {
        chooserSize: 4,
        grantedCopies: 1,
      },
    },
    {
      id: "copies_draft",
      name: "Grant: Copies draft",
      presentation: {
        headline: {
          kind: "text",
          text: "Choose a Card",
        },
        subtitle: {
          kind: "count",
          one: "Choose a card and add {count} copy of it to your deck.",
          other: "Choose a card and add {count} copies of it to your deck.",
        },
      },
      enabled: true,
      family: "grant",
      weight: 6,
      selectionPolicyId: "card-fit-quality",
      quantities: {
        chooserSize: 4,
        grantedCopies: 2,
      },
    },
    {
      id: "strong_card",
      name: "Grant: Strong card",
      presentation: {
        headline: {
          kind: "text",
          text: "Gain a Card",
        },
        subtitle: {
          kind: "text",
          text: "Gain {card_name}",
        },
      },
      enabled: true,
      family: "grant",
      weight: 8,
      selectionPolicyId: "card-fit-quality",
      quantities: {
        grantedCopies: 1,
      },
    },
    {
      id: "category_draft_known",
      name: "Grant: Category draft",
      presentation: {
        headline: {
          kind: "text",
          text: "Choose a Card",
        },
        subtitle: {
          kind: "category",
          character: "Choose a Character card to add to your deck.",
          event: "Choose an Event Card to add to your deck.",
          cheap: "Choose a cheap card to add to your deck.",
          midCost: "Choose a mid-cost card to add to your deck.",
          expensive: "Choose an expensive card to add to your deck.",
          fast: "Choose a fast card to add to your deck.",
          subtype: "Choose one {subtype_name} card to add to your deck.",
          package:
            "Choose one card from the {package_reference} to add to your deck.",
        },
      },
      enabled: true,
      family: "grant",
      weight: 10,
      selectionPolicyId: "card-fit",
      quantities: {
        chooserSize: 4,
        grantedCopies: 1,
      },
    },
    {
      id: "card_bundle",
      name: "Grant: Card bundle",
      presentation: {
        headline: {
          kind: "count",
          one: "Gain {count} Card",
          other: "Gain {count} Cards",
        },
        subtitle: {
          kind: "count",
          one: "Add {count} Card to your deck.",
          other: "Add {count} Cards to your deck.",
        },
      },
      enabled: true,
      family: "grant",
      weight: 8,
      selectionPolicyId: "card-bundle",
      quantities: {
        bundleSize: 3,
        minimumBundleSize: 2,
      },
    },
    {
      id: "transfigured_draft",
      name: "Grant: Transfigured draft",
      presentation: {
        headline: {
          kind: "text",
          text: "Choose a Transfigured Card",
        },
        subtitle: {
          kind: "text",
          text: "Choose a transfigured card to add to your deck.",
        },
      },
      enabled: true,
      family: "grant",
      weight: 6,
      selectionPolicyId: "card-fit",
      quantities: {
        chooserSize: 4,
        grantedCopies: 1,
      },
    },
    {
      id: "transfigure",
      name: "Improve: Transfigure",
      presentation: {
        headline: {
          kind: "text",
          text: "Transfigure a Card",
        },
        subtitle: {
          kind: "text",
          text: "Transfigure {card_name}",
        },
      },
      enabled: true,
      family: "improve",
      weight: 10,
      selectionPolicyId: "transfiguration-value",
      quantities: {},
    },
    {
      id: "starter_transfigure",
      name: "Improve: Starter transfigure",
      presentation: {
        headline: {
          kind: "text",
          text: "Transfigure Your Starters",
        },
        subtitle: {
          kind: "count",
          one: "Transfigure {card_name}",
          other: "Transfigure {first_card_name} and {second_card_name}",
        },
      },
      enabled: true,
      family: "improve",
      weight: 6,
      selectionPolicyId: "transfiguration-value",
      quantities: {
        maximumTargets: 2,
      },
    },
    {
      id: "purge",
      name: "Remove: Purge",
      presentation: {
        headline: {
          kind: "text",
          text: "Purge a Card",
        },
        subtitle: {
          kind: "text",
          text: "Purge {card_name}",
        },
      },
      enabled: true,
      family: "remove",
      weight: 8,
      selectionPolicyId: "purge-misfit",
      quantities: {},
    },
    {
      id: "duplicate",
      name: "Duplicate: Duplicate card",
      presentation: {
        headline: {
          kind: "count",
          one: "Duplicate a Card",
          other: "Choose a Card",
        },
        subtitle: {
          kind: "count",
          one: "Duplicate {card_name}",
          other: "Choose one of {count} cards in your deck to duplicate.",
        },
      },
      enabled: true,
      family: "duplicate",
      weight: 8,
      selectionPolicyId: "duplicate-value",
      quantities: {
        chooserSize: 3,
        grantedCopies: 1,
      },
    },
    {
      id: "dreamsign",
      name: "Dreamsign: Grant dreamsign",
      presentation: {
        headline: {
          kind: "text",
          text: "Gain a Dreamsign",
        },
        subtitle: {
          kind: "text",
          text: "Gain {dreamsign_name}",
        },
        backgroundArt: {
          source: "card",
          imageNumber: 386654065,
        },
      },
      enabled: true,
      family: "dreamsign",
      weight: 8,
      selectionPolicyId: "dreamsign-match",
      quantities: {},
    },
    {
      id: "add_site",
      name: "Site: Add a site",
      presentation: {
        headline: {
          kind: "text",
          text: "Add a Site",
        },
        subtitle: {
          kind: "text",
          text: "Add the {site_name} site.",
        },
        backgroundArt: {
          source: "card",
          imageNumber: 334049261,
        },
      },
      enabled: true,
      family: "site",
      weight: 6,
      selectionPolicyId: "site-uniform",
      quantities: {},
    },
  ],
};
