import type { PackageTideId } from "../types/content";

export interface StructuralTideMeta {
  displayName: string;
  hoverBlurb: string;
  iconClass: string;
}

export interface DreamcallerTideDisplay {
  appearance: "mandatory" | "optional";
  displayName: string;
  hoverBlurb: string | null;
  iconClass: string | null;
  id: PackageTideId;
  kind: "structural" | "support";
}

export type PackageTideDisplayRole = "structural" | "supporting" | "utility";

export interface PackageTideDisplayMeta {
  displayName: string;
  hoverBlurb: string;
  iconClass: string;
  role: PackageTideDisplayRole;
}

interface SupportTideMeta {
  displayName: string;
  hoverBlurb: string;
}

const MIN_DREAMCALLER_TIDE_DISPLAY_COUNT = 4;

const UTILITY_TIDE_IDS = new Set<PackageTideId>([
  "card_flow",
  "cheap_curve",
  "cheap_removal",
  "defensive_curve",
  "discover_toolbox",
  "fast_interaction",
  "finishers",
  "foresee_selection",
  "hand_disruption",
  "judgment_bodies",
  "materialized_staples",
  "point_pressure",
  "premium_removal",
  "resource_burst",
  "tempo_resets",
  "void_denial",
]);

export const STRUCTURAL_TIDE_META: Readonly<
  Partial<Record<PackageTideId, StructuralTideMeta>>
> = {
  warrior_pressure: {
    displayName: "Iron Charge",
    hoverBlurb:
      "A war drum beat made into doctrine. The first bodies hit hard, then every follow-up turns the field into a sprint the enemy cannot survive.",
    iconClass: "bx-bullseye",
  },
  warrior_bastion: {
    displayName: "Stone Rampart",
    hoverBlurb:
      "The line does not break. Shields lock, trades stay favorable, and every failed assault leaves the other side bloodier than before.",
    iconClass: "bxs-castle",
  },
  spirit_growth: {
    displayName: "Verdant Ascent",
    hoverBlurb:
      "Life gathers momentum in secret roots. Small turns become rich turns, rich turns become overwhelming ones, and the dream keeps flowering upward.",
    iconClass: "bxs-tree-alt",
  },
  materialize_value: {
    displayName: "Echo Arrival",
    hoverBlurb:
      "Arrival is never just arrival. Every entrance leaves behind an extra page of value, until replay itself feels like drawing breath.",
    iconClass: "bx-book",
  },
  materialize_tempo: {
    displayName: "Flicker Rush",
    hoverBlurb:
      "Nothing stays pinned down for long. Allies slip sideways through reality, blockers vanish for a heartbeat, and that heartbeat is enough to win.",
    iconClass: "bx-show",
  },
  ally_formation: {
    displayName: "Banner Formation",
    hoverBlurb:
      "This tide fights like a drilled company. Position matters, timing matters, and a disciplined line turns ordinary allies into a precise machine.",
    iconClass: "bx-diamond",
  },
  ally_wide: {
    displayName: "Rising Host",
    hoverBlurb:
      "A single threat can be answered. A battlefield that keeps filling cannot. The host grows until the whole dream is occupied.",
    iconClass: "bx-sun",
  },
  fast_tempo: {
    displayName: "Quickened Edge",
    hoverBlurb:
      "Victory lives in the half-second before the rival is ready. This tide steals initiative, acts at impossible moments, and never gives it back.",
    iconClass: "bxs-bolt",
  },
  event_chain: {
    displayName: "Arc Cascade",
    hoverBlurb:
      "One event cracks the air open for the next. The turn keeps surging, costs fall away, and the chain ends only when something decisive breaks.",
    iconClass: "bx-meteor",
  },
  prevent_control: {
    displayName: "Sealed Verdict",
    hoverBlurb:
      "The enemy reaches for a plan and finds a closed door. This tide wins by refusal, until denial itself becomes a form of pressure.",
    iconClass: "bx-shield-x",
  },
  discard_velocity: {
    displayName: "Cinder Sprint",
    hoverBlurb:
      "The hand burns hot and fast. What gets thrown away becomes fuel, and the deck races forward on sparks from its own losses.",
    iconClass: "bxs-flame",
  },
  void_recursion: {
    displayName: "Haunting Return",
    hoverBlurb:
      "Nothing properly leaves. The void keeps its own ledger, and what was spent comes stalking back when the moment is right.",
    iconClass: "bxs-ghost",
  },
  void_threshold: {
    displayName: "Moonlit Threshold",
    hoverBlurb:
      "Power waits below the surface count. Once the void is deep enough, the tide crosses a line and every payoff comes back colder and larger.",
    iconClass: "bxs-moon",
  },
  abandon_value: {
    displayName: "Grave Bargain",
    hoverBlurb:
      "Every sacrifice is a transaction. Bodies are spent for cards, energy, and leverage until loss itself starts looking profitable.",
    iconClass: "bxs-skull",
  },
  abandon_ladder: {
    displayName: "Funeral Ladder",
    hoverBlurb:
      "Smaller pieces are not mourned, they are climbed. Each offered body becomes the rung that lifts the next threat into the world.",
    iconClass: "bx-pyramid",
  },
  figment_swarm: {
    displayName: "Dream Shards",
    hoverBlurb:
      "Fragments breed fragments. The board fills with glittering unreal bodies until the dream stops feeling imagined and starts feeling inevitable.",
    iconClass: "bxs-star-half",
  },
  survivor_dissolve: {
    displayName: "Enduring Wake",
    hoverBlurb:
      "Death is only another phase of the march. Survivors fall, leave something useful behind, and return often enough to make attrition futile.",
    iconClass: "bxs-yin-yang",
  },
  judgment_engines: {
    displayName: "Turning Hourglass",
    hoverBlurb:
      "This tide wins by tampering with the hour of reckoning. Challenge arrives heavier, repeats itself, and turns the scoring phase into a weapon.",
    iconClass: "bx-hourglass",
  },
  character_chain: {
    displayName: "Living Procession",
    hoverBlurb:
      "Each body invites the next. The turn becomes a procession of arrivals, rebates, and chained deployments that never quite stop on schedule.",
    iconClass: "bx-cloud-lightning",
  },
  spark_tall: {
    displayName: "Kindled Crown",
    hoverBlurb:
      "All strength is gathered into a chosen few. One threat grows radiant enough to rule the board while lesser bodies exist only to feed it.",
    iconClass: "bx-crown",
  },
} as const;

const SUPPORT_TIDE_META: Readonly<Partial<Record<PackageTideId, SupportTideMeta>>> = {
  abandon_fodder:
    {
      displayName: "Ashen Offerings",
      hoverBlurb:
        "Cheap bodies and disposable pieces that make sacrifice effects profitable instead of painful.",
    },
  attrition_trade:
    {
      displayName: "Grinding Exchange",
      hoverBlurb:
        "Cards that turn routine exchanges into small material wins until the other side runs out first.",
    },
  big_energy:
    {
      displayName: "Stormwell Surge",
      hoverBlurb:
        "Heavy energy generation that helps the deck jump straight to expensive, swingy turns.",
    },
  bounce_blink_tools:
    {
      displayName: "Shimmer Recall",
      hoverBlurb:
        "Utility cards that return or reset permanents so arrival triggers and repositioning stay live.",
    },
  card_flow:
    {
      displayName: "Open Current",
      hoverBlurb:
        "Steady draw and filtering that keeps the hand moving and reduces dead turns.",
    },
  character_curve:
    {
      displayName: "Steady March",
      hoverBlurb:
        "Reliable early and mid-cost characters that make the deck's battlefield progression smoother.",
    },
  character_tutors:
    {
      displayName: "Summoner's Index",
      hoverBlurb:
        "Search tools that find the right character for the current board instead of relying on raw draw.",
    },
  cheap_curve:
    {
      displayName: "First-Light Muster",
      hoverBlurb:
        "Low-cost plays that let the deck start affecting the board before slower engines come online.",
    },
  cheap_removal:
    {
      displayName: "Clean Cut",
      hoverBlurb:
        "Efficient answers that clear small threats without forcing the deck to spend an entire turn.",
    },
  copy_effects:
    {
      displayName: "Echo Script",
      hoverBlurb:
        "Effects that duplicate a useful event, trigger, or permanent to increase the deck's best outputs.",
    },
  cost_reduction:
    {
      displayName: "Lightened Burden",
      hoverBlurb:
        "Discount effects that compress turns and let multiple meaningful plays happen ahead of schedule.",
    },
  defensive_curve:
    {
      displayName: "Shielded Opening",
      hoverBlurb:
        "Early blockers and stabilizers that buy time for slower synergies to take over.",
    },
  discard_outlets:
    {
      displayName: "Cinder Outlet",
      hoverBlurb:
        "Reliable ways to pitch cards so graveyard and discard payoffs can turn on when needed.",
    },
  discover_toolbox:
    {
      displayName: "Lantern Search",
      hoverBlurb:
        "Flexible selection effects that trade raw consistency for access to situational answers.",
    },
  event_setup:
    {
      displayName: "Ritual Staging",
      hoverBlurb:
        "Support cards that make event-heavy turns easier to assemble and more rewarding to fire off.",
    },
  fast_interaction:
    {
      displayName: "Snap Reply",
      hoverBlurb:
        "Instant-speed answers and tricks that help the deck fight on the opponent's timing.",
    },
  fast_setup:
    {
      displayName: "Quick Lattice",
      hoverBlurb:
        "Quick enablers that establish key synergies early instead of waiting for a slow buildup.",
    },
  finishers:
    {
      displayName: "Closing Bell",
      hoverBlurb:
        "Closing threats that convert an established advantage into an actual end to the game.",
    },
  foresee_selection:
    {
      displayName: "Veil Sifting",
      hoverBlurb:
        "Deck smoothing tools that line up future draws and keep the next few turns clean.",
    },
  go_wide_enablers:
    {
      displayName: "Crowded Horizon",
      hoverBlurb:
        "Cards that help the deck produce or reward a broad battlefield instead of a single focal threat.",
    },
  hand_cycling:
    {
      displayName: "Turning Palm",
      hoverBlurb:
        "Cheap redraw and replacement effects that turn spare cards into a steadier stream of action.",
    },
  hand_disruption:
    {
      displayName: "Mind Static",
      hoverBlurb:
        "Pressure pieces that interfere with the opponent's hand and make planning harder to execute.",
    },
  judgment_bodies:
    {
      displayName: "Weighted Witnesses",
      hoverBlurb:
        "Characters that contribute meaningfully once challenge matters and help carry that phase.",
    },
  judgment_repeaters:
    {
      displayName: "Second Verdict",
      hoverBlurb:
        "Effects that make challenge triggers happen again or hit harder than usual.",
    },
  leave_play_enablers:
    {
      displayName: "Parting Triggers",
      hoverBlurb:
        "Sacrifice, bounce, and death-adjacent tools that make exit triggers easier to exploit.",
    },
  materialized_staples:
    {
      displayName: "Threshold Arrivals",
      hoverBlurb:
        "Reliable materialize payoffs and enablers that keep arrival-based decks consistent.",
    },
  point_pressure:
    {
      displayName: "Relentless Tally",
      hoverBlurb:
        "Steady sources of score or spark pressure that force the opponent to answer quickly.",
    },
  premium_removal:
    {
      displayName: "Royal Severance",
      hoverBlurb:
        "High-quality answers reserved for the threats that ordinary interaction does not cleanly solve.",
    },
  reclaim_characters:
    {
      displayName: "Soul Recall",
      hoverBlurb:
        "Recursion tools focused on bringing creatures back when the board needs to refill.",
    },
  reclaim_events:
    {
      displayName: "Event Recall",
      hoverBlurb:
        "Event recursion that lets the deck reuse its strongest events instead of exhausting them once.",
    },
  recursion_fuel:
    {
      displayName: "Buried Embers",
      hoverBlurb:
        "Self-stock and disposable resources that make later recursion cards much more effective.",
    },
  resource_burst:
    {
      displayName: "Sudden Windfall",
      hoverBlurb:
        "Temporary acceleration that creates one oversized turn even if the deck cannot sustain it forever.",
    },
  spark_growth:
    {
      displayName: "Kindling Spiral",
      hoverBlurb:
        "Support pieces that steadily increase spark output or make spark scaling easier to maintain.",
    },
  tax_pressure:
    {
      displayName: "Levy of Sleep",
      hoverBlurb:
        "Cards that make the opponent's plays clunkier, slower, or more expensive over time.",
    },
  tempo_resets:
    {
      displayName: "Backstep Tide",
      hoverBlurb:
        "Bounce and reset effects that erase enemy setup and reopen the race on your terms.",
    },
  topdeck_setup:
    {
      displayName: "Crown the Draw",
      hoverBlurb:
        "Tools that prepare the top of the deck so future draws and reveals land where they should.",
    },
  trigger_reuse:
    {
      displayName: "Echo Harness",
      hoverBlurb:
        "Cards that replay, copy, or refresh important triggers so core synergies keep firing.",
    },
  void_denial:
    {
      displayName: "Grave Silence",
      hoverBlurb:
        "Interaction aimed at shrinking, disrupting, or invalidating graveyard-style plans.",
    },
  void_setup:
    {
      displayName: "Grave Preparation",
      hoverBlurb:
        "Self-mill and discard support that makes void payoffs turn on earlier and more reliably.",
    },
} as const;

export function structuralTidesForPackageTides(
  packageTides: readonly PackageTideId[],
): Array<StructuralTideMeta & { id: PackageTideId }> {
  return packageTides.flatMap((packageTideId) => {
    const structuralTide = STRUCTURAL_TIDE_META[packageTideId];
    return structuralTide === undefined
      ? []
      : [{ id: packageTideId, ...structuralTide }];
  });
}

export function packageTideDisplayMeta(
  packageTideId: PackageTideId,
): PackageTideDisplayMeta {
  const structuralTide = STRUCTURAL_TIDE_META[packageTideId];
  if (structuralTide !== undefined) {
    return {
      ...structuralTide,
      role: "structural",
    };
  }

  const supportTide = SUPPORT_TIDE_META[packageTideId];
  const displayName = supportTide?.displayName ?? packageTideDisplayName(packageTideId);
  const role = UTILITY_TIDE_IDS.has(packageTideId) ? "utility" : "supporting";

  return {
    displayName,
    hoverBlurb:
      supportTide?.hoverBlurb ??
      `${role === "utility" ? "Utility" : "Support"} cards that reinforce ${displayName.toLowerCase()}.`,
    iconClass: "bxs-circle",
    role,
  };
}

export function dreamcallerTidesForDisplay(
  mandatoryTides: readonly PackageTideId[],
  optionalTides: readonly PackageTideId[],
): DreamcallerTideDisplay[] {
  const mandatoryTideIds = new Set(mandatoryTides);
  const mandatoryStructuralTides = structuralTidesForPackageTides(
    mandatoryTides,
  ).map((tide) => ({
    ...tide,
    appearance: "mandatory" as const,
    kind: "structural" as const,
  }));
  const optionalStructuralTides = structuralTidesForPackageTides(optionalTides)
    .filter((tide) => !mandatoryTideIds.has(tide.id))
    .map((tide) => ({
      ...tide,
      appearance: "optional" as const,
      kind: "structural" as const,
    }));
  const displayedIds = new Set([
    ...mandatoryStructuralTides.map((tide) => tide.id),
    ...optionalStructuralTides.map((tide) => tide.id),
  ]);
  const supportFillCount = Math.max(
    0,
    MIN_DREAMCALLER_TIDE_DISPLAY_COUNT -
      (mandatoryStructuralTides.length + optionalStructuralTides.length),
  );

  const optionalSupportTides = supportTidesForDisplay(
    optionalTides,
    "optional",
    new Set([...displayedIds, ...mandatoryTides]),
  ).slice(0, supportFillCount);
  const mandatorySupportTides = supportTidesForDisplay(
    mandatoryTides,
    "mandatory",
    displayedIds,
  ).slice(0, Math.max(0, supportFillCount - optionalSupportTides.length));

  return [
    ...mandatoryStructuralTides,
    ...mandatorySupportTides,
    ...optionalStructuralTides,
    ...optionalSupportTides,
  ];
}

function packageTideDisplayName(packageTideId: PackageTideId): string {
  return packageTideId
    .split(/[_-]+/u)
    .filter((segment) => segment.length > 0)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join(" ");
}

function supportTidesForDisplay(
  packageTides: readonly PackageTideId[],
  appearance: DreamcallerTideDisplay["appearance"],
  excludedIds: ReadonlySet<PackageTideId>,
): DreamcallerTideDisplay[] {
  const displayedIds = new Set(excludedIds);

  return packageTides.flatMap((packageTideId) => {
    if (
      displayedIds.has(packageTideId) ||
      STRUCTURAL_TIDE_META[packageTideId] !== undefined
    ) {
      return [];
    }

    displayedIds.add(packageTideId);
    const meta = packageTideDisplayMeta(packageTideId);
    return [
      {
        appearance,
        displayName: meta.displayName,
        hoverBlurb: meta.hoverBlurb,
        iconClass: "bxs-circle",
        id: packageTideId,
        kind: "support",
      },
    ];
  });
}
