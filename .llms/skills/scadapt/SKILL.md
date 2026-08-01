---
name: scadapt
description: Use when adapting Synergy Cube / Magic the Gathering archetype, card, and card-interaction content into Dreamtides. Triggers on scadapt, adapt archetypes, translate cube content, calebgannon, Powered Synergy Cube, MTG to Dreamtides, dreamtides archetypes, card pool mapping.
---

# Synergy Cube → Dreamtides Adaptation (scadapt)

Adapt archetype writeups, card references, and descriptions of card
interactions from Caleb Gannon's Powered Synergy Cube (Magic: The Gathering)
into Dreamtides. The job is **not** translation word-for-word — it is
re-deriving how each idea works under Dreamtides rules using the actual
Dreamtides card pool.

## Sources and Targets

| Role | Location |
|------|----------|
| Source prose (MTG) | `docs/calebgannon/` |
| → overview of all archetypes | `docs/calebgannon/archetypes.md` |
| → per-color deep dives | `docs/calebgannon/{white,blue,black,red,green}-archetypes.md` |
| → cube design philosophy | `docs/calebgannon/everything-i-have-learned-about-cube-design.md` |
| Adapted output (Dreamtides) | `docs/cards2/` |
| → worked example to match | `docs/cards2/dreamtides_archetypes.md` |
| The card pool | `data/tabula/cards.toml` |
| Authoritative Dreamtides rules | `docs/battle_rules/battle_rules.md` |
| Card text formatting rules | `docs/cards2/style_guide.md` |

**Always read `docs/battle_rules/battle_rules.md` before adapting.** It is the
authoritative definition of every Dreamtides mechanic. Re-analyze combos against
those rules rather than assuming the MTG interaction carries over unchanged.

## The Card Bridge: `mtg-name`

Each card in `data/tabula/cards.toml` carries an `mtg-name` field naming the
Synergy Cube card it was adapted from. This is the bridge between the two pools.

```toml
[[cards]]
name = "Spirit Bond"
mtg-name = "Craterhoof Behemoth"
rendered-text = "Until end of turn, allied characters gain unstoppable and +X✦ where X is the number of allied characters."
```

Two critical facts about this mapping:

- **It is many-to-one.** Several Dreamtides cards can share one `mtg-name`
  (e.g. `Jeskai Ascendancy` → Gearwright, Shadow Soloist, Moonlit Dancer; each
  is a distinct Dreamtides take on the same source card). When going MTG →
  Dreamtides you often have **multiple candidates**; pick the one whose
  `rendered-text` best matches the role the source prose describes, or cite
  several if the archetype uses more than one.
- **Dreamtides → MTG is unique.** A given Dreamtides card names exactly one
  `mtg-name`, so reverse lookups are unambiguous.

### Build the lookup

Dump all name ↔ mtg-name pairs:

```bash
grep -E '^(name|mtg-name) =' data/tabula/cards.toml | paste - -
```

Extract full text (type, cost, spark, rendered-text) for a set of card names —
do this to **verify the Dreamtides card actually does what you're about to
claim** before writing prose about it:

```bash
python3 - <<'PY'
import re
toml = open('data/tabula/cards.toml').read()
blocks = toml.split('[[cards]]')
want = {"Celestial Reverie", "Wake the Fallen", "Reclaimer of Lost Paths"}  # edit
def field(b, k):
    m = re.search(r'\n'+re.escape(k)+r' = (.*)', b); return m.group(1) if m else "?"
def rtext(b):
    m = (re.search(r'rendered-text = """(.*?)"""', b, re.S)
         or re.search(r"rendered-text = '''(.*?)'''", b, re.S)
         or re.search(r'rendered-text = "(.*?)"\n', b, re.S))
    return m.group(1).strip() if m else "?"
for b in blocks:
    m = re.search(r'\nname = "(.*?)"', b)
    if m and m.group(1) in want:
        print(f"### {m.group(1)} | {field(b,'card-type')} {field(b,'subtype')} | "
              f"cost {field(b,'energy-cost')} | ✦{field(b,'spark')}")
        print("   " + rtext(b).replace("\n", "\n   "))
PY
```

### Verify every reference before committing

After writing, confirm every Dreamtides card name you cited exists in the pool.
A name that doesn't resolve is a bug.

```bash
python3 - <<'PY'
import re
names = set(re.findall(r'\nname = "(.*?)"', open('data/tabula/cards.toml').read()))
used = ["Spirit Bond", "Outsiders"]  # paste the card names referenced in your doc
print("MISSING:", [u for u in used if u not in names])
PY
```

## Archetype Map

The standing archetype correspondences. Use these as defaults; an adaptation may
introduce a new name when Dreamtides diverges enough to warrant it.

| Synergy Cube | Dreamtides |
|---|---|
| Elves | Spirit Animals |
| Ninjas | Outsiders |
| Artifact Aggro | Warrior Aggro |
| Spells | Events |
| Zombies | Survivors |
| Discard / Madness | Discard / "Madness" (cards that gain reclaim when discarded) |
| Sacrifice | Abandon |
| Lands | "Characters with cost 2● or less" synergy |
| Blink | Blink / repeat materialized triggers |
| Storm | Storm / "for each card you've played this turn, do X" |
| Glimpse Combo | Celestial Reverie Combo |
| Artifact Combo | Warrior Combo |
| Persist Combo | Reclaim Combo (Reclaim 0● + "cards you reclaim are not banished when they leave play") |
| Second Sunrise Combo | Wake the Fallen / Shadow March Combo |
| Enduring Renewal | Fading Farewell |
| Untap Combo (Intruder Alarm / Ascendancy) | Cindermarch / Shadow Soloist Combo |

If a source archetype isn't in this table, infer the closest Dreamtides
equivalent from the card pool and say so explicitly in the writeup. If you
genuinely cannot work out how a combo functions from the card text, ask the
maintainer rather than guessing — they will walk through it.

## Mechanic Map

The conceptual rules-level translations that make adaptations accurate. MTG
mechanics rarely survive intact; map the *function*, not the wording.

| MTG concept | Dreamtides equivalent |
|---|---|
| Mana / lands | Energy (●) from the shared Dreamwell; no land cards |
| Creature | Character (spark ✦ only — no toughness/health) |
| Power | Spark (✦); challenges compare spark, lower one dissolves |
| Sorcery / instant | Event; "instant speed" → Fast (❖) / Interrupt (❖❖) |
| Enters-the-battlefield (ETB) | ▸Materialized trigger |
| Flicker / blink | Rematerialize (re-fire ▸Materialized) |
| Sacrifice | Abandon (your own character → void; fires ▸Dissolved) |
| Dies / death trigger | ▸Dissolved / "when an ally is dissolved/leaves play" |
| Graveyard | Void |
| Exile | Banish |
| Flashback / "cast from graveyard" | Reclaim (play from void); Reclaim 0● = free |
| Madness ("cast when discarded") | "When you discard this card, it gains reclaim" |
| Summoning sickness | Exhausted (characters enter exhausted unless Awakened) |
| Untap / vigilance | Awaken (clears exhausted) |
| Tap ability ({T}) | ☪ exhaust cost |
| Hexproof / ward | Veil N● (opponent pays N● extra to target) |
| Counterspell | Prevent (always an Interrupt) |
| Mill | Erode (top N of deck → void); empty deck → Fatigue |
| Tutor | Discover (look at 3 matching, take 1) |
| Scry | Foresee N |
| Token | Figment (created character; stacks by type) |
| Damage to face / life total | Victory points (⍟); scoring spark, drains, Fatigue |
| Big mana ramp into fatties | Usually re-expressed as wide boards or "cost 2● or less" value, since the curve tops out low |

Notable structural differences to respect:

- **Positional combat.** Front-rank characters challenge; back-rank are safe.
  Support comes from the back rank. "Evasion" and "going wide" read differently
  than in MTG — wins come from unpaired challengers scoring spark as ⍟.
- **No targeted face damage.** Burn/aggro plans convert to scoring spark,
  Abandon-for-⍟ drains (Blood Artist analogs), or Fatigue via Erode.
- **Dreamwell, not lands.** "Keep a low land count," "fetchlands," and
  mana-screw discussion have no direct analog. Re-frame around energy curve and
  the cost-2●-or-less density instead.
- **Figment stacks** absorb spark top-down and count toward the 9-character
  board cap — relevant whenever the MTG version made tokens.

## Workflow

1. **Pick the scope.** Identify the card pool / archetype combination to adapt
   — e.g. one section of `archetypes.md`, or a whole color file. State which
   source file and section.
2. **Read the rules.** Read `docs/battle_rules/battle_rules.md` (at least the
   keywords and turn-structure sections) so the re-analysis is grounded.
3. **Map the archetype** via the Archetype Map above.
4. **Map each referenced card** MTG → Dreamtides through `mtg-name`. Where the
   mapping is many-to-one, choose the candidate(s) whose `rendered-text` matches
   the role in the source prose.
5. **Verify card text.** Pull the `rendered-text` of every card you'll cite and
   confirm it actually performs the function the prose assigns it. Combos
   especially must be re-derived from the real Dreamtides text — do not assume
   the MTG loop transfers.
6. **Re-analyze under Dreamtides rules.** Apply the Mechanic Map. Rewrite the
   strategy in terms of energy, exhaust/awaken, abandon, reclaim, figments, and
   positional challenges. Cut MTG-specific texture (colors, lands, life total)
   that has no Dreamtides meaning.
7. **Write in the target style** (see below), matching the existing example.
8. **Verify references** with the missing-name check, then run the repo checks
   and commit.

## Re-deriving Combos (worked patterns)

The combos are where literal translation fails most often. Confirm the loop from
real card text. Examples already adapted in `dreamtides_archetypes.md`:

- **Reclaim Combo (Persist):** Reclaim 0● bodies (Starrunner, Torn Circuit
  Feeder, Enginespeaker) + a static that strips the reclaimed-banish rule
  (Reclaimer of Lost Paths / Titan of Forgotten Echoes: "Cards you reclaim are
  not banished when they leave play"). A reclaimed card normally banishes on
  leaving play; the static sends it to the void instead, so an abandon outlet
  loops it. Closed by a drain (Silent Avenger) or erosion (Soulrender).
- **Fading Farewell (Enduring Renewal):** Fading Farewell returns allies to hand
  when they dissolve this turn; abandon a 0● body for energy (Conduit of Ashes),
  it returns, replay free, abandon again — net-positive loop, closed by a drain.
- **Wake the Fallen / Shadow March (Second Sunrise):** mass-return effects bring
  back everything that dissolved this turn, re-firing ▸Materialized/▸Dissolved.
  Pair with abandon outlets and Zuran-Orb-style engines (The Forsaker, Ruptured
  Dynamo).
- **Cindermarch / Shadow Soloist (Untap):** awakening replaces untapping.
  Cindermarch awakens the board on each materialize; Shadow Soloist awakens it on
  each event. Net-energy ☪ abilities + free producers drive the loop.
- **Celestial Reverie (Glimpse):** "when you play a character, draw a card" +
  self-bouncing bodies made free (Nexus Wayfinder, Heavenward Penitent) +
  energy (Melodist of the Finale) → draw/energy loop; finish on Worlds Await
  (empty-deck win) or Hatching Ground (Fatigue).

## Writing Style

- Match the structure and register of `docs/cards2/dreamtides_archetypes.md`
  and the source `archetypes.md`: a short framing paragraph per archetype,
  concrete card names woven into prose, overlap noted across archetypes.
- Use Dreamtides symbols and notation per `docs/cards2/style_guide.md`: `●`,
  `✦`, `⧗`, `⍟`, `☪`, `❖`, glued to their numbers (`1●`, `+2✦`).
- Refer to Dreamtides card names, never MTG names, in the adapted prose. (The
  `mtg-name` linkage lives in the data, not the writeup.)
- **Documentation describes the current system.** Do not write what the system
  "no longer" does, or contrast against removed/MTG behavior with "unlike",
  "instead of in Magic", etc. Write the Dreamtides state directly.
- Drop color identity, mana-base talk, and life-total framing unless they have a
  real Dreamtides analog.

## Pitfalls

- **Claiming a card does X without reading its `rendered-text`.** The adaptation
  often changed the effect; always verify.
- **Forcing a one-to-one card mapping** when the source card became several
  Dreamtides cards — cite the right variant(s).
- **Copying an MTG combo loop** that doesn't hold under reclaim/abandon/awaken
  rules. Re-derive every loop.
- **Citing a card that doesn't exist.** Run the missing-name check.
- **Leaving MTG residue** — colors, lands, "tap," "graveyard," life total — in
  Dreamtides prose.

## Acceptance

- Read `battle_rules.md`; combos re-derived from real card text.
- Every cited Dreamtides card resolves in `cards.toml`.
- Symbols and tone match `style_guide.md` and the existing example.
- Per `AGENTS.md`: commit with a detailed description, then `git push`
  immediately. Do not print a summary of changes.
