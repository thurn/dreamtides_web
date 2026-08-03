---
name: exploration-encounter-designer
description: Design and rank five Dreamtides exploration encounters from a canonical card and its full-size artwork, selecting and pairing ten distinct mechanical event templates only after understanding the scene and deck intent. Use when creating encounter prose, narrative choice labels, template variables, validated encounter JSON, a user-facing Markdown display, or a random-card display-mode test where the designer should choose the best-fitting templates.
---

# Exploration Encounter Design

Create five production-ready encounters that make a player feel they have
entered the dream depicted by one card. Give every description distinct wording,
though all five may share the same overall narrative and strongest visual focus.
Choose prose for vivid descriptive precision, art fidelity, and its ability to
support two actions. The artwork supplies the material truth of the scene, but
the prose selects its strongest details instead of inventorying the whole frame.
For a Character card, the canonical character identified by the card name must
remain the primary subject and the only character described. Visible
non-character scene elements such as a held prop, doorway, terrain, weather, or
light may establish that character's scene and support its actions. For other
card types, when multiple entities appear, describe only the one occupying the
largest image area and deemphasize background details. Render the required
subject in evocative, specific detail. Study and freeze the scene before
inspecting mechanics, then deliberately select ten distinct templates and
arrange them into five pairs whose effects fit both the depicted world and the
source card's deck intent. Return strict JSON by default, or render the
validated designs as user-facing Markdown in display mode.

## Required input

For normal operation, require one JSON request containing the canonical
`card` object defined by
[`references/contracts.md`](references/contracts.md). The caller does not
supply authoritative template pairs. If `template_pairs` are present, set them
aside and build a fresh selection from the balanced candidate catalog. Read
[`references/contracts.md`](references/contracts.md) before designing or
validating an encounter.

## Example isolation

Treat every snippet and comparison in this skill and its references as a
structural, stylistic, or quality-boundary illustration only. Documentation
does not nominate any mechanical option. Do not copy or favor a documented
prose line, action label, resolution, predicate, value, template, pairing,
card, or dreamsign. Derive every design-specific choice from the supplied card,
viewed artwork, canonical data, economy, and complete candidate catalog at the
workflow stage assigned to it. In particular, never convert placeholders or
sentinel values in `references/contracts.md` into design defaults.

## Output modes

- Use **JSON mode** by default. Return the complete validated event objects as
  strict JSON.
- Use **display mode** when the user explicitly requests it. Treat the mode as a
  presentation instruction outside the validated JSON request. Design and
  validate the same complete event objects as JSON, then present only their
  user-facing fields in Markdown.

In display mode, emit only this structure, with no introduction, summary,
scores, ranking rationale, IDs, raw templates, variables, or commentary:

```markdown
# <card name>

<card ability>

![Source artwork for <card name>](</absolute/path/to/source-image>)

1. <prose>
   - ***<action label>*** — <fully populated effect_text>
     - **Response:** <resolution>
   - ***<action label>*** — <fully populated effect_text>
     - **Response:** <resolution>

2. <prose>
   - ...
```

Start with the canonical card `name` as a heading and its complete `ability` on
the next paragraph. Then use the absolute image path returned by
`find-card-art.py` in the Markdown image destination so the source artwork
renders inline. Include all five designs in ascending rank order. For each
design, put `prose` at the top level, preserve the two actions' template-pair
order, and render each action as a sub-bullet. Bold and italicize its thematic
`label` with triple asterisks and put the complete `effect_text` on that same
sub-bullet, then put its `resolution` in a nested response bullet. Use
`effect_text`, not the unresolved `template`, so every placeholder and special
token is populated for display.

## Special template variables

An uppercase `$SPECIAL_VARIABLE` in a template is resolved after the designer
chooses the template. It is different from a braced `{placeholder}`: ordinary
placeholders always receive literal values in `variables`, while a special
variable selects content when the event is created.

The canonical catalog currently contains these special variables:

- `$OFFERED_CARD` resolves to one random eligible card offered from the event's
  card pool when the event is created. It does not refer to a card already in
  the player's deck. When an effect grants multiple copies, all copies use that
  same resolved card.
- `$DECK_CARD` resolves to one random eligible card from the player's current
  deck. Templates that copy, modify, or transfigure it all act on the card
  selected from that deck.
- `$STARTER_CARD` resolves to one random eligible starter card that is currently
  in the player's deck. It is narrower than `$DECK_CARD`: a card must satisfy
  both the starter requirement and any explicit selection predicate.
Every special card variable resolves after excluding the source card's UUID
from its eligible pool. This exclusion is unconditional: a predicate may narrow
the remaining pool, but no selection rule may restore the source card.
For `$OFFERED_CARD`, `$DECK_CARD`, and `$STARTER_CARD`, put an eligibility rule
under the token's exact name in `selection` only when a restriction materially
improves the design:

```json
{
  "selection": {
    "$OFFERED_CARD": {
      "predicate": "<eligible predicate>"
    }
  }
}
```

Omitting that token from `selection` means unrestricted among eligible cards
after the source UUID is excluded. Use the standard predicate vocabulary and
exception rules in **Mechanical standards** for every selection predicate.

Because runtime-selected card identity is unknown while authoring, its
`effect_text` uses a readable generic description that states the runtime source
and any restriction. It must not describe the source card as the selected
target. No completed `effect_text` may contain a literal `$SPECIAL_VARIABLE`
token.

After generating the candidate catalog in workflow step 9, inspect every
`$SPECIAL_VARIABLE` reported by the script. If it reports a token not defined in
this section, stop and report the documentation gap instead of inferring its
meaning.

## Test mode

Use **test mode** when the user explicitly requests it. Test mode obtains a
random canonical card from the repository generator and then follows the
complete display-mode workflow, including card verification, artwork inspection,
scene design, deliberate template selection, JSON validation, and ranked
Markdown rendering:

```bash
python3 .llms/skills/exploration-encounter-designer/scripts/generate-exploration-input.py
```

Choose the random-card pool from the user's requested test mode:

- For **character test mode**, pass `--card-type character`.
- For **event test mode**, pass `--card-type event`.
- For **all-card test mode**, or when the user does not specify a type, pass
  `--card-type all` or accept that default.

If the user supplies a seed, also pass `--seed <integer>`. Apply the seed after
filtering to the requested card type so the selected fixture is reproducible
within that pool. Otherwise, use the generator's unseeded random output.
Preserve the generated card as the test fixture. Do not generate, accept, or
preserve random template pairs. If a selected pair makes a required contract
impossible—such as one action being strictly dominated—replace the pair with a
stronger catalog selection before presenting a design. Successful test-mode
responses use the display-mode format exactly and contain no test harness
commentary.

## Workflow

1. Obtain the canonical card object from normal input or the random-card test
   generator. Do not open
   `data/templates.json` yet.

2. Resolve the full-size image from the supplied `image_number`:

   ```bash
   python3 .llms/skills/exploration-encounter-designer/scripts/find-card-art.py <image_number>
   ```

   Use `--images-dir <path>` only when the user supplies a different image
   directory. Actually view the returned image. Stop and report the error if
   the script cannot resolve exactly one readable file. Never design from the
   filename hint alone.

3. Read the canonical card record in `data/tabula/cards.toml` by UUID. Verify
   the supplied identity, ability, and image number rather than silently
   substituting different data. Treat the supplied `card_type` and `subtype`
   as authoritative; do not recategorize the art.

4. Read the depicted scene. Privately separate **material facts** plainly
   visible or strongly implied in the image, **descriptive atmosphere** conveyed
   by supported scale, light, texture, motion, stillness, or weather, and
   **inventions** that add agency, symbolism, events, history, or physical
   conditions. Heat from visible fire, an enigmatic figure obscured by smoke,
   or coils of shadow where dark cables curl are descriptive; a threshold that
   chooses someone or smoke that forgets its shape invents a poetic conceit.
   Note concrete subjects, setting, motion, scale, posture, distance, mood, and
   sensory atmosphere. Before drafting for a Character card, use the canonical
   card name and record to identify the depicted source character. Lock that
   character as the primary subject and the only character prose may describe,
   regardless of the visible area occupied by any other figure. Keep visible
   non-character scene elements available for selective description. If the
   source character cannot be identified unambiguously, stop and report the
   ambiguity instead of choosing another figure. For other card types, identify
   the single most prominent element. If
   multiple entities appear, estimate their visible image area and lock the
   largest as the only entity prose may describe; do not mention smaller
   entities merely because they create a relationship or action. Before naming
   the primary figure's posture, verify its visible
   support points and joint geometry; if sitting, kneeling, or crouching cannot
   be distinguished confidently, describe only the clearly visible pose or
   action. If a claim depends on exact color, measure the image rather than
   trusting visual color perception.

5. Interpret the card according to its canonical type, then make a private
   source-name watchlist. Do not quote the complete card name, use a distinctive
   multiword portion of it as a proper name, or mechanically repeat its words
   across `prose`, `label`, and `resolution`. Individual name words remain
   available when they are ordinary language and the strongest description of
   visible evidence; do not replace `rider` with `mounted silhouette` merely
   because the card name contains `Rider`. For `Night Scavenger`, use the name
   to identify which depicted character the prose must describe, but do not call
   the subject `the Night Scavenger`; `night` or `scavenging` may appear when
   independently supported and evocative. Read a Character name as an archetype
   label that selects the source character, not as a named individual to quote
   in prose. The name is authoritative for subject identity even when another
   depicted entity is larger. For an Event, use the name and ability privately
   to identify the central action, change, or condition without quoting their
   language as scene copy. An Event whose ability prevents a played card should
   feel like interruption, refusal, or something arrested before completion.
   This is an interpretive lens, not permission to add objects, actors, outcomes,
   or rules text absent from the image. Do not invent proper names, identifiable
   faces, fixed biographies, named locations, or offscreen lore.

6. With templates still hidden, build a private scene bank from the artwork.
   For a Character card, build every line around the source character identified
   in step 4. They must remain the primary subject and the only person, creature,
   or character-like figure described. Include visible non-character scene
   elements when they materially establish the encounter or create useful action
   affordances: a prop the character holds or touches, a dominant doorway or
   structure, terrain, weather, light, or another salient environmental detail.
   Spatial and causal relationships between the character and those elements are
   allowed. Keep the selection economical, omit every other character, and do
   not let scenery turn the line into a frame inventory.

   For other card types, choose the single most prominent element. When
   entities are present, this is the entity occupying the largest visible area
   of the image, regardless of narrative importance. Describe that entity alone:
   omit every smaller figure, creature, vehicle, or other entity. Add at most
   one subordinate background detail of light, texture, motion, stillness,
   weather, or setting, and never let framing geometry or scenery become the
   sentence's subject when a figure is more prominent. Describe the required
   subject with specific nouns, strong verbs, evocative sensory detail, and
   economical modifiers.

   Draft only enough candidates to identify excellent scene prose. Draft enough
   faithful variants to give every final `prose` field distinct wording.
   Variants may share the same required subject. For a Character card, vary
   syntax, a visible trait of that character, or the emphasis placed on a
   supported non-character scene element or relationship. Never add another
   character or unsupported scenery for variety. For other card types, vary
   syntax, reader position, or which supported atmospheric detail accompanies
   the subject. A scene does not need conflict, danger, stakes, a dilemma, a
   request, a problem, a resolution, or unresolved tension. Do not use
   anticipated quantities, operations, reward concepts, or effect recipients as
   scene ingredients.

7. Apply eight gates to every candidate with templates and actions hidden:
   - **Name gate:** Does it quote the complete source name, turn a distinctive
     portion of that name into a proper noun, or lean on repeated name words
     instead of fresh scene language? Reject it. Do not reject an independently
     useful ordinary word merely because it also occurs in the card name.
   - **Material-fidelity gate:** Are all subjects, objects, setting
     features, actions, and physical conditions visible or strongly implied?
     Reject invented companions, crowds, creatures, props, structures, weather
     events, histories, or incidents.
   - **Character-focus gate:** If `card_type` is `Character`, is the canonical
     character selected by the card name the primary subject and the only
     person, creature, or character-like figure described? Reject any mention or
     description of another character, even when that figure is larger or
     narratively important. Permit visible non-character elements and the source
     character's relationships to them when they sharpen the scene, but reject a
     line that inventories the frame or lets scenery displace the character.
     This is a mandatory pass/fail gate; visual prominence, compositional
     importance, atmosphere, and mechanical fit cannot justify describing a
     second character.
   - **Focus gate:** Does the line keep the required subject central? If
     this is a Character card, apply the source-character selection and scene
     constraints in the Character-focus gate. Otherwise, if multiple entities
     appear in the artwork, reject any line that names or describes more than
     the single entity occupying the largest visible image area. Reject lines
     led by framing geometry or background scenery when a figure is more
     prominent. Any retained background detail must remain subordinate.
     Omission—not metaphor—is the primary way to avoid flat alt text.
   - **Vividness gate:** Do precise nouns, verbs, and restrained modifiers give
     the required subject atmosphere, motion, texture, or scale? For a Character
     card, draw vividness from the source character and a selective set of
     visible props, architecture, terrain, weather, light, or other
     non-character scene details. Reject generic descriptions such as `a man
     stands near a shape`, even when accurate.
   - **No-conceit gate:** Reject metaphor, simile, personification, symbolic
     equivalence, impossible agency, and reality-bending conclusions. In
     particular, thresholds do not choose, smoke does not forget, light does not
     hold a person in a spell, and the world does not fray. Conventional visual
     phrasing such as `wreathed in flame` or `coils of shadow` is allowed
     when it directly describes appearance and introduces no agency or hidden
     meaning.
   - **Clarity gate:** Can an ordinary reader understand the selected image on
     first reading? Mystery may come from what the image withholds, not from an
     opaque poetic claim.
   - **Embodiment gate:** Does the prose assign the reader a body, clothing,
     posture, biography, or precise emotion that the artwork does not establish
     from the reader's point of view? Supported felt experience—pressure,
     vertigo, hush, heat, awe, menace, or the world seeming small—is allowed.
     Second person places the reader in the scene; it does not make every
     depicted figure's physique or feelings the reader's own.

   Also reject scenes that announce a decision, manufacture a predicament,
   depend on symbolic word substitution, or disguise a game operation. Freeze
   every passing prose field. Do not revise it to support a mechanic later.

8. Infer deck intent from the ability and canonical metadata. Ask what choosing
   this card suggests the player is building toward. Inspect repository tags
   and canonical content when useful. Favor values, predicates, and real UUID
   references that support that plan. Both eventual choices should remain
   useful to the likely deck: one may deepen its synergy while the other offers
   flexibility, conversion, or risk management. Use only the standard predicate
   vocabulary: `Event`, `Warrior`, `Spirit Animal`, `Survivor`, or
   `≤2● cost Character`. For special variables such as `$DECK_CARD`, prefer
   no constraint by omitting `selection` when none of those restrictions
   materially improves the design. Depart from the standard vocabulary only
   for a strong card-specific design reason, after verifying the exception has
   enough eligible targets in the relevant canonical pool. Record that reason
   later in the action's `predicate_exception_rationale` for validation.

   Inspect the relevant economy, pricing, pool, and effect data enough to
   understand which broad reward shapes help the likely deck and what mechanical
   scale is credible. At this point, be able to explain privately both the
   depicted world's narrative affordances and the card's strategic affordances
   without consulting a template.

9. Only now generate the balanced candidate catalog for this run:

   ```bash
   python3 .llms/skills/exploration-encounter-designer/scripts/list-template-candidates.py
   ```

   Do not open `data/templates.json` directly. The script reads the canonical
   catalog and current usage in `data/encounter_candidates.json`, then prints
   the complete selectable `templates` list for this run. Review every returned
   template before committing; do not stop after finding the first ten
   plausible entries.

   Read the `balance` metadata before selecting. A template in
   `soft_warnings` remains selectable, but prefer an unflagged template when it
   fits the scene and deck intent comparably well. Entries in
   `omitted_templates` are diagnostic IDs, not candidates; do not select them or
   reopen the raw catalog to recover them. The script counts rank-1 uses and
   total uses separately, then orders candidates by fewest prior rank-1 uses
   first and fewest total uses second. Each dimension warns at one use above its
   current least-used template and temporarily omits at two uses above that
   low-water mark. This gives rank-1 diversity priority while keeping the full
   candidate set balanced. If an extremely skewed data set would leave fewer
   than ten choices, the script restores the least-used omitted entries and
   lists them in
   `reintroduced_to_preserve_minimum_pool`; treat each restored entry as
   strongly discouraged but available when necessary.

10. Shortlist returned candidate templates by testing each against the frozen
    scene bank and deck intent:
    - **Scene-grounded causality:** Imagine a 2–5 word act and immediate world
      response that make the effect follow naturally from something the player
      can engage with in the depicted scene.
    - **Material honesty:** Reject templates that would require adding a person,
      object, condition, history, or symbolic meaning to the initial prose.
    - **Strategic usefulness:** Prefer effects whose variables can support the
      source card's likely deck while leaving room for a real alternative.
    - **Satisfiable specificity:** Prefer templates whose predicates, card or
      dreamsign references, transfigurations, and values can be populated with
      canonical content that fits both the scene and the strategy. Reject any
      card reference or runtime selection that can resolve to the source card.
    - **Chain strength:** Judge the prospective label, resolution, and effect as
      one causal chain. A merely thematic reward with no convincing player act
      is a weak fit.

    Do not select a template merely because its game term has a loose poetic
    analogue in the art. Do not translate purging into erasure, essence into
    flame, speed into motion, or random rewards into visible fragments. Prefer
    mechanics supported by plausible interaction and consequence.

11. Choose exactly ten distinct returned `template_id` values and arrange them
    as five ordered pairs of two. Form each pair around one frozen scene that
    can support two comparably credible ways of engaging with it. The choices
    should differ in purpose, cost, risk, flexibility, or deck-building role
    without one being strictly dominant. Optimize the weaker action chain in
    each pair.

    Do not force category diversity: repeated mechanical families are
    acceptable when independently best. Template IDs may not repeat anywhere in
    the five pairs. Preserve each selected catalog entry's exact `template_id`
    and `template` string, preserve the chosen pair order, and preserve action
    order within each pair. Use unique pair IDs such as `pair-1` through
    `pair-5`.

12. Combine the card and selected pairs into the complete input contract, then
    validate both that contract and the ten-template uniqueness rule:

    ```bash
    python3 .llms/skills/exploration-encounter-designer/scripts/validate-exploration.py \
      --input <request.json>
    ```

13. Match the strongest compatible frozen scene to each template pair
    independently. Preserve input order and never alter or swap templates. Reuse
    the strongest scene concept whenever it remains the best fit, but assign a
    distinctly worded frozen variant to each event. Do not choose a weaker
    visual relationship merely to force a different narrative. For each effect,
    write a purposeful action label that is natural in the scene and makes the
    effect a plausible consequence. Privately complete: “When the player
    [label], [effect] follows because ___.” Require a concrete, scene-grounded
    answer without game terminology. Let the action and resolution carry any
    new consequence that happens after the player's choice; never pre-seed the
    prose with extra figures or objects to literalize a mechanic.

    If a chain fails or scores below 7/10, first revise the label, resolution,
    variables, or scene assignment. Never revise frozen prose merely to
    distinguish it from another event. If the pair itself cannot support two
    strong chains, replace it with a stronger selection from the catalog and
    revalidate the request.

14. Write a 5–10 word `resolution` for each action. Show the immediate response
    to the player's act and bridge naturally into the displayed effect without
    restating it. The scene, label, resolution, and effect should read as one
    causal sequence.

15. Calibrate mechanical values against the current game. Before choosing a
    count or essence value, inspect relevant economy, pricing, pool, and effect
    data in the repository. Compare the likely low, typical, and high result of
    each choice. Do not guess a small-looking number in an economy whose units
    operate at a different order of magnitude. Choose each predicate
    independently; never carry a predicate into another action merely because
    it fit once.

16. Compare all five designs using the contract rubric, then assign unique
    ranks. Rank vivid descriptive precision, art fidelity, focus, and mechanical
    connection above literal completeness or poetic ornament. A faithful
    caption does not become excellent prose by naming more visible details, and
    a poetic conceit does not become excellent prose by sounding profound. Score
    mechanical connection by the weaker of the two action chains, not their
    average. Revise any chain below 7/10. A shared narrative or visual focus
    loses no points, and textual novelty earns no points beyond satisfying the
    distinct-wording requirement. When two designs are otherwise comparable,
    use the step-9 rank-1 usage counts as the tie-breaker: give the better rank
    to the pair whose templates have fewer prior rank-1 uses. Never promote a
    materially weaker design solely to improve historical balance.

17. Sort the five completed event objects by ascending `rank` as a final
    readability pass, so rank 1 appears first and rank 5 last. Keep each event's
    `template_pair_id` and two actions together; sorting events must not alter
    or swap the actions within a template pair.

18. Before validation, scan every `prose`, `label`, and `resolution` for
    the complete card name, distinctive multiword fragments used as names, and
    mechanical repetition of source-name language. Replace those matches while
    preserving independently useful ordinary words. For a Character card, audit
    every `prose` noun, modifier, and clause against the Character-focus gate and
    reject the complete design if it describes another character, lets scenery
    displace the source character, or includes a scene element unsupported by
    the artwork. Scan every
    action's structured card references and runtime card selections by UUID,
    and its `effect_text` for a source-card target, rejecting any that identify
    or can resolve to the source card. Then write the complete event objects to
    JSON, validate them, and fix every error regardless of output mode:

    ```bash
    python3 .llms/skills/exploration-encounter-designer/scripts/validate-exploration.py \
      --input <request.json> --output <events.json>
    ```

19. Emit the validated result in the selected output mode. In JSON mode, emit
    the bare JSON list with no Markdown fence or surrounding commentary. In
    display mode, including successful test mode, render only the Markdown
    structure specified in **Output modes**; do not expose the underlying
    design metadata.

## Narrative standards

- Write in second-person present tense. The interface already establishes that
  the player entered the card, so begin inside the moment.
- Treat every `prose` field as the reader's first glimpse of an independent
  scene. Introduce material subjects clearly, but let the sentence lead with an
  atmosphere, action, or sensory detail when that creates a
  stronger entrance. Use `a` or `an`, not `one`, when directly introducing a
  singular subject. A definite or possessive phrase may open the line when its
  referent is immediately clear from the same image and sentence; reject only
  genuine ambiguity, not expressive sequencing.
- Keep the entire `prose` field near 8–14 words and never above 16. Use more
  than one sentence only when the extra sentence adds real value.
- Describe a scene, not a miniature quest or an illustrated reward. Establish
  what the player encounters through selective visual description. Atmosphere
  may arise from supported scale, posture, motion, stillness, light, texture,
  distance, weather, or obscurity. Do not diagnose a depicted subject's private
  emotions, dictate a precise player emotion, or explain the image's symbolic
  meaning. Nothing needs to be wrong, threatened, requested, or unresolved.
  Keep game terms such as card, deck, draft, purge, essence, dreamsign, and
  transfiguration out of the prose.
- Treat the artwork as the source of truth for every material element in the
  prose. Select and omit visible evidence freely, but do not recast it as a
  symbol or give it impossible behavior. If the art shows a lone figure, keep
  the figure alone; do not add a column, crowd, companion, or hidden population
  to service a Character effect.
- For every Character card, the canonical character identified by the card name
  is the primary subject and the only character prose may describe. This rule
  overrides relative image area and all other focus heuristics. Do not mention
  or describe another person, creature, or character-like figure. Visible
  non-character elements—including a held or touched prop, architecture such as
  a doorway, terrain, weather, light, and framing shapes—may appear when they
  help establish the character's scene or create concrete action affordances.
  The character may be located relative to and act upon those elements. Keep the
  selection deliberate, keep the character central, and avoid cataloguing the
  frame.
- Do not infer physical scale from a close crop or portrait composition: a
  subject filling the frame does not imply that it towers over the reader or
  that its features are massive or enormous. In action labels and resolutions,
  name a visible person or use clear personal pronouns supported by the
  canonical identity (`she`/`her` when the character is explicitly described
  as a witch, `they`/`their` when gender is not established) instead of an
  ambiguous or dehumanizing `it`/`its`; do not turn uncertain visual details
  into interactable marks, symbols, or props.
- For non-Character cards, build each line around only the single most prominent
  element. When the art contains multiple entities, describe only the entity
  occupying the largest visible image area and omit all others. Give that
  primary figure evocative, detailed treatment through strong verbs, exact
  nouns, restrained adjectives, and supported qualities of posture, motion,
  scale, light, or texture. Permit at most one background detail, keep it
  grammatically subordinate, and do not let scenery or framing compete with the
  primary figure.
- Reject caption-shaped prose even when it is specific, spatially accurate, and
  written in second person. Naming every subject, prop, position, and setting
  feature produces alt text. For Character cards, keep the source character
  central, omit other characters, and select only the non-character elements
  that sharpen the encounter. For other cards, keep the largest-area entity and
  omit the rest.
- Do not use poetic conceits. Reject metaphors, similes, personification,
  symbolic equations, impossible agency, and conclusions about reality. Allow
  conventional descriptive imagery such as `wreathed in flame` and `coils of
  shadow` when it is a compact account of visible appearance rather than a claim
  that the scene thinks, chooses, remembers, or means something hidden. For a
  Character card, this allowance remains subject to the Character-focus gate:
  visible flame, shadow, and other non-character scene elements may appear, but
  another character may not.
- Use these caption-regression comparisons as a quality floor:
  - Reject “Your small boat passes beneath a whale drifting across the stars.”
    Prefer “A whale sweeps overhead, its broad belly gleaming.”
  - Reject “A slender figure stands behind an immense owl gripping the branch.”
    Prefer “A vast owl grips the branch, its round eyes unblinking.”
  - Reject “A bright triangle frames a suited gunman among curling black cables.”
    Prefer “A suited gunman stands motionless as black cables curl around a
    bright doorway.”
  - Reject “A skull-headed giant suspends a blazing lantern before the reaching
    child.” Prefer “A skull-headed giant raises a blazing lantern in one gaunt
    hand.”
  - Reject “A giant wolf prowls through burning grass toward a crouched archer.”
    Prefer “A giant wolf prowls low through burning grass, its shoulders
    rolling beneath singed fur.”
- Do not optimize for different compositions or sensory focuses across the five
  scenes. Every `prose` field must nevertheless have distinct wording. Rephrase
  the shared required subject through syntax or a different supported detail.
  For Character cards, that detail may be a visible trait of the source
  character or a supported non-character scene element or relationship. Other
  characters and unsupported scenery remain forbidden. Keep each version at
  least as vivid, faithful, and mechanically useful.
- For an Event card, foreground the depicted action or charged instant implied
  by its name and ability. Ask what is being prevented, completed, revealed,
  broken, escaped, or otherwise changed in the frame, and describe that instant
  before secondary scenery. The ability helps select the relevant visible
  action; it does not authorize a rules paraphrase, symbolic interpretation, or
  unsupported material event.
- Extrapolate only immediate sensory qualities strongly supported by the image,
  such as heat from visible fire or wind from visibly blown fabric. Do not add
  material subjects, props, architecture, terrain, weather, history, events,
  impossible agency, or symbolic meaning. A resolution may introduce a
  plausible material response after the player acts; the initial prose may not
  anticipate that response.
- Use these art-fidelity regression checks:
  - For a Character card showing a lone warrior above burning ruins, prefer “A
    scarred warrior stands rigid above burning ruins, broad shoulders drawn
    taut.” Reject prose that introduces another character or lets the ruins
    displace the warrior.
  - Reject “A resting runner studies suspended screens” when the art contains
    projections but no resting individual. Do not invent an observer to animate
    an abstract or environmental composition.
  - Reject “A scorched warrior inspects a silent shield wall” when no shield
    wall appears. Do not promote ambiguous background shapes into a group or
    formation.
- Allow wonder, melancholy, danger, uncanniness, and mythic intensity. Avoid
  graphic harm, cruelty, modern slang, mood-breaking comedy, and obvious
  good-versus-evil framing.
- Make each choice label a 2–5 word causal act, at most 32 characters. Prefer a
  performative verb with a target or intention: call, invite, welcome, release,
  offer, follow, receive, trade, or gather. Do not paraphrase the reward. Both
  labels must be plausible ways to engage with the scene and establish why the
  effect follows.
- Reject context-free gestures such as “Raise Your Arms,” “Meet Its Gaze,” or
  “Stand Your Ground” when the effect does not naturally answer that gesture.
  Observing, waiting, and listening suit effects involving knowledge, omens, or
  discovery; calling and welcoming suit new characters; offering and releasing
  suit losing or exchanging something; movement suits speed or travel.
- Write each `resolution` in present tense using 5–10 words. Describe what the
  world does immediately after the action. Keep game terminology and explicit
  reward text out of it. Do not use the resolution to explain rules, repeat the
  action label, or introduce unrelated lore.
- Keep source-name language from becoming a refrain across `prose`, `label`, and
  `resolution`. Do not quote the complete name or treat an archetype label as a
  proper noun. Ordinary words from the name may still describe visible evidence
  when they are the most evocative choice. The Markdown heading and canonical
  names required inside `effect_text` remain unchanged.
- Do not mirror a template's number in the fiction. Four offered cards do not
  imply four figures, sparks, doors, paths, or voices in the scene.
- Do not translate mechanics into mystical synonyms. Purging is not erasing a
  footprint or burning a memory; speed is not quickening a shadow; essence is
  not automatically flame; random rewards are not scattered fragments.
- Avoid vague dream-fantasy filler—unexplained sparks, shadows, echoes, threads,
  paths, whispers, fragments, and transformations—unless each is a concrete,
  story-bearing part of this particular scene.
- Avoid generic decision language such as “awaiting your answer,” “offers two
  paths,” or “asks what you will choose.” Show the scene itself.
- Distinct wording is a presentation requirement, not a quality criterion.
  Similar scenes and the same overall narrative are acceptable across the set
  when each supports both choices. Never add abstraction, unsupported
  embodiment, or decorative imagery to differentiate events.

## Mechanical standards

- Preserve each `template_id` and exact canonical `template` string.
- Populate every `{placeholder}` in `variables`. The standard predicate values
  are exactly `Event`, `Warrior`, `Spirit Animal`, `Survivor`, and `≤2● cost
  Character`. A special runtime variable may instead remain unrestricted by
  omitting its `selection` entry. Do not manufacture a restriction merely to
  make an effect appear tailored.
- Never use `"Character"` as a predicate in `variables` or `selection`. It
  covers roughly 70% of the card catalog and does not create a mechanically
  interesting restriction; use no constraint instead.
- Use a predicate outside the standard vocabulary only when the source card's
  ability or established archetype creates a strong design reason that none of
  the standard predicates can serve. Verify the exception against canonical
  content, including enough eligible targets for the specific template, and add
  a concise `predicate_exception_rationale` to that action. Mechanical variety,
  surface flavor, or the source card's own type or cost is not sufficient.
- Evaluate each predicate-bearing action separately. Reuse a predicate only
  when it is independently the best standard choice for that action, not as a
  set-wide theme or default.
- Reference existing cards and dreamsigns with real canonical UUIDs. Resolve
  names only for display. Validate transfiguration names and other fixed content
  against repository sources. Never key, compare, or select cards by name.
- Exclude the source card UUID from every template resolution. A structured
  `{card_id}` or `{card_name}` reference must identify a different canonical
  card, and `$OFFERED_CARD`, `$DECK_CARD`, and `$STARTER_CARD` always select from
  a pool with the source UUID removed. This rule is unconditional, including
  when the source card would otherwise satisfy the chosen predicate or appear
  in the player's deck or event pool. Do not identify the source card as an
  action's resolved target in `effect_text` or any other template field.
- Choose exact cards, dreamsigns, predicates, and other variables for three-way
  fit: they must suit the depicted world, the label-and-resolution chain, and
  the deck strategy. Reject a named reward that is mechanically useful but
  narratively unrelated. In particular, select a thematically resonant
  dreamsign rather than forcing an arbitrary dreamsign into the narrative.
- Follow **Special template variables** for the source, timing, restrictions,
  and display treatment of every special variable.
- Write `effect_text` as readable display copy with all placeholders and special
  tokens resolved. Keep the exact template and structured values authoritative.
- Choose conservative values when balance evidence is incomplete, but keep
  them on the live system's scale. Reject an option pair with an obvious
  universal best choice.
- Never revise frozen prose to explain an effect. If a scene and pair cannot
  support two causal label-and-resolution chains, assign another compatible
  frozen scene to that pair; that scene may already be used by another pair.
