// Controls the seven-layer Dream Atlas: its topology, site composition,
// dreamscape selection, boss presentation, and authored asset references.

export const ATLAS = {
  // Default node-count ranges for special layer kinds. Individual standard
  // layers author their node counts inline below.
  // Layers are listed in travel order. `position` is the stable layer identity,
  // while `rules` chooses how that layer is generated. All `min`/`max` ranges
  // below are inclusive.
  layers: [
    // The starter rule always creates one node. Its sites come from the starter
    // dreamscape's fixed site list, so it needs no counts or fill profile here.
    {
      name: "one",
      role: "starter",
      nodeCount: {
        min: 1,
        max: 1,
      },
      siteCount: null,
      fillProfile: null,
      mandatorySites: {},
    },
    {
      name: "two",
      role: "standard",
      // Number of alternative dreamscape nodes generated in this layer.
      nodeCount: {
        min: 2,
        max: 2,
      },
      // Target total sites on each node. This includes the dreamscape's
      // enhanced signature site and the Battle that is always appended last.
      siteCount: {
        min: 3,
        max: 6,
      },
      // Names the weighted pool used to fill any slots left after structural
      // and mandatory sites have been placed.
      fillProfile: "early",
      // Per-node required sites. Draft may repeat; another type is skipped if
      // it duplicates the node's signature site. An omitted map means none.
      mandatorySites: {
        Draft: 2,
        Purge: 1,
        Augury: 1,
      },
    },
    {
      name: "three",
      role: "standard",
      nodeCount: {
        min: 3,
        max: 3,
      },
      siteCount: {
        min: 3,
        max: 6,
      },
      fillProfile: "early",
      mandatorySites: {
        Draft: 1,
        Purge: 1,
      },
    },
    {
      name: "four",
      role: "standard",
      nodeCount: {
        min: 3,
        max: 4,
      },
      siteCount: {
        min: 3,
        max: 6,
      },
      fillProfile: "early",
      mandatorySites: {
        Draft: 1,
      },
    },
    {
      name: "five",
      role: "standard",
      nodeCount: {
        min: 3,
        max: 5,
      },
      siteCount: {
        min: 3,
        max: 6,
      },
      fillProfile: "late",
      mandatorySites: {},
    },
    {
      name: "six",
      role: "standard",
      nodeCount: {
        min: 3,
        max: 5,
      },
      siteCount: {
        min: 3,
        max: 6,
      },
      fillProfile: "late",
      mandatorySites: {},
    },
    // The boss rule always creates one special Limbo node. It has no normal
    // dreamscape signature site, but its utility sites use the named profile
    // and still end with Battle.
    {
      name: "seven",
      role: "boss",
      nodeCount: {
        min: 1,
        max: 1,
      },
      siteCount: {
        min: 3,
        max: 6,
      },
      fillProfile: "late",
      mandatorySites: {},
    },
  ],
  graph: {
    // Soft target for outgoing edges per node across each pair of adjacent
    // layers. The generator first guarantees every node has an edge, then adds
    // non-crossing edges toward round(source-node-count * this value).
    connectionAverage: 2,
    // After a node is completed, reveal (but keep locked) the layer this many
    // positions ahead. Its immediate successors become available separately.
    revealLookaheadLayers: 2,
    // At Atlas creation, reveal this many extra nodes without unlocking them.
    // `count` is sampled from a triangular distribution favoring `mode`, then
    // distinct nodes are chosen from `eligibleLayers`.
    bonusReveal: {
      min: 0,
      max: 2,
      mode: 1,
      eligibleLayers: ["five", "six"],
    },
  },
  dreamscapeSelection: {
    // Initial weighted-draw weight for every non-starter dreamscape.
    baseWeight: 1,
    // After a dreamscape is selected, divide its future weight by this value.
    // For example, 2.0 halves its chance relative to an unused dreamscape.
    repeatDiscourageStrength: 2,
    // Exclude a candidate when an already-assigned node connected to this node
    // has the same dreamscape.
    excludeConnectedRepeats: true,
    // Exclude a candidate already assigned to another choice in this layer.
    excludeSameLayerRepeats: true,
    exhaustionFallback: "allow-repeats",
  },
  siteComposition: {
    uniqueNonDraftSites: true,
    // A node carrying a known dreamsign gets this site type; visiting that site
    // grants the pre-revealed dreamsign. It occupies one of the node's slots.
    knownDreamsignSite: "Reward",
    mandatoryCapacityBehavior: "omit-fill",
  },
  // Fill profiles provide relative weights, not percentages. A layer names one
  // profile above; its node samples from that profile without replacement until
  // the rolled site count is reached.
  fillProfiles: {
    early: {
      id: "early",
      // Default weight for the signature site types belonging to other guides.
      // The resident guide's own signature site is already added as enhanced
      // and is therefore excluded from this pool.
      signatureSiteWeight: 3,
      // Explicit entries add generic site types to the pool and override the
      // default above when an entry is also another guide's signature type.
      siteWeights: {
        Essence: 3,
        Transfiguration: 1,
        Duplication: 1,
      },
    },
    late: {
      id: "late",
      signatureSiteWeight: 3,
      siteWeights: {
        Essence: 3,
        Transfiguration: 5,
        Duplication: 5,
      },
    },
  },
  knownDreamsign: {
    // Maximum distinct dreamsigns and carrier nodes created in one Atlas,
    // additionally limited by the available dreamsign pool and eligible nodes.
    maxPerAtlas: 2,
    // Layers whose nodes may carry a known dreamsign.
    eligibleLayers: ["three", "four", "five", "six"],
    // Chance to place each successive carrier. Rolls continue up to the cap but
    // stop at the first failure; with a cap of 2 and 0.5, the counts 0/1/2 have
    // probabilities 0.5/0.25/0.25 when enough candidates and signs exist.
    placementProbability: 0.5,
    // Strength of two carrier-selection boosts: lower-numbered layers receive
    // more weight, and nodes revealed at Atlas creation receive another boost.
    // Zero makes eligible carrier nodes equally likely.
    earlyRevealBias: 1,
  },
  boss: {
    // Stable UUID persisted on the special Layer Seven node. It identifies
    // Limbo without resolving a normal dreamscape definition.
    dreamscapeId: "ccda6e48-23fa-4222-9d3c-23b93ce06077",
    // Place label stored on and displayed for the boss node.
    place: "Limbo",
    // Base character name used when no per-run Apollyon incarnation supplies a
    // more specific title.
    name: "Apollyon",
    // Card title and body used only when the run has no resolvable incarnation.
    fallbackTitle: "Apollyon, the Doom of Humanity",
    fallbackIntroduction:
      "An avatar of annihilating power — his own deck, dreamsigns, and abilities bend the dream toward ruin.",
    // Filename stem of the full-bleed Limbo background on the boss reveal card
    // (`dreamscapes/<key>.png`).
    sceneArtKey: "limbo",
    // Filename stem of the circular image drawn on the Layer Seven Atlas node
    // (`dreamscape-icons/<key>.png`).
    iconArtKey: "limbo",
    // Apollyon character figure composited over the Limbo scene.
    figureArtId: "apollyon",
  },
  // Shared Atlas chrome that the asset build publishes for the renderer.
  assets: {
    unrevealedFrameSource: "Round_frame_main.png",
    unrevealedFrameKey: "Round_frame_main.png",
    bossSceneSource: "limbo.png",
    bossIconSource: "limbo_icon.png",
    bossFigureSource: "apollyon.png",
  },
};
