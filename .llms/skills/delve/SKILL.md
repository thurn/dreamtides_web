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

4. Read the visual story. Privately note concrete subjects, setting, motion,
   scale, mood, and relationships. If a claim depends on exact color, measure
   the image rather than trusting visual color perception.

5. Read the card as an archetype, not a named individual. Dreamtides card names
   identify kinds of beings or manifestations: the art depicts *a* blazing
   emberwing, not a person named Emberwing. Do not invent proper names,
   identifiable faces, fixed biographies, named locations, or offscreen lore.
   Refer naturally to “an emberwing” or “the emberwing.”

6. Set the templates aside and build a private story bank from the art, card
   name, and archetypal identity. Draft at least eight concrete premises. Give
   each premise identifiable actors, a comprehensible situation, an unresolved
   tension, and two plausible things the player could do. Vary the engine of
   the scene: trust, caretaking, misunderstanding, obstacle, request, discovery,
   or danger. Do not use imminent catastrophe as the default source of stakes.
   Do not use template quantities, operations, or reward concepts as story
   ingredients.

7. Apply the story-only gate to every candidate. Hide the templates and ask:
   “Is this a specific, intelligible vignette? Would anyone want to know what
   happens next?” Reject premises that only sound dreamlike, depend on symbolic
   word substitution, or exist to disguise a game operation.

8. Infer deck intent from the ability and canonical metadata. Ask what choosing
   this card suggests the player is building toward. Inspect repository tags
   and canonical content when useful. Favor values, predicates, and real UUID
   references that support that plan. Both choices should remain useful to the
   likely deck: one may deepen its synergy while the other offers flexibility,
   conversion, or risk management.

9. Match the five strongest story premises to the five template pairs. Preserve
   input order and never alter or swap templates. Choose two labels that are
   genuine responses to the story. Attach the mechanics afterward. A reward
   may follow a choice by loose thematic association; it does not need to be a
   literal consequence or be explained by the prose.

10. Calibrate mechanical values against the current game. Before choosing a
   count or essence value, inspect relevant economy, pricing, pool, and effect
   data in the repository. Compare the likely low, typical, and high result of
   each choice. Do not guess a small-looking number in an economy whose units
   operate at a different order of magnitude.

11. Compare all five designs using the story-first contract rubric, then assign
   unique ranks. Revise weak stories rather than adding mystical language to
   conceal them. A mechanically noncredible choice still requires revision,
   but mechanical literalism never raises a story score.

12. Validate the JSON, fix every error, and emit the JSON list with no Markdown
   fence or surrounding commentary:

   ```bash
   python3 .llms/skills/delve/scripts/validate-delve.py \
     --input <request.json> --output <events.json>
   ```

## Narrative standards

- Write in second-person present tense. The interface already establishes that
  the player entered the card, so begin inside the moment.
- Keep the entire `prose` field near 10–15 words and never above 20. Use more
  than one sentence only when the extra sentence adds real value.
- Tell a small story, not an illustrated reward. Establish who is present, what
  is happening, and why the moment is unresolved. Keep game terms such as card,
  deck, draft, purge, essence, dreamsign, and transfiguration out of the prose.
- Prefer concrete nouns, observable actions, and simple causal relationships.
  Surreal events are welcome when their internal logic is clear.
- Extrapolate beyond the frame when useful. Stay faithful to the subject,
  relationship, and mood rather than mechanically inventorying visible details.
- Allow wonder, melancholy, danger, uncanniness, and mythic intensity. Avoid
  graphic harm, cruelty, modern slang, mood-breaking comedy, and obvious
  good-versus-evil framing.
- Make each choice label a 2–4 word narrative act, at most 24 characters. Do
  not paraphrase the reward. Both labels must be meaningful responses to the
  situation even when their mechanical effects are hidden.
- Do not mirror a template's number in the fiction. Four offered cards do not
  imply four figures, sparks, doors, paths, or voices in the scene.
- Do not translate mechanics into mystical synonyms. Purging is not erasing a
  footprint or burning a memory; speed is not quickening a shadow; essence is
  not automatically flame; random rewards are not scattered fragments.
- Avoid vague dream-fantasy filler—unexplained sparks, shadows, echoes, threads,
  paths, whispers, fragments, and transformations—unless each is a concrete,
  story-bearing part of this particular scene.
- Avoid generic decision language such as “awaiting your answer,” “offers two
  paths,” or “asks what you will choose.” Show the predicament itself.
- Prefer distinct premises and story beats across the set, but never sacrifice
  clarity or specificity merely to make the stories different.
- Across the final five, use no more than two premises built chiefly around an
  approaching fire, storm, predator, pursuer, collapse, or similar external
  emergency.

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
- Never revise good prose to explain an effect. If a story and pair cannot
  coexist without forced symbolism, assign that story to another pair or accept
  a looser association between choice and reward.
