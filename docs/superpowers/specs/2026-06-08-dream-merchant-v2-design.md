# Dream Merchant v2 Design

## Scope

Dream Merchant v2 is a gated replacement presentation for Dream Journey sites
when the URL includes `?journey=v2`. The current Dream Journey implementation
continues to serve Dream Journey sites for every other URL.

This first pass implements only the two-offer construction variant. Each
merchant encounter shows two useful rewards, each priced in essence. The player
may take one offer or walk away. The reward pool is broad and concrete: the
merchant can grant fitting non-starter catalog cards, grant fitting non-bane
Dreamsigns, duplicate deck entries, remove weak deck entries, apply
transfigurations, add card keyword/type modifications where supported by quest
mutations, and adjust immediate resources. The pool excludes future-run
modifiers such as shop discounts, battle reward modifiers, route/site boosts,
temporary protections, and delayed rewards.

The feature lives in `src/journey_v2/`. Existing journey code remains on its
current public surface. Small shared helpers may be extracted only when they
avoid meaningful duplication without changing existing journey behavior.

## Product Decisions

- **NPC identity:** The recurring character is the Dream Merchant. His voice is
  warm, transactional, and uncanny: he sounds like a canny broker with a strange
  inventory. He names specific facts about the player's deck.
- **Offer shape:** Every encounter presents two rewards with essence prices.
  Both rewards answer real detected needs. The tension is which need to serve
  and whether the quoted price is worth paying.
- **Selection flow:** Offers may include follow-up choosers. Some rewards are
  direct, such as transfiguring a named deck entry. Other rewards let the player
  choose from merchant-generated candidates, such as one of four fitting support
  cards or one of several fitting Dreamsigns.
- **Inventory reach:** New-card and Dreamsign rewards can use the full loaded
  catalog, excluding starter/special/bane cards for card grants and bane
  Dreamsigns for Dreamsign grants. Catalog scope is intentionally wider than
  the current run's draft pool and remaining Dreamsign pool.
- **Fit data:** `?journey=v2` opts into loading adapted draft records and
  building the `FitModel` in normal pool-mode runs. The merchant uses this model
  to rank support cards, replacements, and chooser candidates.
- **Memory:** Merchant memory in this pass is ordinary site completion.
  Dialogue and encounter generation are deterministic from quest seed, site id,
  deck, resources, and loaded content.
- **UI direction:** The screen uses a center-stage layout. A large middle region
  is reserved for a future merchant image. The two offers flank the image on
  desktop, with dialogue anchored below or over the merchant region. Mobile
  stacks portrait, dialogue, and offers without clipping card details.

## Routing And Module Boundary

`RuntimeConfig` gains:

- `journeyVariant: "classic" | "v2"`

`parseRuntimeConfig()` maps exactly `?journey=v2` to `"v2"` and defaults to
`"classic"`.

`ScreenRouter` keeps routing by `SiteState.type`. For `DreamJourney` sites:

- `"classic"` renders the current `DreamJourneySiteScreen`.
- `"v2"` renders a new wrapper that builds a merchant context and mounts
  `DreamMerchantScreen`.

The atlas still emits `DreamJourney` sites. This preserves the current first
dreamscape composition, which already includes a Dream Journey site and gives
browser QA a normal player path into the merchant.

`src/journey_v2/` public surface:

- `DreamMerchantScreen`
- `buildMerchantContext`
- `generateMerchantEncounter`
- `resolveMerchantOffer`
- exported types for encounter, offer, reward, chooser request, and resolution

Internal directories:

- `context/` for quest/content projection
- `read/` for deck read and need ranking
- `catalog/` for reward builders and pricing
- `dialogue/` for procedural grammar and dialogue beats
- `ui/` for screen and chooser components
- `testing/` for recording mutation helpers and fixtures

## Context

`buildMerchantContext(state, questContent, site, runtimeConfig)` projects only
the data the merchant needs:

- quest seed, site id, essence, essence cap
- deck entries keyed by entry id and card UUID
- loaded card database, including UUID, card number, type, subtype, cost,
  spark, text, rarity, starter/special flags, and image metadata
- Dreamsign templates
- current held Dreamsigns
- `FitModel`, loaded for v2 when adapted draft records are available
- `buildaround_support.json` metadata keyed by card UUID

Algorithms identify cards by UUID and deck entries by `entryId`. Card names
are display strings and dialogue slots only.

The context builder also prepares indexes:

- `cardByUuid`
- `cardByNumber`
- `deckEntryById`
- `supportMetaByUuid`
- `ownedCardUuids`
- `heldDreamsignIds`
- `candidateGrantCards`
- `candidateDreamsigns`

`candidateGrantCards` includes non-starter, non-special cards from the loaded
catalog. `candidateDreamsigns` includes non-bane templates and filters out
currently held duplicates unless a reward explicitly supports duplication.

## Content Loading

`loadQuestContent()` already loads draft records and builds `FitModel` for
replay and fresh20 modes. The v2 runtime flag extends this to normal pool mode
when `journeyVariant === "v2"`.

The content loader continues to expose `draftRecords` and `fitModel` as optional
fields for tests and defensive fallback. The merchant's intended path expects a
fit model. If content loading cannot provide one, the merchant uses local
heuristics for ranking and logs a diagnostic event:

- `merchant_fit_model_missing`

The fallback ranks by printed-card heuristics, buildaround metadata, rarity,
curve fit, and deterministic seed tie-breaks.

## Deck Read

The deck read returns a ranked set of needs. Each need carries:

- a stable id
- a kind
- severity and confidence
- true observations for dialogue
- concrete referenced cards or themes
- compatible reward builder ids

Need kinds for this pass:

- `under_supported_payoff`: a deck card has authored `needs[]` metadata and the
  deck has too little support for that theme.
- `missing_role`: the deck is light on a role such as draw, recursion,
  abandon outlet, cheap early play, finisher, or interaction.
- `weak_card`: a starter or low-contribution deck entry is a good purge target.
- `upgrade_target`: an existing deck entry has a high-leverage
  transfiguration, keyword, or type modification.
- `curve_problem`: the deck is top-heavy or short on early plays.
- `dreamsign_gap`: a held-Dreamsign profile or deck profile suggests a missing
  passive effect category.

Read signals:

- `buildaround_support.json` detects payoff/support adequacy by UUID.
- Card text heuristics classify roles from printed rules text.
- Deck curve metrics detect top-heavy and early-play gaps.
- Transfiguration eligibility and projection come from
  `src/transfiguration/transfiguration-logic.ts`.
- `FitModel` prior/co-occurrence signals rank cards that belong with the current
  deck.
- Current deck composition protects key supports from weak-card purges.

The read should emit at least two actionable needs when the deck has enough
cards. When fewer than two strong needs exist, the director fills with broad
but useful needs such as high-leverage transfiguration, Dreamsign gap, or
support-card grant.

## Reward Catalog

Each reward builder receives a need and returns either a direct reward or a
chooser-backed reward. Every reward has:

- `builderId`
- `title`
- `summary`
- `answersNeedIds`
- `gameObjects` for UI rendering
- `valueEssence`
- `choiceRequest`, when the player must choose a target
- `resolve(choice)` that produces an apply payload

Immediate reward builders:

- `grant_support_card`: grants one fitting catalog card for an
  `under_supported_payoff` or `missing_role`. Usually chooser-backed with 3-5
  candidates. Candidates are ranked by fit model, support metadata, role match,
  curve fit, rarity, and seed tie-break.
- `grant_exact_card`: grants the single highest-ranked card when confidence is
  very high. Used sparingly so the merchant can make decisive offers.
- `grant_dreamsign`: grants one fitting non-bane Dreamsign. Usually
  chooser-backed with 2-4 candidates. Candidates rank by text-role match,
  deck-read need kind, current held Dreamsigns, and deterministic tie-break.
- `transfigure_card`: applies a high-leverage transfiguration to an existing
  deck entry. Direct when the read identifies a clear target; chooser-backed
  when several entries share similar leverage.
- `duplicate_keystone`: duplicates a central deck entry that supports a
  detected payoff or core plan.
- `purge_weak_card`: removes a weak deck entry. Direct when the read identifies
  a safe target; chooser-backed when several similar targets are available.
- `replace_weak_with_fit`: removes a weak deck entry and grants a fitting
  catalog card. This is a high-value offer with both removed and gained cards
  visible.
- `add_reclaim_to_event`: applies a keyword modification to a central event
  when recursion is missing and the quest mutation supports it.
- `add_fast_to_event`: applies a keyword modification to a central event when
  tempo is missing and the quest mutation supports it.
- `reduce_reclaim_cost`: improves an existing reclaim value when the card and
  mutation model support it.
- `convert_event_to_role`: applies a type/subtype change only when the existing
  card-type mutation model can express the change clearly and the preview is
  understandable.
- `gain_essence`: grants immediate essence only as a filler or secondary need
  answer when the read identifies low resources and no stronger deck reward is
  available.
- `raise_essence_cap`: raises current essence cap as an immediate resource
  reward. This is allowed because it changes present resource state directly.

The catalog excludes:

- battle reward modifiers
- shop discounts and reroll tokens
- dreamscape/site appearance modifiers
- temporary bane grants or temporary protections
- delayed next-battle or next-dreamscape rewards
- one-offer non-essence costs

## Pricing

Two-offer pricing is deterministic and transparent:

`price = rounded(valueEssence * needSeverityMultiplier * scarcityMultiplier * marketJitter)`

Inputs:

- `valueEssence` uses immediate constants from
  `src/journeys/journey/value.ts` until a small shared value module is
  extracted.
- `needSeverityMultiplier` rewards stronger reads with modest discounts:
  severe needs price at `0.90-1.00`, light needs at `1.00-1.12`.
- `scarcityMultiplier` accounts for catalog reach and chooser strength:
  outside-pool card grants, legendary grants, and Dreamsign grants trend higher.
- `marketJitter` is seeded per `(quest seed, site id, offer id, builder id)` in
  the `0.95-1.08` range.

Prices clamp to useful bounds:

- minimum `25` essence
- maximum `essenceCap`
- direct filler rewards avoid consuming both offer slots when unaffordable

Locked offers remain visible with a price and reason. The player can walk away
even when both offers are locked.

## Offer Director

`generateMerchantEncounter(context)`:

1. Computes the deck read.
2. Selects two distinct needs, preferring different need kinds and different
   referenced subjects.
3. Builds a reward for each selected need from the catalog.
4. Applies price calculations.
5. Validates both rewards against honest-broker invariants.
6. Renders dialogue beats from the read and offer data.

Invariants:

- every offer answers a detected need
- the two offers are meaningfully distinct
- every offer has a positive essence price
- direct targets still exist in the current deck/content
- chooser candidates are non-empty
- card rewards identify catalog cards by UUID
- deck-entry rewards identify deck cards by `entryId`
- purge rewards do not remove a payoff's only support for another surviving
  need
- the encounter is deterministic for unchanged state

When the first generated pair fails validation, the director falls back through
lower-ranked needs and alternate builders. The last fallback is one deck
improvement offer and one Dreamsign or resource offer.

## Chooser Flow

The merchant screen starts in `review` state. An offer with no `choiceRequest`
can be accepted directly. An offer with a `choiceRequest` opens an in-screen
chooser:

- card-grant chooser: displays 3-5 full card previews and the reason each fits
- deck-target chooser: displays current deck cards with modification/purge
  previews
- Dreamsign chooser: displays 2-4 Dreamsign tiles/cards and their effects

After a choice is made, the selected reward preview is shown with the price and
final confirmation. Confirming sends a single mutation request containing:

- site id
- generated encounter seed/signature
- offer id
- selected choice, if any
- expected price
- reward builder id
- need id

The mutation recomputes the encounter from current room state and validates the
request before applying changes. This protects multiplayer rooms from stale UI
accepting an offer after another client has changed the deck or resources.

## Mutation And Persistence

Merchant memory in this pass uses ordinary site completion and adds no
merchant-specific field to `QuestState`.

New quest mutations:

- `acceptDreamMerchantOffer(siteId, request)`
- `declineDreamMerchant(siteId, encounterSignature)`

The multiplayer provider implements both with `runRoomTransaction`.

Accept transaction:

1. Normalize current room quest state.
2. Rebuild merchant context and encounter from current state.
3. Match the requested offer id and choice.
4. Verify price, affordability, target availability, and encounter signature.
5. Deduct essence.
6. Apply the reward.
7. Mark the site visited and return to dreamscape.
8. Write an action log entry.

Decline transaction:

1. Rebuild and verify the encounter signature when possible.
2. Mark the site visited and return to dreamscape.
3. Write an action log entry.

Single-player quest context mirrors the same state transforms directly.

Events:

- `merchant_offer_shown`
- `merchant_offer_accepted`
- `merchant_offer_declined`
- `merchant_offer_validation_failed`
- `merchant_fit_model_missing`

Logs include site id, offer id, builder id, need kind, card UUIDs, deck entry
ids, Dreamsign ids, price, affordability, and choice metadata.

## Dialogue Generator

Dialogue is deterministic procedural grammar. It receives the deck read, two
offers, prices, and selected voice register.

Beat structure:

- greeting
- deck read observation for each selected need
- offer framing for offer A
- offer framing for offer B
- price framing
- walk-away line
- accept reaction
- decline reaction

The voice is warm broker:

- he talks about inventory, bargains, taste, and timing
- he names concrete cards, roles, themes, prices, and projected changes
- he offers help because the deck has a visible need
- he avoids punitive or accusatory phrasing

Dialogue banks:

- 20-30 greetings
- 12-20 observation templates per need kind
- 8-12 offer-framing templates per reward family
- 12-16 price-framing templates
- 12-16 accept reactions
- 12-16 decline reactions
- role/theme/card connectors for natural slot binding

Slots bind only from structured data:

- card display name
- theme display name
- role label
- metric values
- transfiguration names
- old/new cost or spark
- Dreamsign display name
- price
- offer labels

The grammar tracks template ids within one encounter to avoid repeated phrasing.
Template anti-repetition is scoped to one generated encounter.

## UI

`DreamMerchantScreen` uses a center-stage composition.

Desktop:

- left column: Offer A card
- center column: large empty merchant image slot, dialogue, walk-away action
- right column: Offer B card
- HUD remains available unless the screen’s existing site rules hide it

Mobile:

- merchant image slot
- dialogue
- offer A
- offer B
- walk-away action

The merchant image slot is intentionally large and stable:

- desktop target: about 40-50% of viewport width in the center column
- mobile target: full-width band with a fixed aspect ratio
- placeholder styling is subdued so a future image can replace it directly

Offer cards show:

- need headline
- dialogue-linked observation
- reward title
- rendered game objects
- price
- lock state
- `Take` action or `Choose` action

Game object rendering:

- deck/new card: `CardDisplay` with overlay badges for transfiguration,
  duplication, purge, or granted-card status
- Dreamsign: `DreamsignArtTile` plus rules text or hover card
- essence/cap: compact resource token with current/cap context
- composite rewards: side-by-side removed and gained objects

Chooser overlays are in-screen panels, not separate routes. They must keep
offer price, merchant dialogue context, and final confirmation visible enough
that the player understands the deal being finalized.

Visual requirements:

- no text clipping in offer cards, buttons, or badges
- stable offer-card dimensions across lock/chooser/confirmed states
- card previews remain readable at tested desktop and mobile widths
- the merchant placeholder leaves enough space for future art without requiring
  a layout rewrite
- the two offers read as comparable deals, not unrelated shop tiles

## Error Handling

Generation failure renders a contained fallback with a `Walk away` action that
completes the site. The fallback logs the error and site id.

Accept validation failure leaves the player on the merchant screen and shows a
short stale-offer message. The screen then recomputes from current state.

Content gaps:

- missing card UUID: skip that candidate
- missing Dreamsign image: existing Dreamsign fallback glyph renders
- missing fit model: use heuristic fallback and log
- empty chooser candidates: director selects another builder

## Testing

Unit tests:

- runtime config parses `?journey=v2`
- screen router selects v2 only for Dream Journey sites under the v2 flag
- merchant context indexes cards by UUID and filters grant candidates correctly
- content loader builds `FitModel` in v2 pool mode
- deck read emits expected needs for crafted deck fixtures
- weak-card read protects sole payoff support
- catalog builders produce valid direct and chooser-backed rewards
- card/Dreamsign grants exclude disallowed candidates
- pricing is deterministic and within configured bounds
- dialogue binds only structured slots and avoids repeat template ids within one
  encounter
- encounter generation is deterministic for unchanged state
- accept mutation validates price, offer id, choice, and current targets
- stale accept requests fail without changing deck/resources
- decline completes the site

Integration tests:

- single-player accept direct transfiguration offer
- single-player accept chooser-backed card grant
- single-player accept chooser-backed Dreamsign grant
- multiplayer transaction applies price, reward, and site completion together
- action log entries contain UUIDs and deck entry ids

Browser QA:

- start a QA Vite server on a non-5173 port
- open normal player flow with `?journey=v2`
- create game, choose Dream Avatar, enter first Dream Journey site
- inspect console/error buffers
- verify center-stage layout at desktop and mobile viewport sizes
- verify both offers render concrete game objects and prices
- verify chooser flow, final confirmation, and accepted reward state change
- verify walk-away completes the site
- verify locked unaffordable offers are visible and disabled

Repository checks after implementation:

- `npm run lint`
- `npm run typecheck`
- `npm test`

## Implementation Plan Shape

The implementation plan should proceed in this order:

1. Runtime flag and router switch.
2. v2 context builder and content-loader fit-model support.
3. Deck-read engine with tests.
4. Reward catalog and pricing with tests.
5. Encounter director and dialogue grammar with tests.
6. Quest mutations for accept/decline in single-player and multiplayer
   providers.
7. Center-stage UI and chooser panels.
8. Browser QA and polishing.
