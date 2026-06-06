---
name: art-categorize
description: Categorize a piece of card art (landscape/abstract, event, or character — with a character subtype), invent an evocative card name, and write a one-sentence poetic narrative. Use when sorting art, tagging images, or building an art catalog. Triggers on art categorize, categorize art, classify image, tag art, art type, character subtype.
---

# Art Categorization Skill

You are an expert visual cataloguer. Given a single piece of art, you produce a
structured JSON record with three things:

1. **Categorization** — what kind of art this is, and (for characters) which
   subtype.
2. **Card name** — a short, evocative name that contains no banned common word.
3. **Narrative** — one evocative, poetic sentence about *who this person is* or
   *what this event is*. No game mechanics, costs, rules, or jargon.

This skill is purely descriptive. Ignore any notion of game rules, costs,
tides, spark, or mechanics — those are out of scope.

# Phase 0: Load the Art

The user will provide either a direct image path or an image ID. For an ID, use
the lookup script to resolve the path and a filename-derived description:

```bash
python3 .llms/skills/art-categorize/art-lookup.py <image_id>
```

**You must actually view the image.** Use the Read tool on the file path (or
attach it as a `local_image` / open it with `view_image`). The filename
description is a hint only. If the image cannot be read for any reason
(permission denied, file not found, etc.), STOP immediately and report the
error — do not classify from the description text alone.

# Phase 1: Categorize the Art

Assign exactly one top-level category.

| Category | The art is... |
|---|---|
| **Landscape/Abstract** | A wide wilderness or urban vista with a sense of scale and openness, OR an abstract texture, pattern, color field, or light effect with no discernible subject. |
| **Event** | A scene, action, or moment that is not a single character and not a landscape — a ritual, an explosion, an interior, a group/crowd, two figures in conflict, a structure, an artifact at center frame. |
| **Character** | A single figure — person, creature, animal, monster, robot — as the clear primary subject of the frame. |

### Tie-breaking rules

- **Figure + dominant object/structure:** If a lone figure is clearly secondary
  to a larger subject (a portal, monument, explosion, artifact, vehicle),
  categorize by the dominant element. A person dwarfed by a shattering monolith
  is an **Event** (the shattering). A person holding a glowing artifact at center
  frame is a **Character** (the person).
- **Small figure in a vast scene:** If the figure mainly provides scale or a
  vantage point and the art is about the scene, it is an **Event** (or
  Landscape if it reads as a vista), not a Character.
- **Group scenes** (armies, crowds, flocks) are always **Events**, never
  Characters — a Character must be a single primary figure.
- **Two figures in conflict** are an **Event** — the confrontation is the
  subject. This requires two *peer* figures opposing each other. A secondary
  figure that merely gives *scale* to a dominant creature (a tiny diver beside a
  massive ray) keeps it a **Character**.
- **Mount or companion animal:** A human with a horse, wolf, familiar, or other
  mount/companion is a **Character** when the human is clearly the protagonist —
  the animal is companionship, not a second peer figure. Do not invoke the
  "two figures" or "group scene" rules for a protagonist-plus-mount/companion.
- **Single protagonist mid-action:** A lone figure performing an action —
  aiming, casting, charging, leaping, lifting — is still a **Character**, not an
  Event. The action defines their *subtype* and narrative, not their category.
  Reserve **Event** for actions with no single clear protagonist (an explosion,
  a ritual, a crowd) or for two peers in mutual conflict. A figure acting
  against an unseen or offscreen target is a Character.
- **Interior scenes** (rooms, corridors, vehicle cabins) without a central
  figure are **Events**, not Landscapes.
- **Close-ups** of a single tree or rock are not Landscapes — Landscapes need
  openness and scale.

# Phase 2: Character Subtype (Characters only)

If the art is a **Character**, assign exactly one subtype. Work down this list
and take the first that clearly fits. Be decisive but honest — when genuinely
torn between two, pick the more specific one and note the alternative in your
reasoning.

| Subtype | The figure is... |
|---|---|
| **Ancient** | A monster *larger than human* — a towering or colossal creature. |
| **Spirit Animal** | A natural animal (wolf, bear, eagle, fox, deer…) or an animal-like magical creature. Unambiguously an animal, not a humanoid. |
| **Child** | A *clearly* small child — childlike proportions (large head-to-body ratio, short limbs). Not merely a short adult. |
| **Synth** | A mechanical or robotic character. |
| **Survivor** | A post-apocalyptic figure — gas mask, hazmat gear, improvised armor, ruined/wasteland surroundings, radiation motifs, scavenger aesthetic. |
| **Outsider** | An ethereal or smoky figure: a hooded face lost in shadow, a body glowing with inner light, a human trailing black tendrils, or any obvious sign of non-human status. |
| **Monster** | A classical monster at roughly *human scale* (not larger-than-human — that's Ancient). |
| **Musician** | A human or humanoid carrying or playing an instrument. |
| **Tinkerer** | A human interacting with inanimate machinery, gears, or devices. |
| **Explorer** | A person *actively venturing into* a fantastical environment, often with travel gear (pack, lantern, climbing/diving equipment). |
| **Warrior** | A fighter or combat-ready figure — wielding a weapon or magic in a martial way, wearing armor, in a martial pose, or mid-combat. Any suggestion of combat aptitude or fantasy weaponry goes here. |
| **Mage** | A magical human who is *clearly not violent*. Prefer **Warrior** at the slightest hint of combat aptitude or fantasy weaponry. |
| **Visitor** | An adult human who fits none of the above. The fallback. |

### Subtype precedence notes

- **Ancient vs. Monster:** scale decides — larger-than-human → Ancient,
  human-sized → Monster.
- **Mage vs. Warrior:** if there is *any* whiff of combat — a blade, a battle
  stance, armor, an offensive spell — choose **Warrior**. Reserve **Mage** for
  serene, scholarly, clearly non-violent magic.
- **Synth vs. Tinkerer:** if the character *is* mechanical → Synth; if a flesh
  human is *working on* machinery → Tinkerer.
- **Explorer vs. Visitor:** Explorer requires an active sense of venturing into
  somewhere new (gear, threshold, descent). A plain adult human standing in an
  ordinary setting is a Visitor.

# Phase 3: Read the Art's Story

Briefly (to yourself, in your reasoning) note the subject, setting, palette, and
mood. Then distill it into **one** evocative sentence answering:

- For a **Character:** Who is this person/creature? What is their bearing, their
  mood, their moment?
- For an **Event:** What is happening here? What does it feel like to witness?
- For **Landscape/Abstract:** What place or sensation is this?

The narrative must be **poetic and evocative**, in pure story/imagery terms.
Describe only what is actually depicted — if an element is ambiguous (floating
specks could be dust, ash, or pollen), keep it neutral rather than committing to
a specific reading. **No game vocabulary** — no costs, spark, tides, mechanics,
or "draw/dissolve/kindle" anything.

Examples of the right voice:
- "A hooded ferryman drifts at the edge of the lamplight, his face a hollow no
  torch will ever fill."
- "The mountain splits along a seam of molten gold, and for one breath the whole
  valley holds its silence."
- "A small girl cups a sleeping firefly as if it were the last warm thing left
  in the world."

# Phase 4: Name the Art

Invent a short, evocative card name.

**Hard constraints:**
- **Max 25 characters.**
- **No banned common word.** The name may not contain *any* word listed in
  `common_words.txt` (case-insensitive, word-level — "Wanderer's" counts as
  "wanderer"). Validate every candidate:

  ```bash
  python3 .llms/skills/art-categorize/check-name.py "First Name" "Second Name" "Third Name"
  ```

  Pass all your candidates in a single call. Each output line is the candidate
  followed by `PASS`, or `FAIL: contains banned word(s): …`. Only keep a name
  that prints `PASS`.

  **Pre-filter against the banned list below** so your candidates avoid these
  words *before* you validate — this is a convenience snapshot to reduce wasted
  candidates, but `check-name.py` (and `common_words.txt`) remain authoritative.
  If the two ever disagree, trust the script. Banned words (each also bans its
  possessive/plural — "wanderer" bans "Wanderer's"):

  > forgotten, light, reclaimer, veil, echoes, spirit, titan, ascendant, call,
  > eternal, herald, keeper, last, paths, pilgrim, seer, silent, sovereign,
  > wanderer, abomination, arbiter, architect, ashen, aurora, avatar, blade,
  > channeler, cosmic, defiant, dread, duelist, enforcer, fallen, guardian,
  > holdout, infernal, leviathan, lost, memory, oblivion, radiant, revenant,
  > seeker, sentinel, shadow, sunset, through, twilight, vanguard, verdant,
  > void, voyager, wasteland, abyss, abyssal, adrift, alpha, ancient, angler,
  > apocalypse, arc, arrival, astral, avenger, beacon, behemoth, break,
  > burning, burst, caller, carrion, cascade, catalyst, celestial, champion,
  > charger, clockwork, collapse, commander, conduit, convergence, crumbling,
  > delver, denial, detonation, dreamer, dreaming, echo, eclipse, edge,
  > endless, ethereal, explorer, fell, field, flames, forge, forsaken,
  > fractured, fury, gate, genesis, glimpse, grim, guide, horizon, horror,
  > immolate, iron, ironclad, key, liminal, lone, lord, marrow, moment,
  > moonlit, nightmare, nocturne, old, oracle, passage, path, pathfinder,
  > penitent, portal, power, prism, prophet, protocol, prowler, pulse, rebirth,
  > reckoning, reflection, requiem, rest, reunion, rider, rift, ripple, rite,
  > ritualist, ruin, sage, sanctum, scorched, scout, shadowcaller, shadows,
  > shatter, shepherd, skies, skyline, smoldering, specialist, specter, stag,
  > starfall, stargazer, starlight, stoneborn, striker, summons, sundown,
  > surge, tides, trailblazer, traveler, twin, tyrant, urban, vessel, veteran,
  > virtuoso, vision, vortex, voyage, wake, warden, weaver, witness, worlds
- **No proper names.** Keep the dreamlike, anonymous feel — use roles, titles,
  descriptors, or abstract phrases, never invented character names ("Kael",
  "Voss").
- **Do not start the name with "The".**

**Guidance:**
- For a Character, name them as a *person/creature* (a role, title, or
  descriptor), not as an object or an action happening around them.
- Prefer poetic and suggestive over literal. Evoke the *primary subject* and its
  mood — not minor background details or ambiguous particles.
- Generate at least 3 candidates, validate each with `check-name.py`, and pick
  the strongest passing one.

Common name shapes: `[Adjective] [Noun]`, `[Compound] [Noun]`, `[Noun] of
[Noun]`, single word, `[Possessive] [Noun]`, `[Noun] [Verb]`.

# Phase 5: Output

Emit a single JSON object and nothing else after it. Schema:

```json
{
  "image": "<image id or path, if known; otherwise omit>",
  "category": "Landscape/Abstract" | "Event" | "Character",
  "subtype": "<one of the Phase 2 subtypes, or null for non-characters>",
  "card_name": "<evocative name, ≤25 chars, passes check-name.py>",
  "narrative": "<one evocative, poetic sentence — no game mechanics>"
}
```

Rules for the fields:
- `subtype` is `null` for `Landscape/Abstract` and `Event`.
- `card_name` MUST have passed `check-name.py` (no banned common word) and be
  ≤25 characters.
- `narrative` is exactly one sentence and contains no game vocabulary.

Before returning, double-check: did you actually *view* the image, does the
category match what you saw, and did the final name print `PASS`?

**Category/narrative reconciliation:** If your name and narrative describe a
*person or creature* (a role, a "lone rider," "a hooded ferryman"), the category
should almost certainly be **Character** — a single protagonist doing something,
even something dramatic, is not an Event. If you've written a character-style
name or narrative but labelled the art Event or Landscape, stop and re-decide the
category before emitting. The two must agree.
