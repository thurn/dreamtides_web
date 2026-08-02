---
name: delve
description: Design and rank five Dreamtides Delve narrative encounters from a canonical card, its full-size artwork, and five pairs of mechanical event templates. Use when creating Delve event prose, narrative choice labels, template variables, custom Delve rewards, or card-specific encounter JSON.
---

# Delve Encounter Design

Create five independent, production-ready encounters that make a player feel
they have entered the dream depicted by one card. Return strict JSON only.

## Required input

Require one JSON request containing a card and exactly five template pairs. Read
[`references/contracts.md`](references/contracts.md) before designing or
validating an encounter.

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

4. Read the depicted scene. Privately note concrete subjects, setting, motion,
   scale, posture, distance, mood, sensory atmosphere, and relationships. If a
   claim depends on exact color, measure the image rather than trusting visual
   color perception.

5. Read the card as an archetype, not a named individual. Dreamtides card names
   identify kinds of beings or manifestations: the art depicts *a* blazing
   emberwing, not a person named Emberwing. Do not invent proper names,
   identifiable faces, fixed biographies, named locations, or offscreen lore.
   Prefer ordinary visual descriptions such as “a great bird,” “the
   flame-wreathed creature,” or “a winged shape.” Use the card name only when it
   is the clearest wording. As a default, use it in at most one of the five
   prose fields and omit it entirely when a common description is stronger.
   Do not repeat the card name mechanically in prose or labels.

6. Set the templates aside and build a private scene bank from the art, card
   name, and archetypal identity. Draft at least eight atmospheric tableaux.
   Each should place the player before a specific subject in a particular
   setting and evoke scale, posture or movement, sensory detail, and an implied
   relationship. Vary composition rather than manufacturing plot: distance,
   vantage point, gesture, movement, weather, light, stillness, and the player's
   relationship to the subject. A scene does not need conflict, danger, stakes,
   a dilemma, a request, a problem, a resolution, or unresolved tension. Do not
   use template quantities, operations, or reward concepts as scene ingredients.

7. Apply the scene-only gate to every candidate. Hide the templates and actions,
   then ask: “Does this stand alone as a specific, evocative view of the card's
   world, even if nothing needs fixing? Does it introduce its subjects instead
   of assuming the reader has already seen them?” Reject scenes that merely
   announce a decision, manufacture a predicament, depend on symbolic word
   substitution, or exist to disguise a game operation.

8. Infer deck intent from the ability and canonical metadata. Ask what choosing
   this card suggests the player is building toward. Inspect repository tags
   and canonical content when useful. Favor values, predicates, and real UUID
   references that support that plan. Both choices should remain useful to the
   likely deck: one may deepen its synergy while the other offers flexibility,
   conversion, or risk management.

9. Match the five strongest scenes to the five template pairs. Preserve input
   order and never alter or swap templates. Choose two labels for natural things
   a person might do in the depicted moment: approach, wait, bow, shield their
   eyes, call out, follow, listen, or watch. The actions are ways of engaging
   with the scene, not solutions to a dilemma. Attach the mechanics afterward.
   A reward may follow an action by loose thematic association; it does not
   need to be a literal consequence or be explained by the prose.

10. Calibrate mechanical values against the current game. Before choosing a
   count or essence value, inspect relevant economy, pricing, pool, and effect
   data in the repository. Compare the likely low, typical, and high result of
   each choice. Do not guess a small-looking number in an economy whose units
   operate at a different order of magnitude.

11. Compare all five designs using the scene-first contract rubric, then assign
   unique ranks. Revise weak scenes rather than adding mystical language to
   conceal them. A mechanically noncredible action still requires revision,
   but mechanical literalism never raises a scene score.

12. Validate the JSON, fix every error, and emit the JSON list with no Markdown
   fence or surrounding commentary:

   ```bash
   python3 .llms/skills/delve/scripts/validate-delve.py \
     --input <request.json> --output <events.json>
   ```

## Narrative standards

- Write in second-person present tense. The interface already establishes that
  the player entered the card, so begin inside the moment.
- Treat every `prose` field as the reader's first glimpse of an independent
  scene. Introduce each subject on first mention with `a` or `an`: “A hovering
  bird...” or “A great bird...” Never begin with an unintroduced definite or
  possessive phrase such as “the hovering bird,” “the great bird,” or “the
  creature's wings.” Use `the` only after the same prose field has established
  that subject. Use `a` or `an`, not `one`, to introduce a singular scene
  element; do not open on an unexplained body part, motion, or consequence.
- Keep the entire `prose` field near 10–15 words and never above 20. Use more
  than one sentence only when the extra sentence adds real value.
- Describe a scene, not a miniature quest or an illustrated reward. Establish
  what the player encounters and how it feels to stand there. The prose may be
  wholly observational; nothing needs to be wrong, threatened, requested, or
  unresolved. Keep game terms such as card, deck, draft, purge, essence,
  dreamsign, and transfiguration out of the prose.
- Prefer concrete nouns, observable actions, and simple causal relationships.
  Surreal events are welcome when their internal logic is clear.
- Extrapolate beyond the frame when useful. Stay faithful to the subject,
  relationship, and mood rather than mechanically inventorying visible details
  or inventing a conflict.
- Allow wonder, melancholy, danger, uncanniness, and mythic intensity. Avoid
  graphic harm, cruelty, modern slang, mood-breaking comedy, and obvious
  good-versus-evil framing.
- Make each choice label a 2–4 word natural act, at most 24 characters. Do not
  paraphrase the reward. Both labels must be plausible ways to engage with the
  scene even when their mechanical effects are hidden; they need not solve or
  resolve anything.
- Treat the card name as an archetype label, not a proper noun or mandatory
  refrain. Prefer varied, concrete descriptions of the visible being or event.
  As a default, mention the source card name in no more than one prose field
  across the set, and avoid it entirely when plain visual language is more
  evocative. Never repeat it in every scene or choice label.
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
- Prefer distinct compositions and sensory moments across the set, but never
  sacrifice clarity or specificity merely to make the scenes different.

## Mechanical standards

- Preserve each `template_id` and exact canonical `template` string.
- Populate every `{placeholder}` in `variables`. Use objective, playable
  predicates from canonical game vocabulary; never invent predicates such as
  “fiery cards.”
- Reference existing cards and dreamsigns with real canonical UUIDs. Resolve
  names only for display. Validate transfiguration names and other fixed content
  against repository sources. Never key, compare, or select cards by name.
- Invent content only for explicit `$CUSTOM_CARD` or `$CUSTOM_DREAMSIGN`
  templates. Give custom content a new UUID and the complete structured record
  required by the contract. Custom card names describe archetypes rather than
  proper-named individuals.
- Record restrictions for `$DECK_CARD`, `$OFFERED_CARD`, `$STARTER_CARD`, or
  other special variables in `selection`. Omission means unrestricted.
- Write `effect_text` as readable display copy with all placeholders and special
  tokens resolved. Keep the exact template and structured values authoritative.
- Choose conservative values when balance evidence is incomplete, but keep
  them on the live system's scale. Reject an option pair with an obvious
  universal best choice.
- Never revise good prose to explain an effect. If a scene and pair cannot
  coexist without forced symbolism, assign that scene to another pair or accept
  a looser association between action and reward.
