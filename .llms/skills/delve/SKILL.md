---
name: delve
description: Design and rank five Dreamtides Delve narrative encounters from a canonical card, its full-size artwork, and five pairs of mechanical event templates. Use when creating Delve event prose, narrative choice labels, template variables, custom Delve rewards, card-specific encounter JSON, a user-facing Markdown display, or a display-mode test from randomly generated input.
---

# Delve Encounter Design

Create five production-ready encounters that make a player feel they have
entered the dream depicted by one card. Give every description distinct wording,
though all five may share the same overall narrative and strongest visual focus.
Choose prose for fidelity of impression, evocative force, and its ability to
support both actions in the assigned template pair. The artwork supplies the
material truth of the scene, not a checklist of details to transcribe. Return
strict JSON by default, or render the validated designs as user-facing Markdown
in display mode.

## Required input

For normal operation, require one JSON request containing a card and exactly
five template pairs. In test mode, generate that request with the repository
script instead. Read [`references/contracts.md`](references/contracts.md)
before designing or validating an encounter.

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

## Test mode

Use **test mode** when the user explicitly requests it. Test mode obtains a
random request from the repository generator and then follows the complete
display-mode workflow, including input validation, artwork inspection, JSON
design, output validation, and ranked Markdown rendering:

```bash
python3 scripts/generate-delve-input.py
```

If the user supplies a seed, pass it through with `--seed <integer>`. Otherwise,
use the generator's unseeded random output. Preserve the generated card,
template pairs, pair order, and action order as the test fixture; never reroll
silently because the combination is difficult. If a generated pair makes a
required contract impossible—such as one action being strictly dominated—stop
and report the failed test rather than presenting an invalid design. Successful
test-mode responses use the display-mode format exactly and contain no test
harness commentary.

## Workflow

1. Validate the request before creative work:

   ```bash
   python3 .llms/skills/delve/scripts/validate-delve.py --input <request.json>
   ```

2. Resolve the full-size image from the supplied `image_number`:

   ```bash
   python3 .llms/skills/delve/scripts/find-card-art.py <image_number>
   ```

   Use `--images-dir <path>` only when the user supplies a different image
   directory. Actually view the returned image. Stop and report the error if
   the script cannot resolve exactly one readable file. Never design from the
   filename hint alone.

3. Read the canonical card record in `data/tabula/cards.toml` by UUID. Verify
   the supplied identity, ability, and image number rather than silently
   substituting different data. Treat the supplied `card_type` and `subtype` as
   authoritative; do not recategorize the art.

4. Read the depicted scene. Privately separate three kinds of claims:
   **material facts** plainly visible or strongly implied in the image,
   **evocative interpretations** that express the supported mood or experiential
   consequence of those facts, and **material inventions** that add a subject,
   object, event, history, or physical condition. Heat from visible fire, a
   hush suggested by immense stillness, or a horizon that *feels* commanded by
   a towering figure can be supported interpretations; an unseen crowd or an
   invented attack is not. Note concrete subjects, setting, motion, scale,
   posture, distance, mood, sensory atmosphere, and relationships. If a claim
   depends on exact color, measure the image rather than trusting visual color
   perception.

5. Interpret the card according to its canonical type, then make a private
   source-name watchlist. Do not quote the complete card name, use a distinctive
   multiword portion of it as a proper name, or mechanically repeat its words
   across `prose`, `label`, and `resolution`. Individual name words remain
   available when they are ordinary language and the strongest description of
   visible evidence; do not replace `rider` with `mounted silhouette` merely
   because the card name contains `Rider`. For `Night Scavenger`, do not call
   the subject `the Night Scavenger`, but `night` or `scavenging` may appear when
   independently supported and evocative. Read a Character name as an archetype
   label rather than a named individual. For an Event, use the name and ability
   privately to identify the central action, change, or condition without
   quoting their language as scene copy. An Event whose ability prevents a
   played card should feel like interruption, refusal, or something arrested
   before completion. This is an interpretive lens, not permission to add
   objects, actors, outcomes, or rules text absent from the image. Do not invent
   proper names, identifiable faces, fixed biographies, named locations, or
   offscreen lore.

6. Set the templates aside and build a private scene bank from the artwork.
   First state the scene's **imaginative thesis**: what makes this particular
   moment uncanny, wondrous, menacing, intimate, mournful, or mythic to inhabit.
   Then choose the smallest set of visible anchors needed to carry that thesis.
   Translate composition into experience through a charged verb, metaphor,
   comparison, sensory compression, impossible-seeming scale, symbolic
   resemblance, rhythmic contrast, or immediate imaginative consequence. Omit
   secondary details freely. The reader should recognize the dream without
   being given stock-image alt text for it.

   Draft only enough candidates to find prose that can support the generated
   mechanics; one excellent scene may support several template pairs. Draft
   enough faithful variants to give every final `prose` field distinct wording.
   Variants may share the same imaginative thesis and visual focus; vary syntax,
   reader position, or the expressive transformation of supported details
   rather than adding material for variety. Figurative language is welcome but
   not mandatory: vivid diction, omission, rhythm, and sensory immediacy can
   also transform a scene. A scene does not need conflict, danger, stakes, a
   dilemma, a request, a problem, a resolution, or unresolved tension. Do not
   use template quantities, operations, reward concepts, or needed effect
   recipients as scene ingredients.

7. Apply six gates to every candidate with templates and actions hidden:
   - **Name gate:** Does it quote the complete source name, turn a distinctive
     portion of that name into a proper noun, or lean on repeated name words
     instead of fresh scene language? Reject it. Do not reject an independently
     useful ordinary word merely because it also occurs in the card name.
   - **Material-fidelity gate:** Are all literal subjects, objects, setting
     features, actions, and physical conditions visible or strongly implied?
     Reject invented companions, crowds, creatures, props, structures, weather
     events, histories, or incidents. This gate does not require figurative or
     experiential language to be literally visible; it asks whether that
     language transforms supported evidence without asserting a new material
     fact.
   - **Caption gate:** Could the line pass unchanged as stock-image alt text, or
     does it mainly enumerate who stands where, what they carry, and what they
     face? Reject it even when every detail and spatial relationship is accurate.
     Scale adjectives, `you`, and a semicolon do not turn a caption into an
     encounter.
   - **Evocative gate:** Does the line make at least one supported aspect of the
     scene feel newly immediate through charged diction, sensory implication,
     metaphor, comparison, rhythm, omission, symbolic resemblance, or
     imaginative consequence? Reject prose whose only achievement is accurate
     reconstruction. Also reject vague dream-fantasy atmosphere that could fit
     unrelated art.
   - **Clarity gate:** Can an ordinary reader understand the central image and
     imaginative turn on first reading? The prose need not let the reader
     reconstruct every depicted detail. Mystery is welcome; confusion is not.
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
   references that support that plan. Both choices should remain useful to the
   likely deck: one may deepen its synergy while the other offers flexibility,
   conversion, or risk management. Use only the standard predicate vocabulary:
   `Event`, `Warrior`, `Spirit Animal`, `Survivor`, or `≤2● cost Character`.
   For special variables such as `$DECK_CARD`, prefer no constraint by omitting
   `selection` when none of those restrictions materially improves the design.
   Choose each predicate independently; never carry a predicate into another
   action merely because it fit once. Depart from the standard vocabulary only
   for a strong card-specific design reason, after verifying the exception has
   enough eligible targets in the relevant canonical pool. Record that reason
   in the action's `predicate_exception_rationale` for validation.

9. Match the strongest compatible frozen scene to each template pair
   independently. Preserve input order and never alter or swap templates. Reuse
   the strongest scene concept whenever it remains the best fit, but assign a
   distinctly worded frozen variant to each event. Do not choose a weaker visual
   relationship merely to force a different narrative. For each effect, write a
   purposeful action label that is natural in the scene and makes the effect a
   plausible consequence. Privately complete: “When the player [label],
   [effect] follows because ___.” Require a concrete, scene-grounded answer
   without game terminology. Let the action and resolution carry any new
   consequence that happens after the player's choice; never pre-seed the prose
   with extra figures or objects to literalize a mechanic. If the test fails,
   revise the label, resolution, variables, or scene assignment; never revise
   the frozen prose merely to distinguish it from another event.

10. Write a 5–10 word `resolution` for each action. Show the immediate response
    to the player's act and bridge naturally into the displayed effect without
    restating it. For example: `Call Down Its Kin` → `Winged shapes descend
    through the heated sky.` The scene, label, resolution, and effect should
    read as one causal sequence.

11. Calibrate mechanical values against the current game. Before choosing a
   count or essence value, inspect relevant economy, pricing, pool, and effect
   data in the repository. Compare the likely low, typical, and high result of
   each choice. Do not guess a small-looking number in an economy whose units
   operate at a different order of magnitude.

12. Compare all five designs using the contract rubric, then assign unique
    ranks. Rank fidelity of impression, evocative force, and mechanical
    connection above literal completeness or ornament. A faithful caption does
    not become excellent prose by naming more visible details. Score mechanical
    connection by the weaker of the two action chains, not their average. Revise
    any chain below 7/10. A shared narrative or visual focus loses no points,
    and textual novelty earns no points beyond satisfying the distinct-wording
    requirement.

13. Sort the five completed event objects by ascending `rank` as a final
    readability pass, so rank 1 appears first and rank 5 last. Keep each event's
    `template_pair_id` and two actions together; sorting events must not alter
    or swap the actions within a template pair.

14. Before validation, scan every `prose`, `label`, and `resolution` for the
    complete card name, distinctive multiword fragments used as names, and
    mechanical repetition of source-name language. Replace those matches while
    preserving independently useful ordinary words. Then write the complete
    event objects to JSON, validate them, and fix every error regardless of
    output mode:

   ```bash
   python3 .llms/skills/delve/scripts/validate-delve.py \
     --input <request.json> --output <events.json>
   ```

15. Emit the validated result in the selected output mode. In JSON mode, emit
    the bare JSON list with no Markdown fence or surrounding commentary. In
    display mode, including successful test mode, render only the Markdown
    structure specified in **Output modes**; do not expose the underlying
    design metadata.

## Narrative standards

- Write in second-person present tense. The interface already establishes that
  the player entered the card, so begin inside the moment.
- Treat every `prose` field as the reader's first glimpse of an independent
  scene. Introduce material subjects clearly, but let the sentence lead with an
  atmosphere, action, comparison, or sensory impression when that creates a
  stronger entrance. Use `a` or `an`, not `one`, when directly introducing a
  singular subject. A definite or possessive phrase may open the line when its
  referent is immediately clear from the same image and sentence; reject only
  genuine ambiguity, not poetic sequencing.
- Keep the entire `prose` field near 10–15 words and never above 20. Use more
  than one sentence only when the extra sentence adds real value.
- Describe a scene, not a miniature quest or an illustrated reward. Establish
  what the player encounters and how the moment feels to inhabit. Atmosphere
  may arise from supported scale, posture, motion, stillness, light, texture,
  distance, or sensory pressure. Do not diagnose a depicted subject's private
  emotions or dictate a precise player emotion. Nothing needs to be wrong,
  threatened, requested, or unresolved. Keep game terms such as card, deck,
  draft, purge, essence, dreamsign, and transfiguration out of the prose.
- Treat the artwork as the source of truth for every material element in the
  prose, not the required surface form of each clause. Select, omit, compress,
  compare, and recast visible evidence freely. If the art shows a lone figure,
  keep the figure alone; do not add a column, crowd, companion, or hidden
  population to service a Character effect.
- Use concrete anchors as a launch point rather than a destination. The line
  should perform an imaginative transformation: make scale alter the apparent
  world, let stillness exert pressure, let a visible form suggest a symbol, or
  use rhythm and charged verbs to make motion immediate. A reader should gain
  an experience that a literal inventory cannot provide.
- Reject caption-shaped prose even when it is specific, spatially accurate, and
  written in second person. Naming a subject, its equipment, its position, a
  larger subject, and the setting still produces alt text unless the language
  changes how the composition feels.
- Prefer “A vast bird bows toward you, and silence bridges the difference” over
  a complete report of the bird's posture and distance. `Silence bridges the
  difference` is a supported imaginative consequence of visible scale and
  stillness; it need not be an object in the frame. Reject a figure of speech
  only when it is generic, incoherent, or smuggles in a new material fact.
- Use these caption-regression comparisons as a quality floor:
  - Reject “You watch two backpacked travelers face a colossal horse and mounted
    silhouette overhead.” Prefer “Two travelers shrink to punctuation beneath a
    horseman vast enough to command the sky.”
  - Reject “A lone gunman stands above you, outlined by a luminous triangle amid
    smoke.” Prefer “A radiant triangle burns through the smoke, making a solitary
    gunman seem summoned.”
  - Reject “You face a vast skull-headed figure; its hanging lantern nearly fills
    the space between you.” Prefer “A lantern hangs like a captured sun beneath a
    towering death-mask.”
  - Reject “A crouched archer separates you from a colossal wolf advancing
    through burning grass.” Prefer “A crouched archer faces a wolf so vast the
    burning field feels suddenly narrow.”
- Do not optimize for different compositions or sensory focuses across the five
  scenes. Every `prose` field must nevertheless have distinct wording. Rephrase
  a shared imaginative thesis through syntax, reader position, or a different
  transformation of supported details, and keep each version at least as
  evocative, faithful, and mechanically useful.
- For an Event card, foreground the depicted action or charged instant implied
  by its name and ability. Ask what is being prevented, completed, revealed,
  broken, escaped, or otherwise changed in the frame, and capture the felt
  meaning of that instant before cataloguing secondary scenery. The ability
  helps interpret what the image means; it does not authorize a literal rules
  paraphrase or an unsupported material event.
- Extrapolate immediate sensory and imaginative consequences strongly supported
  by the image: heat from visible fire, pressure from colossal scale, a hush
  implied by stillness, a horizon that seems claimed, or a field that feels too
  small. Do not add material subjects, props, architecture, terrain, weather,
  history, or events outside the frame. A resolution may introduce a plausible
  material response after the player acts; the initial prose may not anticipate
  that response.
- Use these art-fidelity regression checks:
  - For art showing a lone twin-bladed warrior above burning ruins, prefer “A
    twin-bladed warrior holds the ruined street above you while cinders climb.”
    Reject “A weary column gathers beneath a warrior” when no column appears.
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
- Choose exact cards, dreamsigns, predicates, and other variables for three-way
  fit: they must suit the depicted world, the label-and-resolution chain, and
  the deck strategy. Reject a named reward that is mechanically useful but
  narratively unrelated. In particular, select a thematically resonant
  dreamsign rather than forcing an arbitrary dreamsign into the narrative.
- Invent content only for explicit `$CUSTOM_CARD` or `$CUSTOM_DREAMSIGN`
  templates. Give custom content a new UUID and the complete structured record
  required by the contract. Custom card names describe archetypes rather than
  proper-named individuals.
- Record restrictions for `$DECK_CARD`, `$OFFERED_CARD`, `$STARTER_CARD`, or
  other special variables in `selection`. Omission means unrestricted and is
  the standard `none` choice.
- Write `effect_text` as readable display copy with all placeholders and special
  tokens resolved. Keep the exact template and structured values authoritative.
- Choose conservative values when balance evidence is incomplete, but keep
  them on the live system's scale. Reject an option pair with an obvious
  universal best choice.
- Never revise frozen prose to explain an effect. If a scene and pair cannot
  support two causal label-and-resolution chains, assign another compatible
  frozen scene to that pair; that scene may already be used by another pair.
