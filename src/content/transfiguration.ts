// Configuration for the transfiguration mechanic which upgrades cards

export const TRANSFIGURATION = {
  site: {
    // `All` shows every eligible deck card at an enhanced site. `Count(n)` can
    // cap the enhanced offer without changing the ordinary-site limit.
    enhancedChoiceLimit: null,
    // Maximum number of eligible deck cards shown at an ordinary site.
    standardChoiceLimit: 3,
    // Prices are rolled deterministically for a particular journey, site, deck
    // entry, and form, so the displayed quote is also the charged price.
    pricing: {
      // Clamp every rolled price to this inclusive range, in Essence.
      minimumCost: 0,
      maximumCost: 100,
      // Fixed-band jitter selects a uniformly random multiple of this step from
      // `base - jitter` through `base + jitter`, then applies the band's floor
      // and the global clamp above.
      step: 10,
      // Empowered and Kindled use the size of their stat change to choose one
      // of these bands. Empowered's delta is the amount of ● removed; Kindled's
      // delta is the original ✦. Kindling a zero-✦ card raises it to 1✦ and
      // costs no Essence. The ranges must be contiguous, and the final band
      // must have no maximum.
      statDeltaBands: [
        {
          minimumDelta: 1,
          maximumDelta: 1,
          band: {
            base: 10,
            jitter: 20,
            floor: 10,
          },
        },
        {
          minimumDelta: 2,
          maximumDelta: 2,
          band: {
            base: 30,
            jitter: 20,
            floor: 10,
          },
        },
        {
          minimumDelta: 3,
          maximumDelta: 3,
          band: {
            base: 50,
            jitter: 20,
            floor: 30,
          },
        },
        {
          minimumDelta: 4,
          band: {
            base: 70,
            jitter: 20,
            floor: 50,
          },
        },
      ],
    },
  },
  // Form order controls ordinary-site option order and the order in which
  // Perfected applies its eligible forms.
  forms: [
    // Empowered is eligible for cards with a positive ● cost. It halves that
    // cost, rounds down, and never produces a negative value.
    {
      id: "Empowered",
      // Each `glossaryUuid` links the form to its canonical Glossary entry.
      glossaryUuid: "a66c513e-500b-4891-8c09-9641ae300ba4",
      name: "Empowered",
      description: "Halve its ● cost, rounded down",
      // `glyph` selects the Cumulus icon rendered on form controls and
      // transformed cards; any supported Transfiguration glyph may be assigned
      // to any form.
      glyph: "transfigurationEmpowered",
      // `accentColor` styles the control and badge; `tintColor` highlights
      // the exact card text or stat changed by the form.
      accentColor: "#10b981",
      tintColor: "#6ee7b7",
      // `pricing` controls Transfiguration-site Essence quotes. `StatDelta`
      // uses the site table above, `Band` supplies a form-specific band, and
      // `Free` always costs zero.
      pricing: {
        kind: "statDelta",
      },
      // `rewardScore` ranks concrete card/form pairs when Augury, Exploration,
      // or another generated reward asks for a valuable Transfiguration.
      // `StatDelta` scores the actual stat improvement divided by `divisor` and
      // clamps it to [0, 1]; `Flat` assigns the same score to every eligible
      // card. Perfected is omitted from generated rewards and is available only
      // when authored explicitly.
      rewardScore: {
        kind: "statDelta",
        divisor: 2,
      },
    },
    // Amplified is eligible when the card has authored amplified rules text
    // that differs from its ordinary rules. It uses that authored replacement.
    {
      id: "Amplified",
      glossaryUuid: "a2c070ca-eacd-4cca-b69d-3d48f0787a16",
      name: "Amplified",
      description: "Replace its ability with its authored stronger form",
      glyph: "transfigurationAmplified",
      accentColor: "#f59e0b",
      tintColor: "#fcd34d",
      pricing: {
        kind: "band",
        base: 10,
        jitter: 20,
        floor: 10,
      },
      rewardScore: {
        kind: "flat",
        value: 0.4,
      },
    },
    // Kindled is eligible for Characters. It doubles base ✦, treating zero as
    // a special case that becomes 1✦.
    {
      id: "Kindled",
      glossaryUuid: "f40df441-0e44-4122-b4d4-cdc4085a9ffb",
      name: "Kindled",
      description: "Double its ✦, or set it to 1 if it is 0",
      glyph: "transfigurationKindled",
      accentColor: "#ef4444",
      tintColor: "#fca5a5",
      pricing: {
        kind: "statDelta",
      },
      rewardScore: {
        kind: "statDelta",
        divisor: 4,
      },
    },
    // Inspired is eligible for Events and appends “Draw a card.”
    {
      id: "Inspired",
      glossaryUuid: "f0ff63b4-424b-4ae9-81d5-a4f6546afa3f",
      name: "Inspired",
      description: 'Add "Draw a card" to its rules text',
      glyph: "transfigurationInspired",
      accentColor: "#3b82f6",
      tintColor: "#93c5fd",
      pricing: {
        kind: "band",
        base: 20,
        jitter: 20,
        floor: 10,
      },
      rewardScore: {
        kind: "flat",
        value: 0.55,
      },
    },
    // Enduring is eligible for Events and appends “Reclaim.”
    {
      id: "Enduring",
      glossaryUuid: "eb4cfc5f-237a-47cd-9215-7cce3f15583f",
      name: "Enduring",
      description: 'Add "Reclaim" to its rules text',
      glyph: "transfigurationEnduring",
      accentColor: "#6366f1",
      tintColor: "#a5b4fc",
      pricing: {
        kind: "band",
        base: 50,
        jitter: 30,
        floor: 20,
      },
      rewardScore: {
        kind: "flat",
        value: 0.55,
      },
    },
    // Hastened is eligible for Events that are not Fast and makes them Fast.
    {
      id: "Hastened",
      glossaryUuid: "19f6c2c9-dd6b-4d65-9f95-f6a3486772cc",
      name: "Hastened",
      description: "Make it Fast",
      glyph: "transfigurationHastened",
      accentColor: "#06b6d4",
      tintColor: "#67e8f9",
      pricing: {
        kind: "free",
      },
      rewardScore: {
        kind: "flat",
        value: 0.5,
      },
    },
    // Resonant is eligible when the rules contain a supported named trigger.
    // It widens “once per turn”, Dawn, or Materialized using the rules engine's
    // corresponding rewrite.
    {
      id: "Resonant",
      glossaryUuid: "c3fa83af-ee3b-47cd-8112-5e5cc38821de",
      name: "Resonant",
      description: "Widen a named trigger to fire more often",
      glyph: "transfigurationResonant",
      accentColor: "#d946ef",
      tintColor: "#f0abfc",
      pricing: {
        kind: "band",
        base: 50,
        jitter: 30,
        floor: 20,
      },
      rewardScore: {
        kind: "flat",
        value: 0.5,
      },
    },
    // Attuned is eligible when a card has a positive activated-ability ● cost.
    // It reduces the first supported activated cost by 1, to a minimum of zero.
    {
      id: "Attuned",
      glossaryUuid: "980d283a-9558-4b66-84a0-fcb91fdf4ceb",
      name: "Attuned",
      description: "Reduce an activated ability's cost by 1●",
      glyph: "transfigurationAttuned",
      accentColor: "#f43f5e",
      tintColor: "#fda4af",
      pricing: {
        kind: "band",
        base: 10,
        jitter: 20,
        floor: 10,
      },
      rewardScore: {
        kind: "flat",
        value: 0.5,
      },
    },
    // Perfected is eligible when at least two other configured forms are
    // eligible. It applies those forms in this catalog's order.
    {
      id: "Perfected",
      glossaryUuid: "22adf539-d2c9-4f33-9416-159d03a220ad",
      name: "Perfected",
      description: "Apply every available transfiguration",
      glyph: "transfigurationPerfected",
      accentColor: "#a855f7",
      tintColor: "#d8b4fe",
      pricing: {
        kind: "band",
        base: 100,
        jitter: 0,
        floor: 100,
      },
      rewardScore: {
        kind: "flat",
        value: 0.65,
      },
    },
  ],
};
