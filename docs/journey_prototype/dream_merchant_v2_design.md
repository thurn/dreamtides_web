# The Reckoner — v2 Dream Encounter System

Technical design for the system that replaces dream journeys with a single
recurring character, "the Reckoner," who reads the player's deck with
fine-grained, card-specific understanding, names what he sees, and offers
genuinely useful gifts at a real price.

Status: design. Working character name "the Reckoner" (placeholder, rename at
will). Module names below use `src/merchant/` and `src/effects/`.

---

## 1. Goals and decisions

The Reckoner is one named, recurring figure who appears at his own encounter
sites across a journey. Each encounter is built from a structured *read* of the
current deck and journey state, voiced in procedurally generated dialogue, and
expressed as offers that show the actual game objects involved.

The design rests on four product decisions:

1. **Dialogue is a pure procedural grammar.** No LLM and no backend. Dialogue
   is a deterministic, seeded function of the deck-read and merchant memory.
   The grammar reads as intelligent because its slots are filled with *true,
   specific facts about this deck* (the actual weak card, the actual starving
   theme), reinforced by memory callbacks and a deep authored voice bank.
2. **Honest broker, real price.** Every reward is genuinely on-plan: it answers
   a need the Reckoner has identified. He never offers traps. His self-interest
   lives entirely in the cost — he always extracts a meaningful sacrifice, and
   he tends to price slightly in his own favor.
3. **He names his read in dialogue.** The deck-read emits legible observations
   ("your warriors march with no one to lead them; your hand runs dry"), which
   the grammar voices and the offers then answer.
4. **He is recurring and remembers.** A small `MerchantState` persists in
   `JourneyState`: encounter count, mood, past deals, and an anti-repetition
   window. Dialogue and pricing reference this history.

### Two encounter modes (MVP scope)

- **Two-offer (essence price).** Two genuinely useful rewards, each answering a
  distinct need, each carrying its own essence price. The tension is *which
  need do I serve, and is the price worth it.*
- **One-offer (non-essence price).** One strong reward paired with a meaningful
  non-essence sacrifice — Nightmare, a purged good card, a dreamwell downgrade, a
  surrendered dreamsign. The "real price."

### Non-goals (deferred past MVP)

- The push-your-luck / "do you want to play a game?" shapes (escalating wagers,
  decision trees). The architecture leaves room for these as additional modes;
  they are not built first.
- Deep multi-encounter mood arcs beyond a single mood scalar and deal log.
- Need kinds beyond the five marquee kinds in §5.

### What the Reckoner reuses

The encounter is built on a shared effect-application layer, `src/effects/`,
extracted from today's journey engine: the reward/cost `apply()` functions, the
converted-essence (CEC) value model in `src/journeys/journey/value.ts`, and the
journey mutations in `src/state/journey-context.tsx`. The Reckoner's offers come
from a small curated catalog (§6) that drives this layer. Shape generation,
dream-art matching, and the circular-image UI are not part of the Reckoner.

---

## 2. Vocabulary

- **Deck** — `JourneyState.deck: DeckEntry[]`. Each `DeckEntry` is a card instance:
  `{ entryId, cardNumber, transfiguration, typeChange?, keywordModification?, isBane }`
  (`src/types/journey.ts:53`). `cardNumber` resolves to `CardData`
  (`src/types/cards.ts`); `CardData.id` is the stable UUID.
- **Essence** — the journey currency (`JourneyState.essence`).
- **Transfiguration** — a permanent per-card modification stored on the
  `DeckEntry` and applied to the battle card at `create-battle-init.ts:428`.
  Empowered halves cost (`Math.round(cost/2)`); Kindled doubles spark (`0→1`);
  Inspired adds "Draw a card." to an event; Enduring adds "Reclaim."; others in §6.
- **Nightmare** — the sole Bane card carried into battle (`isBane`).
- **Dreamsign** — an ongoing triggered/static effect object held during a run.
- **CEC (converted essence)** — the value model's common unit; `1 CEC ≈ 1
  essence` (`ESSENCE_CONVERTED_ESSENCE_VALUE = 1`). Used to price and match
  rewards and costs.

All algorithms key on `cardNumber` / UUID. Card *names* appear only in display
and dialogue, never as algorithm inputs.

---

## 3. Architecture

```
JourneyState.deck ─┐
       FitModel ─┤
buildaround_support.json ─┤
   role lexicon ─┤
computeDeckSummary ─┘
        │
        ▼
 (1) Deck-Read Engine ──────▶ DeckRead { profile, needs[]  (ranked; each refs real cards) }
        │                                   │
        │             MerchantState ─────────┤
        ▼                                    ▼
 (2) Effect Catalog ───────▶ (3) Offer Director ──────▶ Encounter { mode, offers[], read }
   (rewards + costs;            (mode + need selection,        │
    reuse src/effects/)          pricing, cost-matching)       ▼
                                                    (4) Dialogue Grammar ──▶ Beats
                                                                            │
                                                                            ▼
                                                    (5) Merchant UI: portrait + real game objects
```

### Determinism and multiplayer

Everything from `DeckRead` through `Encounter` and `Beats` is a **pure, seeded
function** of `(journey.seed, siteId, MerchantState)`. The `FitModel` is
deterministic (`src/draft/replay/fit-model.ts`); `buildaround_support.json` is
static; the grammar is seeded. Therefore both multiplayer clients independently
compute the *identical* encounter and dialogue with **zero RTDB writes** until
the player acts. Only the resolution (which offer was taken, the resulting deck
mutations) and the `MerchantState` update are written. This is the structural
payoff of the pure-grammar decision: no generate-once-and-broadcast handshake is
needed.

The encounter is recomputed on demand from state; it is never stored. Re-opening
a `?game=<id>` URL re-derives the same screen.

---

## 4. Data model

New types live in `src/merchant/types.ts`. `MerchantState` is added to
`JourneyState`.

```ts
// ---- Deck read ----
type ThemeId =
  | "warriors" | "spirit-animals" | "survivors" | "outsiders" | "figments"
  | "events" | "discard" | "abandon" | "reclaim" | "storm" | "void"
  | "cheap-characters";

type RoleLabel =
  | "draw" | "ramp" | "abandon-outlet" | "interaction" | "recursion"
  | "finisher" | "cheap-early" | "protection";

interface DeckCardRef { entryId: string; cardNumber: number; uuid: string; name: string; }

interface NeedObservation {
  subject: string;                 // card name or theme display name (for dialogue)
  roleLabel?: string;              // e.g. "card draw"
  metric?: { label: string; from?: number | string; to?: number | string; value?: number };
  // every field is a true, specific fact ready to bind into a grammar slot
}

type Need =
  | { kind: "under_supported_payoff"; theme: ThemeId; tier: 1 | 2 | 3;
      payoff: DeckCardRef; adequacy: number; severity: number; confidence: number;
      observation: NeedObservation }
  | { kind: "missing_role"; role: RoleLabel; importance: number;
      severity: number; confidence: number; observation: NeedObservation }
  | { kind: "weak_card"; card: DeckCardRef; contribution: number;
      severity: number; confidence: number; observation: NeedObservation }
  | { kind: "upgrade_target"; card: DeckCardRef; transfiguration: TransfigurationType;
      projection: TransfigProjection; leverage: number;
      severity: number; confidence: number; observation: NeedObservation }
  | { kind: "curve_problem"; direction: "top-heavy" | "no-early-plays";
      averageCost: number; severity: number; confidence: number;
      observation: NeedObservation };

interface TransfigProjection {
  // concrete, pre-computed preview of the change
  field: "energyCost" | "spark" | "text";
  from?: number | string; to?: number | string; addedClause?: string;
}

interface DeckProfile {
  size: number; characterCount: number; eventCount: number;
  averageEnergyCost: number | null;
  dominantThemes: { theme: ThemeId; supportShare: number }[];
  nearestArchetypes: { recordId: string; similarity: number }[]; // fit-model neighbors
  identityLabel?: string;                                          // e.g. "abandon-aristocrats"
}

interface DeckRead { profile: DeckProfile; needs: Need[]; seed: string; }

// ---- Effects (catalog output) ----
interface EffectGameObject {
  kind: "deckCard" | "newCard" | "nightmare" | "dreamsign" | "essence" | "dreamwell";
  cardNumber?: number; entryId?: string; uuid?: string; // identifies the real object to render
  amount?: number;                                       // essence
  badge?: { label: string; detail?: string };           // e.g. { label: "Empowered", detail: "4→2 ●" }
}

interface ConcreteEffect {
  builderId: string;
  summary: string;                          // short label for logs/dialogue, e.g. "Lighten Miraculous Arrival"
  gameObjects: EffectGameObject[];          // what the UI renders directly
  valueEssence: number;                     // CEC magnitude (>0); drives pricing and cost-matching
  apply: (mut: EffectMutations) => void;    // reuses src/effects/ mutations
  answers: string[];                        // need ids this effect addresses (for invariant checks + dialogue)
}

// ---- Encounter ----
type EncounterMode = "two-offer" | "one-offer";

interface Offer {
  id: "A" | "B";
  reward: ConcreteEffect;
  cost: ConcreteEffect;                     // essence cost (two-offer) or non-essence cost (one-offer)
  locked: boolean; lockReason?: string;     // true if cost is unaffordable at render time
}

interface Encounter {
  mode: EncounterMode;
  offers: Offer[];                          // 2 (two-offer) or 1 (one-offer)
  allowWalkAway: boolean;
  read: DeckRead;
  beats: Beats;                             // §7
  seed: string;
}

// ---- Persisted memory ----
interface MerchantDeal {
  siteId: string; mode: EncounterMode; takenOfferId: "A" | "B" | null;
  rewardBuilderId?: string; costBuilderId?: string;
  paidEssence?: number; needKind?: Need["kind"]; subject?: string;
}

interface MerchantState {
  encounterCount: number;
  mood: number;                 // -3 (cold) .. +3 (favorable); starts 0
  deals: MerchantDeal[];
  recentTemplateIds: string[];  // anti-repetition window (grammar)
  seed: string;
}
```

`MerchantState` defaults (`{ encounterCount: 0, mood: 0, deals: [], recentTemplateIds: [], seed }`)
must be registered in both `createDefaultState()` (`src/state/journey-context.tsx`)
and `normalizeJourneyState()` (`src/multiplayer/room-service.ts`), because RTDB
strips `null`, `[]`, and `{}` on round-trip. A `room-service.test.ts` case must
feed an RTDB-stripped snapshot (the field omitted, `deals: []` omitted) and
assert the defaults are restored. See the QS persistence rules.

---

## 5. The Deck-Read Engine (`src/merchant/deck-read.ts`)

A single pure function:

```ts
function readDeck(input: {
  deck: DeckEntry[];
  dreamAvatar: DreamAvatar | null;
  cardDb: Map<number, CardData>;
  fitModel: FitModel;                       // built from loadDraftRecords()
  supportMeta: SupportMeta;                 // buildaround_support.json
  roleLexicon: RoleLexicon;                 // §5.6
  corpusNorms: CorpusNorms;                 // precomputed curve/role baselines
  seed: string;
}): DeckRead
```

It maps each `DeckEntry` to `CardData` (and so to its UUID), produces a
`DeckProfile`, computes candidate `Need`s of each kind, ranks them, resolves
conflicts, and keeps the top `N` (default 4) as the selection pool the Offer
Director draws from. Every `Need` carries `severity ∈ [0,1]`, `confidence ∈
[0,1]`, and a `NeedObservation` of true, specific, voice-able facts.

All weights and thresholds named below are starting tunables, in the spirit of
`DEFAULT_FIT_TUNING`.

### 5.1 Inputs from existing technology

- **`FitModel`** (`src/draft/replay/fit-model.ts`): exposes `prior:
  Map<name, number>` (corpus play-rate), `coocNorm: Map<name, Map<name,
  number>>` (IDF-weighted partnership), and `computeReplayOffer(pack, deck,
  signature, model, size)`. Built once from `loadDraftRecords()`
  (`src/data/cards-v2-database.ts:87`) and threaded into the read via journey
  content. (Today the model is built only when a draft mode uses it,
  `src/data/journey-content.ts:425`; the Reckoner needs it unconditionally, so the
  build moves to always-on, cached on the content bundle.)
- **`buildaround_support.json`** (478 cards tagged across 12 themes), keyed by
  UUID, with `needs: [{theme, tier}]` (this card is a payoff) and `supports:
  [theme]` (this card enables a theme). Loaded as in
  `src/draft/pool/variant-idf4.ts:26`.
- **`computeDeckSummary`** (`src/components/deck-summary.ts`): size, character /
  event counts, average energy cost.

### 5.2 `under_supported_payoff` — the marquee need

This is "you run an abandon payoff but have no outlet." It generalizes the
`deckSelfAdequacy` routine in `variant-idf4.ts` into a runtime module
`src/effects/buildaround.ts`.

```
deckSize          = deck.length
supportShare(T)   = (# deck entries whose support.supports includes T) / deckSize
TIER_TARGET       = { 1: 0.10, 2: 0.18, 3: 0.25 }          // from variant-idf4.ts
for each deck entry P with support.needs:
  for each {theme:T, tier:K} in P.needs:
     adequacy = min(1, supportShare(T) / TIER_TARGET[K])
     if adequacy < ADEQUACY_NEED_THRESHOLD (0.6):
        emit Need.under_supported_payoff {
          theme: T, tier: K, payoff: ref(P),
          adequacy,
          severity:   1 - adequacy,
          confidence: 1.0,                                  // hand-authored data ⇒ high confidence
          observation: { subject: P.name, roleLabel: themeDisplay(T),
                         metric: { label: "support", value: round(supportShare(T)*deckSize) } }
        }
```

Because the metadata is hand-authored, these are the highest-confidence
observations and the safest to voice explicitly.

### 5.3 `weak_card` — "remove a particularly bad card"

For each deck entry (excluding Nightmare and the Dream Avatar's signature cards),
compute a corpus-fit contribution and flag the worst.

```
prior(c)      = fitModel.prior[name(c)]          // corpus play-rate
meanCooc(c)   = mean over d in deck\{c} of fitModel.coocNorm[name(c)][name(d)]
contribution(c) = 0.5 * z(prior(c)) + 0.5 * z(meanCooc(c))   // z = standardize across deck
rank ascending; let w = argmin contribution
if deckSize >= MIN_DECK_FOR_PRUNE (18)
   and contribution(w) < WEAK_PERCENTILE (20th)
   and w is not the sole support of any present payoff theme:
   emit Need.weak_card {
     card: ref(w), contribution: contribution(w),
     severity:   clamp01((median - contribution(w)) / spread),
     confidence: coverageConfidence(w),           // lower if w is corpus-rare (little signal)
     observation: { subject: w.name,
                    metric: { label: "synergy", value: round(meanCooc(w), 2) } }
   }
```

The guard against pruning a payoff's only support prevents the read from
contradicting a `under_supported_payoff` need.

### 5.4 `upgrade_target` — "transfigure your best X"

Find the highest-leverage `(card, transfiguration)` pair in the deck. This is
where the read decides *which* transfiguration to recommend, because eligibility
and benefit are card-level facts.

```
candidates = deck entries with transfiguration == null
             and eligibleTransfigurations(card).length > 0      // transfiguration-logic.ts:96
for each candidate c, for each eligible transfiguration t:
   projected   = applyTransfigurationToCard(card(c), t)         // transfiguration-logic.ts:113
   benefit(t)  =                                                 // normalized 0..1
       Empowered: energySaved = cost - round(cost/2)              // 0 when cost <= 1
       Kindled:  sparkGained = projected.spark - (spark ?? 0)
       Inspired:    roleValue("draw")     if deck is draw-starved else base
       Enduring:   roleValue("recursion")
       Attuned:     0.5  (activated-ability discount)
       Resonant:  0.5  (trigger frequency)
       Amplified:   0.4  (numeric bump)
   leverage(c,t) = 0.45*centrality(c) + 0.35*norm(benefit(t)) + 0.20*roleImportance(c)
   where centrality(c) = norm(z(prior) + z(meanCooc))           // same signals as §5.3, high end
keep the best (c,t); emit up to K_UPGRADE (2) distinct-card upgrade_target needs:
   Need.upgrade_target {
     card: ref(c), transfiguration: t,
     projection: projectionFor(t, card, projected),             // {field, from, to} / {addedClause}
     leverage,
     severity: norm(leverage), confidence: 0.85,
     observation: { subject: c.name,
                    roleLabel: dominantRole(c),
                    metric: projectionMetric(t, card, projected) }  // e.g. {label:"cost", from:4, to:2}
   }
```

The leverage term is what lets the read prefer Empowered on a cost-heavy enabler
over Inspired on the same card: a draw event that the deck leans on, with cost ≥ 2,
scores its energy saving highly while the "add another draw" benefit is low
because the deck is not draw-starved.

### 5.5 `missing_role` and `curve_problem`

```
roleCoverage(role)   = # deck cards matching roleLexicon[role]      // §5.6
importance(role)     = ROLE_BASE[role] * contextBoost(role, deck)
   contextBoost:  abandon-outlet  ↑ if any abandon payoff present
                  finisher        ↑ if deck max spark < corpusNorms.finisherSpark
                  cheap-early     ↑ if averageEnergyCost > corpusNorms.curveHi
                  draw / ramp     ↑ if corpus neighbors run more of them than this deck
required(role)       = ceil(importance(role) * ROLE_TARGET_FRACTION * deckSize)
if roleCoverage(role) < required(role):
   emit Need.missing_role { role, importance,
        severity: (required-coverage)/required, confidence: lexiconConfidence(role),
        observation: { subject: roleDisplay(role) } }

curve_problem:
   if averageEnergyCost > corpusNorms.curveHi and roleCoverage("cheap-early") < CHEAP_MIN:
      emit { direction:"top-heavy", averageCost: averageEnergyCost, ... }
```

`corpusNorms` (average curve, typical role counts, finisher spark) is computed
once from `docs/draft_records_adapted/` and cached; this is what "what a deck
should look like" concretely means here.

### 5.6 The role lexicon (`src/merchant/role-lexicon.ts`)

A small, high-precision artifact mapping `RoleLabel` to rendered-text patterns,
blended with `buildaround_support` where the hand-authored data is authoritative.

```
draw          /\bdraw(s|ing)?\b/i
ramp          /(gain|add|produce)\b[^.]*●/i
abandon-outlet  supports includes "abandon"  OR  /\babandon\b/i within an ability
interaction   /(banish|dissolve an enemy|return [^.]*to (their|its)|prevent)/i
recursion     supports includes "reclaim"  OR  /\breclaim\b|from your void/i
finisher      spark >= corpusNorms.finisherSpark  OR  /gains \+\d+✦/
cheap-early   cardType == "Character" && energyCost != null && energyCost <= 1
protection    /(prevent|can't be|until end of turn[^.]*safe|shield)/i
```

Patterns are validated against the full card corpus during development to keep
precision high; ambiguous cards default to "no role" rather than a wrong role.
Where `buildaround_support` covers a card, its `supports` list is authoritative
and overrides a pattern miss — this is the blend of hand-authored knowledge and
text signals.

### 5.7 Ranking and conflict resolution

```
score(need) = need.severity * need.confidence
sort desc; then:
  - drop weak_card(w) if w is the payoff of a surviving under_supported_payoff
  - drop a missing_role that an under_supported_payoff already implies
    (e.g. abandon under-support implies abandon-outlet) — keep the payoff need,
    which is more specific and carries a card reference
keep top N = 4 as the encounter selection pool
```

The output `DeckRead.needs` is therefore a small, deduped, ranked list where
each entry names a specific card or theme — the raw material both the offers and
the dialogue consume.

---

## 6. The Effect Catalog (`src/merchant/catalog.ts`)

A deliberately small, curated set: roughly **12 reward builders** and **7 cost
builders**. Curation over variety is the point. Each builder consumes a `Need`
(or a target value, for costs), resolves a *concrete target* from the need's
referenced cards, and produces a `ConcreteEffect` whose `apply` calls the
shared `EffectMutations` from `src/effects/` (which wrap the real journey
mutations). `valueEssence` comes from the existing value model in
`src/journeys/journey/value.ts`.

### 6.1 `EffectMutations` (the `src/effects/` surface)

A thin interface extracted from today's `journeyMutations` adapter
(`src/journeys/adapter/`), backed by `src/state/journey-context.tsx`:

```ts
interface EffectMutations {
  transfigureCard(entryId, type: TransfigurationType, effectDescription: string,
                  effectDetails: Record<string, unknown>): void;  // journey-context.tsx:1868
  changeEssence(delta: number, source: string): void;            // journey-context.tsx:704
  removeDeckEntry(entryId: string, source: string): void;
  addCardById(cardId: string, source: string): string;           // returns new entryId
  addCardByIdWithTransfiguration(cardId, type, source): string;
  addCardById(cardId: string, source: string): string;
  duplicateDeckEntry(entryId: string, source: string): string;
  addDreamsign(sign: Dreamsign, sourceSiteType, purgeIndex?): void;
  // dreamwell, keyword, and modifier mutations as needed
}
```

### 6.2 Reward builders (each answers specific need kinds)

| Builder id | Answers | Resolves target | Renders | `apply` | `valueEssence` |
|---|---|---|---|---|---|
| `transfigure_upgrade` | `upgrade_target` | the need's `card` + `transfiguration` | that deck card + badge `{type, from→to}` | `transfigureCard(entryId, t, desc, details)` | `TRANSFIGURATION_VALUE_CONSTANTS.standardByType[t]` (Empowered 85, Kindled 90, …) |
| `purge_weak_card` | `weak_card` | the need's `card` | that deck card + `✕` badge | `removeDeckEntry(entryId, src)` | `PURGE_VALUE_CONSTANTS.chosenStarter` 70 (or context value) |
| `grant_support_card` | `under_supported_payoff`, `missing_role` | best unowned card whose `supports` ⊇ theme / matches role, ranked by `fitModel.prior` × cooc with deck | the granted card(s) | `addCardById(uuid, src)` | `CARD_VALUE_CONSTANTS.namedVisibleByRarity[rarity]` 75–145 |
| `draft_support_from_4` | `under_supported_payoff`, `missing_role` | 4 candidate cards matching the theme/role | a 1-of-4 mini-offer of real cards | player picks → `addCardById` | `draftBase 18 + choices4 7 + specificity` |
| `duplicate_keystone` | `under_supported_payoff` (tier ≥ 2) | the deck's highest-centrality support of the theme | that deck card ×2 | `duplicateDeckEntry(entryId, src)` | `draftCopyBonus 28`-scaled |
| `add_draw_to_event` | `missing_role:draw` | a central event eligible for Inspired | that event + `Inspired: +draw` badge | `transfigureCard(entryId,"Inspired",…)` | Inspired value |
| `reclaim_key_event` | `missing_role:recursion` | a central event eligible for Enduring | that event + `Enduring: +Reclaim` badge | `transfigureCard(entryId,"Enduring",…)` | Enduring 85 |
| `grant_dreamsign` | `missing_role`, `under_supported_payoff` | a need-aligned dreamsign from the run pool | the dreamsign object | `addDreamsign(sign, …)` | `DREAMSIGN_VALUE_CONSTANTS.namedGain` 145 |
| `lower_curve_card` | `curve_problem` | a cost-heavy central card eligible for Empowered | that card + `Empowered` badge | `transfigureCard(entryId,"Empowered",…)` | 85 |

(The remaining builders cover Kindled-for-finisher and keyword grants; the
table shows the shape.)

### 6.3 Cost builders

Essence cost (two-offer) is a single builder; non-essence costs (one-offer) form
a small menu the Director matches to a target value (§7.3).

| Builder id | Kind | Effect | `valueEssence` (magnitude) |
|---|---|---|---|
| `pay_essence` | essence | `changeEssence(-price, "merchant:price")` | `price` (computed, §7.2) |
| `gain_nightmare` | non-essence | `addCardById(NIGHTMARE_CARD_ID, src)` | `NIGHTMARE_VALUE_CONSTANTS.permanent` (110) |
| `gain_temp_nightmare` | non-essence | Nightmare for the next *k* battles (modifier) | base × `temporaryMultiplier` 0.45 |
| `purge_good_card` | non-essence | `removeDeckEntry` a *strong* deck card | `usefulNonStarterSacrifice` 80 |
| `downgrade_dreamwell` | non-essence | seed a negative dreamwell card | dreamwell loss value |
| `surrender_dreamsign` | non-essence | remove a held dreamsign | `DREAMSIGN_VALUE_CONSTANTS.loss` 120 |
| `battle_curse` | non-essence | temporary battle reward reduction | status value × duration |

---

## 7. The Offer Director (`src/merchant/offer-director.ts`)

```ts
function directEncounter(read: DeckRead, merchant: MerchantState,
                         resources: { essence: number },
                         seed: string): Encounter
```

### 7.1 Mode selection (seeded, context-biased)

```
p(one-offer) = 0.5
  + (essence < 125 ? +0.25 : 0)                 // poor ⇒ prefer non-essence price
  + (distinctStrongNeeds >= 2 ? -0.20 : +0.20)  // many needs ⇒ prefer two-offer
  + (mood <= -2 ? +0.15 : 0)                     // cold ⇒ he wants a pound of flesh
mode = seededBernoulli(seed, clamp(p, 0.1, 0.9)) ? "one-offer" : "two-offer"
```

### 7.2 Two-offer construction

```
needs = read.needs (top, distinct kinds preferred)
for each of the top 2 needs n:
   reward = firstApplicable(rewardBuilders, n).build(n, ctx, rng)
   price  = clampRound(reward.valueEssence
                       * moodMultiplier(mood)        // favorable .85 .. cold 1.4
                       * marketJitter(seed,n))       // 0.95 .. 1.10, seeded
   cost   = pay_essence(price)
   locked = price > resources.essence
   offer  = { id, reward, cost, locked, lockReason: locked ? "not enough essence" : undefined }
allowWalkAway = true                                  // can decline both
```

Both rewards are genuinely useful (each answers a real need); the player weighs
*which need* and *which price*. `moodMultiplier > 1` is how an unfriendly
Reckoner charges more for the same gift.

### 7.3 One-offer construction (the real price)

```
n        = read.needs[0]                              // the single highest-leverage need
reward   = firstApplicable(rewardBuilders, n).build(n, ctx, rng)
target   = reward.valueEssence * brokerMargin(mood)   // 1.0 .. 1.3 — he prices in his favor
cost     = argmin over nonEssenceCostBuilders × params of |costValue - target|,
           excluding builders in merchant.recentTemplateIds,
           respecting availability (e.g. surrender_dreamsign needs a held sign)
offer    = { id:"A", reward, cost, locked:false }
allowWalkAway = true                                  // "walk away"
```

### 7.4 Honest-broker invariants (testable)

1. Every `reward.answers` is non-empty and references a need in `read.needs`.
2. Every offer carries a non-trivial cost (`cost.valueEssence > 0`).
3. No reward pushes the deck against a need the read identified (e.g.
   `purge_weak_card` never targets a payoff's only support — guaranteed upstream
   in §5.7).
4. One-offer cost value ∈ `[1.0, 1.3] ×` reward value (a real, slightly
   unfavorable price); two-offer prices ∈ `≈[0.81, 1.54] ×` reward value via the
   mood/jitter band (mood `0.85–1.4` × jitter `0.95–1.10`).

---

## 8. Worked examples

Each trace runs **Detect → Build → Price → Voice → Render → Apply → Remember**.

### 8.1 Two-offer: Empowered to cut the cost of a key event

**Situation.** A tempo deck the read profiles as leaning on card draw. It runs
the event **Miraculous Arrival** (UUID `b56ef7e8…`, `energy-cost 4`, "Draw 2
cards.", Offering, Fast/Interrupt), plus an abandon payoff with thin support.

**Detect.** §5.4 enumerates transfiguration candidates. Miraculous Arrival is
eligible for Empowered (cost > 0), Inspired, Enduring, and Amplified (its text contains
"2"), hence Perfected too. Benefits: Empowered saves `4 − round(4/2) = 2`
energy; Inspired's "add a draw" scores low because the deck is not draw-starved
(it already leans on draw). `centrality` is high (a common, strong include).
Leverage favors **Empowered**. The engine also finds the abandon payoff under-
supported (§5.2). Two needs survive ranking:

```
Need.upgrade_target { card: Miraculous Arrival, transfiguration: "Empowered",
   projection: { field:"energyCost", from:4, to:2 }, leverage: .71,
   severity: .62, confidence: .85,
   observation: { subject:"Miraculous Arrival", roleLabel:"card draw",
                  metric:{ label:"cost", from:4, to:2 } } }
Need.under_supported_payoff { theme:"abandon", tier:2, payoff: <Aristocrat>,
   adequacy:.33, severity:.67, confidence:1.0,
   observation:{ subject:<payoff name>, roleLabel:"abandon", metric:{label:"support", value:1} } }
```

**Build.** `transfigure_upgrade.build` calls `applyTransfigurationToCard(card,
"Empowered")` → preview cost 2; `describeTransfiguration` → `"Energy cost: 4 →
2"`. Offer A:

```
ConcreteEffect {
  builderId:"transfigure_upgrade", summary:"Lighten Miraculous Arrival",
  gameObjects:[{ kind:"deckCard", entryId, cardNumber,
                 badge:{ label:"Empowered", detail:"4→2 ●" } }],
  valueEssence: 85,
  apply: m => m.transfigureCard(entryId,"Empowered","Energy cost: 4 → 2",
                                { energyCost:{ from:4, to:2 } }),
  answers:["need:upgrade_target:…"] }
```

Offer B comes from `grant_support_card` against the abandon need: the best
unowned `supports:["abandon"]` card by `fitModel.prior` × cooc — say an abandon
outlet of uncommon rarity, `valueEssence = 95`.

**Price.** Mood 0 ⇒ `moodMultiplier 1.0`. `marketJitter` is seeded per offer:
A draws `1.00`, B draws `1.03`. Offer A price = `round(85 × 1.0 × 1.00) = 85`.
Offer B price = `round(95 × 1.0 × 1.03) = 98`. Both affordable (essence 240) ⇒
not locked.

**Voice.** The grammar binds slots from the observations:

> *"You lean on **Miraculous Arrival** to keep your hand alive — yet it bleeds
> **four** from you each time it answers. Heavy, for a thing you need so often.
> And your dream hungers to let its own die: you keep the rites of ruin, but
> nothing to feed them.
> I can lighten the first — **four** becomes **two** — for **85** of your
> essence. Or I can give your ruin its altar, for **98**. Choose."*

Every number and name is a fact from the read.

**Render.** Two-offer layout: column A shows the actual Miraculous Arrival
`CardView` with a `Empowered · 4→2 ●` badge and `85 ◇ — Take`; column B shows the
granted card with `98 ◇ — Take`; portrait + dialogue above; `Walk away` beneath.

**Apply (player takes A).**

```
m.changeEssence(-85, "merchant:price")
m.transfigureCard(entryId, "Empowered", "Energy cost: 4 → 2", { energyCost:{from:4,to:2} })
logEvent("merchant_offer_resolved", { siteId, mode:"two-offer", taken:"A",
   rewardBuilderId:"transfigure_upgrade", paidEssence:85, needKind:"upgrade_target" })
completeSite(siteId)
```

At the next battle, `create-battle-init.ts:428` applies the stored Empowered, so
Miraculous Arrival enters play costing **2 ●**. Real mechanical payoff.

**Remember.** `MerchantState`: `encounterCount += 1`; push the deal
`{ taken:"A", paidEssence:85, subject:"Miraculous Arrival" }`; nudge `mood` per
§9; append the used template ids to `recentTemplateIds`.

### 8.2 One-offer: double a finisher's spark for a permanent Nightmare

**Situation.** An aggressive deck whose strongest early threat is a `2●` Warrior
with `3✦`. The read finds no under-supported payoff but a high-leverage
`upgrade_target`.

**Detect.** §5.4: the Warrior has no transfiguration and is Kindled-eligible
(Character). `applyTransfigurationToCard` → spark `3 → 6`. High centrality (a
corpus-common aggressive Warrior) ⇒ top leverage.

```
Need.upgrade_target { card:<Warrior>, transfiguration:"Kindled",
   projection:{ field:"spark", from:3, to:6 }, leverage:.78, severity:.7, confidence:.85,
   observation:{ subject:<Warrior name>, roleLabel:"finisher", metric:{label:"spark", from:3, to:6} } }
```

**Build.** Reward via `transfigure_upgrade`: `valueEssence = 90` (Kindled),
renders the Warrior with a `Kindled · ✦ 3→6` badge, `apply =
transfigureCard(entryId,"Kindled","Spark: 3 → 6",{spark:{from:3,to:6}})`.

**Price (non-essence).** Mode is one-offer (§7.1). `target = 90 ×
brokerMargin(mood 0 ⇒ 1.2) = 108`. The cost search (§7.3) scans the non-essence
menu: `gain_nightmare` has magnitude **110** — closest to 108 — and is not
in `recentTemplateIds`. Selected.

```
cost = ConcreteEffect { builderId:"gain_nightmare", summary:"Carry Nightmare",
   gameObjects:[{ kind:"nightmare", uuid:NIGHTMARE_CARD_ID, badge:{label:"Bane", detail:"Nightmare"} }],
   valueEssence:110, apply: m => m.addCardById(NIGHTMARE_CARD_ID, "merchant:price"),
   answers:[] }
```

**Voice.**

> *"This one — your **\<Warrior\>** — wants to be terrible. I can make it so:
> **three** becomes **six**, and the lane will fear it. But power of that kind
> is never given freely. You will carry **Nightmare** out of here, and it will
> ride in your deck like a stone in a shoe. Yes? Or no."*

**Render.** One-offer layout: the Warrior `CardView` with `Kindled · ✦ 3→6`;
beneath it the actual **Nightmare** card, identified as the sole Bane, with a `✚ cost` marker; `Accept` /
`Walk away`.

**Apply (Accept).** `m.transfigureCard(…Kindled…)`, then
`m.addCardById(NIGHTMARE_CARD_ID, …)`; log; complete. The Warrior now enters battle
with `6✦`; Nightmare is shuffled into the deck and bites in future battles.

**Remember.** Deal logged; `mood` nudges; `gain_nightmare`/used templates enter the
anti-repetition window so the next encounter won't reach for Nightmare again.

### 8.3 Two-offer: the marquee read — "you need an abandon outlet"

**Situation.** "Lots of energy-generating spirit animals but the deck needs an
outlet." The read finds an abandon payoff at tier 1 with zero outlets.

**Detect.** §5.2: `supportShare("abandon") = 0`, `TIER_TARGET[1] = 0.10` ⇒
`adequacy = 0`, `severity = 1.0`, `confidence = 1.0`. §5.3 also flags a weak,
off-theme starter as the deck's lowest contributor.

**Build.** Offer A `grant_support_card` against the abandon need: best unowned
`supports:["abandon"]` card by corpus fit — say a `1●` "Abandon a character:
…" outlet (uncommon, `valueEssence 95`), rendered as the real card. Offer B
`purge_weak_card`: removes the weak starter (`valueEssence 70`), rendered as
that starter with a `✕`.

**Price.** A = `round(95 × 1.0) = 95`; B = `round(70 × 1.0) = 70`.

**Voice.**

> *"Your spirits make so much, and spend so little — they pile up power with
> nowhere to pour it. Here: a mouth for all that hunger, an altar to abandon
> what you've outgrown — **95**. Or, if you'd rather, I'll simply take the
> **\<weak starter\>** off your hands; it has been dead weight since you
> dreamed it — **70**. One, then."*

**Render → Apply → Remember** as in §8.1. Taking A:
`changeEssence(-95)` + `addCardById(<outlet uuid>)`; the deck gains its outlet
and the abandon payoff comes online.

---

## 9. Memory and mood (`src/merchant/memory.ts`)

`MerchantState` evolves deterministically on each resolution:

```
on resolve(encounter, outcome):
  encounterCount += 1
  deals.push(dealRecord(encounter, outcome))
  recentTemplateIds = take(last R=24, recentTemplateIds ++ usedTemplateIds(encounter.beats))
  mood = clamp(mood + moodDelta(outcome), -3, +3)

moodDelta:
  took a high-price two-offer     → +1   (good custom)
  accepted a Nightmare one-offer  → +1   (he got his pound of flesh)
  walked away                     → -1   (snubbed)
  walked away twice in a row      → -1 extra
```

`mood` feeds `moodMultiplier`/`brokerMargin` (price) and selects greeting/
sign-off registers (warmer when favorable, clipped and ominous when cold).
`deals` feeds **memory callback** beats ("Last we met you turned from my
mirror-gift…", "The Warrior I made terrible for you — how many has it felled?").
`recentTemplateIds` keeps both prose and cost choices from repeating.

---

## 10. The Dialogue Grammar (`src/merchant/dialogue/`)

### 10.1 Structure: beats

An encounter's dialogue is an ordered list of `Beat`s:

```
greeting → observation⁺ → offerFraming(perOffer) → costFraming → [memoryCallback] → signoff
```

with `accept` / `decline` reaction beats produced on resolution. The
`observation` beats are where the read is voiced; they are generated *from* the
top needs' `NeedObservation` data, so they are always specific and true.

### 10.2 The engine

A seeded weighted-expansion grammar:

```ts
function renderEncounterDialogue(read: DeckRead, encounter: Encounter,
                                 merchant: MerchantState, seed: string): Beats
```

- **Nonterminals** expand by seeded weighted choice; each terminal template is
  tagged with an id so `recentTemplateIds` can suppress recent repeats (the
  selector drops recently-used ids before sampling, falling back to the full set
  if all are recent).
- **Slots** bind from structured data only: `{cardName}`, `{themeName}`,
  `{fromCost}`, `{toCost}`, `{fromSpark}`, `{toSpark}`, `{price}`,
  `{mood}`, `{lastDealSubject}`. No free text is ever invented.
- **Register** is chosen by `mood` bucket so the same content reads warm or cold.

Example fragment (one observation nonterminal for the `upgrade_target`/Empowered
case):

```
<obs.cost_heavy_enabler> :=
   "You lean on {cardName} to {roleVerb[roleLabel]} — yet it bleeds {fromCost}
    from you each time it answers."                                  // id obs.che.1
 | "That {cardName} of yours does so much, and asks so much: {fromCost} a
    casting, again and again."                                       // id obs.che.2
 | "{cardName} is the hinge your dream turns upon. {fromCost} is a steep toll
    for a hinge."                                                    // id obs.che.3
roleVerb := { draw:"keep your hand alive", ramp:"feed your engine", … }
```

Because the *specificity* (which card, which number, which theme) comes from the
read and the *variety* comes from a deep authored bank plus anti-repetition and
mood registers, the grammar can stay fresh across a journey without a model.

### 10.3 Swappable dialogue layer (the key risk control)

The dialogue layer sits behind exactly this one interface
(`renderEncounterDialogue(read, encounter, merchant, seed) → Beats`). The
deck-read, catalog, offer-director, and UI depend only on the interface. If the
pure grammar proves too thin in playtest, an offline-authored dialogue bank
(generated with a model at build time, selected deterministically at runtime)
can replace the grammar implementation with **no change** to any other
component. This is the explicit hedge on decision (1).

---

## 11. UI (`src/merchant/ui/`)

The Reckoner screen replaces the circular-image journey screen. It renders the
character portrait, the dialogue panel, and the **actual game objects** the
offers touch.

### 11.1 Layouts

```
 two-offer (essence price)                    one-offer (real price)
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│ [portrait]  "...Miraculous Arrival │   │ [portrait]  "...I can make it      │
│  Reckoner    bleeds four from you  │   │  Reckoner    terrible: three to six │
│              each casting..."      │   │              — but you'll carry     │
│                                    │   │              Nightmare for it."    │
│  ┌─ REWARD A ──┐  ┌─ REWARD B ──┐  │   │        ┌──── REWARD ────┐           │
│  │  [card art] │  │  [card art] │  │   │        │   [card art]   │           │
│  │ Empowered    │  │ gain ↧      │  │   │        │ Kindled ✦ 3→6  │           │
│  │ 4→2 ●       │  │ outlet card │  │   │        └────────────────┘           │
│  └─────────────┘  └─────────────┘  │   │        ┌──── COST ─────┐            │
│   85 ◇ [ Take ]   98 ◇ [ Take ]    │   │        │ [Nightmare]    │  ✚        │
│            [ Walk away ]           │   │        └────────────────┘           │
└───────────────────────────────────┘   │     [ Accept ]   [ Walk away ]      │
                                         └───────────────────────────────────┘
```

### 11.2 Rendering the game objects

Each `EffectGameObject` maps to a real component:

- `deckCard` / `newCard` → existing `CardView` for the `cardNumber`, with a
  corner **badge** drawn from `badge.label/detail` (`Empowered · 4→2 ●`, `✕
  remove`, `Kindled · ✦ 3→6`).
- `nightmare` → the Nightmare card, the sole Bane, rendered with a hazard frame.
- `dreamsign` → the dreamsign object (reuse the dreamsign offering renderer).
- `essence` → an essence token showing `amount`.
- `dreamwell` → the dreamwell card with a downgrade marker.

Reuse: `CardView`, `TransfigurationChooser` (for `draft_*` mini-offers), the
dreamsign renderer, the glossary/hover surface. The Reckoner screen does not use
`JourneyOptionCircle` or `dreamArt`.

### 11.3 Interaction

`Take`/`Accept` runs the offer's `cost.apply` then `reward.apply` through the
multiplayer mutation path, writes the `MerchantState` update, logs
`merchant_offer_resolved`, and completes the site. Locked two-offer options
(unaffordable) render dimmed with the lock reason and are not clickable. `Walk
away` records a snub (mood −1) and completes the site with no deck change.

---

## 12. Integration

### 12.1 The `src/effects/` extraction (approved)

Extract the reusable, browser-safe layer out of `src/journeys/` into
`src/effects/`:

- `src/effects/mutations.ts` — the `EffectMutations` interface + the adapter to
  `JourneyMutations` (today's `journeyMutations`).
- `src/effects/value.ts` — the CEC value model (move/re-export
  `src/journeys/journey/value.ts`).
- `src/effects/buildaround.ts` — runtime `deckSelfAdequacy` + support lookups
  (generalized from `variant-idf4.ts`).
- `src/effects/transfiguration.ts` — re-export the existing
  `transfiguration-logic.ts` helpers (`applyTransfigurationToCard`,
  `eligibleTransfigurations`, `describeTransfiguration`).

The Reckoner's catalog imports from `src/effects/`. The journey apply-functions
that the catalog relies on are referenced through this shared layer so both the
existing journey tests and the new catalog exercise one implementation.

### 12.2 Site and atlas wiring

The Reckoner occupies the encounter slot in the atlas. Concretely:

- Add `SiteType` `"Merchant"` in `src/types/journey.ts` (and a
  `MerchantSiteRuntime` if any per-site state is needed beyond `visited`).
- Route `"Merchant"` from `SiteScreen` in `src/components/ScreenRouter.tsx` to
  the new `MerchantScreen`.
- Add display metadata to `SITE_TYPE_META` and place it in the atlas: it takes
  the encounter slot in the first dreamscape's fixed layout and the weighted
  additional-site pool (`src/atlas/atlas-generator.ts`), at the same cadence the
  encounter slot appears today.

### 12.3 Persistence and logging

- `MerchantState` registered in `createDefaultState()` and
  `normalizeJourneyState()` with a `room-service.test.ts` round-trip case (§4).
- The Reckoner mutation path writes via `multiplayer-journey-context.tsx`: the
  deck/essence/Nightmare mutations through the existing field/transaction writers,
  and the `MerchantState` update as a field write. Because the *offer* is
  re-derived (not stored), only the resolution and memory are persisted.
- Every offer shown and every resolution emits a `logEvent` (`merchant_offer_shown`,
  `merchant_offer_resolved`) per the QS logging conformance rule.

### 12.4 FitModel availability

`buildFitModel` over `loadDraftRecords()` becomes an always-on step in the
content bundle (`src/data/journey-content.ts`), cached and threaded into
`readDeck`. The corpus is already shipped to the browser at
`/draft-records-data.json`.

---

## 13. Testing

- **Deck-read golden tests.** Fixture decks (hand-built `DeckEntry[]`) →
  asserted `Need` sets: an under-supported abandon deck yields the payoff need;
  a cost-heavy draw deck yields the Empowered `upgrade_target`; an off-theme
  starter is flagged `weak_card`; the payoff's only support is never flagged
  weak.
- **Determinism.** Same `(seed, state)` → identical `Encounter` and `Beats`
  (byte-equal), asserted twice; this is also the multiplayer-safety guarantee.
- **Offer-director invariants** (§7.4) as property tests over random fixture
  reads: rewards always answer a real need; costs always present; price bands
  hold; unaffordable two-offer options lock.
- **Catalog apply tests.** Each builder's `apply` calls the expected mutation
  with the expected arguments (mirror `journeyMutations.test.ts`): e.g.
  `transfigure_upgrade` → `transfigureCard(entryId,"Empowered","Energy cost: 4 →
  2",{energyCost:{from:4,to:2}})`.
- **Grammar tests.** No unfilled slots; every bound slot resolves to a real card
  in the deck or a real value from the read; no template id repeats within the
  anti-repetition window; mood register matches `mood` bucket.
- **Persistence.** `MerchantState` RTDB round-trip restores defaults when the
  field/`deals`/`recentTemplateIds` are stripped.
- **Browser QA** (mandatory per QS): create game → reach a Merchant site →
  verify both layouts render the real cards with badges, prices/locks are
  correct, dialogue names the actual deck cards, taking an offer mutates the
  deck/essence and advances the atlas, and reload re-derives the same screen.

---

## 14. MVP scope and phasing

1. **Effects extraction** (`src/effects/`) + `EffectMutations`, with existing
   journey tests green against the shared layer.
2. **Deck-read v1**: `under_supported_payoff`, `weak_card`, `upgrade_target`
   first (the three marquee needs with the strongest existing signal), then
   `missing_role` + `curve_problem`. Role lexicon + corpus norms.
3. **Catalog v1**: the ~12 reward / ~7 cost builders in §6.
4. **Offer Director** with both modes, pricing, cost-matching, invariants.
5. **Dialogue grammar** behind `renderEncounterDialogue`, sized for low
   repetition across a journey; mood registers; memory callbacks.
6. **`MerchantState`** + persistence + logging.
7. **Merchant UI** + atlas/site wiring; browser QA.

Deferred: push-your-luck modes, richer mood arcs, additional need kinds, and the
optional offline dialogue bank (drop-in behind §10.3).

---

## 15. Risks and open questions

- **"Interesting" from a pure grammar.** The central risk. Mitigations:
  specificity from the read, memory callbacks, mood registers, a deep authored
  bank, anti-repetition — and the swappable dialogue interface (§10.3) so an
  offline LLM bank can replace the grammar later without touching anything else.
- **Read coverage gaps.** `buildaround_support` covers 478 cards; cards without
  metadata fall back to fit-model + lexicon signals, which carry lower
  `confidence`. The Reckoner only *voices* high-confidence observations, so a
  gap yields a vaguer line, never a wrong one.
- **Corpus norms.** "What a deck should look like" (curve, role counts, finisher
  spark) is derived from `docs/draft_records_adapted/`; these baselines need a
  one-time computation and occasional refresh as the card set changes.
- **Pricing feel.** The mood/jitter/broker-margin bands are first tunables;
  expect playtest iteration on whether "honest broker, real price" lands as fair
  or punishing.
- **Character name and voice bible.** "The Reckoner" is a placeholder; the
  authored voice bank should be written against a short character bible once the
  name is fixed.
```
