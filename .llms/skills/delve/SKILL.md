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

6. Infer deck intent from the ability and canonical metadata. Ask what choosing
   this card suggests the player is building toward. Inspect repository tags
   and canonical content when useful. Favor values, predicates, and real UUID
   references that support that plan. Both choices should remain useful to the
   likely deck: one may deepen its synergy while the other offers flexibility,
   conversion, or risk management.

7. Calibrate mechanical values against the current game. Before choosing a
   count or essence value, inspect relevant economy, pricing, pool, and effect
   data in the repository. Compare the likely low, typical, and high result of
   each choice. Do not guess a small-looking number in an economy whose units
   operate at a different order of magnitude.

8. Design one independent encounter for each pair, preserving input order.
   Never alter or swap its two templates. Give the encounter one immediate
   situation with two credible responses of roughly comparable value.

9. Compare all five designs. Score story-to-mechanics coherence and archetype
   fit using the contract rubric, then assign unique ranks. Coherent mapping of
   the supplied mechanics matters more than making all five premises radically
   different. A mechanically noncredible choice caps both component scores at
   6 until revised. Revise the highest-potential candidates before finalizing.

10. Validate the JSON, fix every error, and emit the JSON list with no Markdown
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
- Set up a genuine tension without listing the choices. Keep game terms such as
  card, deck, draft, purge, essence, dreamsign, and transfiguration out of the
  prose.
- Extrapolate dreamlike hazards, rituals, transformations, and stakes only when
  grounded by at least two concrete visual anchors.
- Allow wonder, melancholy, danger, uncanniness, and mythic intensity. Avoid
  graphic harm, cruelty, modern slang, mood-breaking comedy, and obvious
  good-versus-evil framing.
- Make each choice label a 2–4 word narrative act, at most 24 characters. Do
  not paraphrase the reward. The label and mechanic should form clear
  metaphorical cause and effect.
- Both labels must answer the same situation. Each effect should feel natural
  in hindsight even though the prose contains no rules exposition.
- Prefer distinct premises and story beats across the set, but prioritize the
  fit between each fixed template pair and its encounter.

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
  universal best choice. Do not let evocative prose conceal a dead option.
