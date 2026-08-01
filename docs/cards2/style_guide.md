# Card Text Style Guide — `cards.toml`

This guide is the canonical reference for writing the `rendered-text` field of a
card in `data/tabula/cards.toml`. It defines how every effect is templated so
that the same effect is always written the same way. Mechanics terms used here
(Materialize, Reclaim, Veil, Exhaust, Spark, and so on) are defined in
`docs/battle_rules/battle_rules.md`, which remains authoritative for what each
keyword *does*; this guide governs how that text is *formatted*.

When a choice was open, the resolution adopted below is the one to follow even
where existing cards still differ.

---

## 1. Symbols and notation

Card text uses symbols in place of words wherever a symbol exists. Spell the
concept out only when no symbol applies.

| Symbol | Meaning |
|---|---|
| `●` | Energy |
| `✦` | Spark |
| `⧗` | Counters (stored on a card) |
| `⍟` | Victory points |
| `☪` | Exhaust — an exhaust cost, or the act of exhausting |
| `❖` | Fast (timing marker on an activated ability) |
| `❖❖` | Interrupt (timing marker on an activated ability) |
| `–` | Marker preceding a keyword such as `Reclaim` or `Support` |
| `▸` | Marker preceding a named trigger such as `▸Dawn` or `▸Challenge` |
| `≤` | At most — a cost or spark threshold of that amount or less |
| `≥` | At least — a cost or spark threshold of that amount or more |

### 1.1 Symbol spacing is always glued

A number attaches directly to its symbol, with no space between them:

- Correct: `1●`, `+2✦`, `2✦ radiant figment`, `Veil 2●`, `Store 1⧗`, `gain 1⍟`,
  `≤2●`, `≥3✦`.
- Wrong: `1 ●`, `+2 ✦`, `≤ 2●`.

### 1.2 Variable amounts use `X`

When an amount is determined at resolution, write the symbol against `X`
(`+X✦`, `X⍟`, `X●`) and define `X` in the same sentence with a `where X is …`
clause:

- `Materialize X 1✦ survivor figments, where X is this character's spark.`
- `An ally gains +X✦ where X is the abandoned character's ✦.`
- `Gain X⍟ where X is the stored ⧗.`

---

## 2. Card text layout

### 2.1 One ability per paragraph

Each independent ability occupies its own paragraph. Separate paragraphs with a
single blank line. Within the TOML this is a multi-line string:

```toml
rendered-text = '''
▸Dawn: Gain 1●.

4●, ☪: This character gains +1✦.'''
```

A single ability that runs across two sentences keeps both sentences in one
paragraph, separated by a normal space, not a blank line:

```
When an ally is dissolved, gain 1⍟. Then this character gains +1✦.
```

Beyond a single two-sentence ability, three further cases fold what would
otherwise be separate paragraphs into one:

- **An event's resolution is one paragraph.** Everything an event does when it
  resolves — a play cost (`To play this card,` and its `To play this event,` /
  `To play this character,` variants), a play condition (`Play this event only if
  …`), an alternative cost (`You may play this card for …`), a static property of
  the event (`This event cannot be prevented.`, `This event costs 1● less …`),
  and its effects — runs together in one paragraph, joined by normal spaces:

  ```
  To play this card, abandon a character. Materialize a random character with higher cost from your deck.
  Play this event only if there are 3 or more events in your void. Gain 5●.
  Foresee 1. Draw a card.
  ```

- **Parallel descriptive triggers share a paragraph.** When a card carries two
  or more `When …` clauses, they run together rather than splitting across blank
  lines:

  ```
  When an ally is dissolved, materialize a 1✦ survivor figment. When you discard or erode this card, it gains reclaim 0●.
  ```

- **Parallel static abilities share a paragraph.** Two static abilities that read
  as a matched pair are written together:

  ```
  This character has +1✦ for each allied warrior. Other allied warriors have +1✦.
  ```

Named (`▸`) triggers, standalone keywords, activated abilities, `Support`, and
`Reclaim` each keep their own paragraph; they are never folded into a
neighbouring clause. A lone descriptive trigger keeps its own paragraph too — a
`When …` clause merges only with another `When …` clause, never with an adjacent
static or effect line:

```
To play this card, banish a card from hand.

▸Materialized, ▸Dawn: Gain 1●.
```

```
Allied characters have awakened.

When you discard or erode this card, it gains reclaim 0●.
```

### 2.2 No trailing whitespace

Every line is trimmed: no trailing spaces, and no blank line at the start or end
of the text.

### 2.3 Ability order within a card

When a character carries more than one ability, order them: standalone keywords
first (`Vengeful`, `Unstoppable`, `Veil 2●`), then named (`▸`) triggers, then
descriptive (`When …`) triggers, then activated abilities. Reclaim, when present
on an event or character, is written as its own final paragraph.

---

## 3. Sentences and punctuation

### 3.1 Capitalization

The first word of every ability paragraph is capitalized, and so is the first
word of an effect that follows a trigger or cost colon:

- `▸Dawn: Gain 1●.`
- `2●, ☪: Draw a card.`

A word mid-sentence stays lowercase, including the second clause after a comma or
`then`:

- `Look at the top 4 cards of your deck, then draw a card.`
- `When you materialize a figment, store 1⧗.`

### 3.2 Terminal periods

The period rule turns on *what kind of line* it is:

- **Standalone keywords take no terminal period.** These are keywords that grant
  a static property on their own line: `Veil 2●`, `Reclaim 1●`,
  `Reclaim – Discard a card`, `Vengeful`, `Unstoppable`, `Awakened`, `Offering`,
  `Preeminence`, `Ephemeral`.
- **Effects always take a terminal period.** An effect such as `Erode 3` or
  `Store 1⧗` never stands alone — it is always reached through a trigger or cost
  — so it ends the sentence it belongs to: `When you discard a card, store 1⧗.`,
  `▸Dawn: If this card is in your void, erode 3.`
- **Every other ability sentence takes a terminal period**, including trigger
  effects, activated-ability effects, and descriptive static abilities.

`Support` is the one keyword that carries a sentence: it is written
`Support – <benefit>.`, and the benefit clause is a full sentence ending in a
period — `Support – Supported characters have +2✦.`

### 3.3 Numbers are digits

Use digits, not number words, for every count: `Draw 2 cards.`, `Materialize 2
1✦ ember figments.`, `Draw 1 of the cards.` — never `Draw one of the cards.` or
`Draw two of the cards.`

### 3.4 Drawing

Always `draw a card` for a single card, never `draw 1 card`. Use digits for two
or more: `Draw 2 cards.`

---

## 4. Triggered abilities

### 4.1 Named triggers

Named triggers begin with the `▸` marker glued to a capitalized trigger name,
followed by a colon and the effect:

```
▸Materialized: Discover a ≤2✦ character.
▸Challenge: Banish an enemy until end of turn.
▸Dawn: Gain 1●.
```

The named triggers are `▸Materialized`, `▸Dawn`, `▸Dusk`, `▸Night`,
`▸Challenge`, and `▸Dissolved`. A trigger that fires on more than one occasion
lists each marker, comma-separated, before the colon: `▸Materialized, ▸Dawn:`.

### 4.2 Descriptive triggers

A trigger keyed to a game event that has no named marker begins with `When`,
never `Whenever`:

```
When you play a card from your void, return this character to play.
When an ally is dissolved, gain 1⍟.
```

### 4.3 Once per turn

A frequency limit leads the sentence as `Once per turn,` followed by the trigger
or permission:

```
Once per turn, when you materialize a character, gain 1●.
Once per turn, you may play a ≤2● cost character from your void.
```

---

## 5. Activated abilities

### 5.1 Cost-and-effect form

An activated ability is written `Cost: Effect.` — the cost, a colon, a space,
then the effect as a capitalized sentence:

```
2●, ☪: Draw a card.
☪: Store 1⧗.
Abandon this character: Return an event from your void to your hand.
```

### 5.2 Cost ordering

Costs are listed in a fixed order, comma-separated:

1. **Symbolic costs first**, energy before exhaust: energy `N●`, then exhaust
   `☪`, then a counter cost `N⧗`.
2. **Word costs after the symbols**, with the first word capitalized — for
   example `Abandon a character`, `Discard a card`.

```
4●, ☪: This character gains +1✦.
2●, ☪, Discard a card: Return up to 2 ≤2● cost characters from your void to your hand.
☪, Discard an event: Draw an event.
```

### 5.3 Fast and Interrupt timing

An activated ability that uses Fast or Interrupt timing is prefixed with the
timing symbol and a spaced dash before the cost:

- **Fast** — `❖ – Cost: Effect.`
- **Interrupt** — `❖❖ – Cost: Effect.`

```
❖ – 1●: Move this character to an unoccupied character position.
❖❖ – Abandon this character: An ally cannot be targeted by effects this turn.
```

---

## 6. Reclaim and other keyword costs

`Reclaim` is a standalone keyword (no terminal period — see §3.2). Its cost is
written one of two ways:

- **Energy cost** — `Reclaim N●`: `Reclaim 1●`, `Reclaim 0●`.
- **Non-energy cost** — `Reclaim –` followed by the cost: `Reclaim – Discard a
  card`, `Reclaim – 2●, Abandon a character`, `Reclaim – Abandon two
  characters`.

The `–` (spaced en dash) marks any keyword whose cost is something other than a
bare energy amount, mirroring the `Support –` benefit form.

---

## 7. Modal abilities (`Choose one:`)

A modal ability uses the header `Choose one:` (lowercase `one`), then one bullet
per option. Each bullet is a line beginning with `- ` and ends in a period.
There are no blank lines between bullets.

```
Choose one:
- Dissolve a ≤2✦ enemy.
- Draw 2 cards, then discard 2 cards.
- Return a ≤2● cost character from your void to hand.
```

A modal block can follow a trigger or a cost on the same logical line:

```
▸Dissolved: Choose one:
- Gain 1●.
- Gain 1 maximum ●.
```

---

## 8. Verb and word choice

### 8.1 Spark gains: `gains`, `has`, `given` — never `gets`

- A character **gains** spark when the increase is self-initiated by that same
  character: `This character gains +1✦.`
- A character **has** spark when a static ability sets its value:
  `This character has +1✦ for each allied warrior.`
- A character is never said to **get** spark. When another effect grants spark to
  a different character, that character is **given** spark — phrase it in the
  active voice (see §8.3).

### 8.2 Figments are always *materialized*

Creating a figment always uses `materialize`: `Materialize a 1✦ warrior
figment.` Do not write `create a … figment`. Figment subtypes are lowercase
(`shadow`, `warrior`, `monstrosity`), and a figment's power is its spark, written
with `✦` (`2✦`), never `●`.

### 8.3 Buffing another character: `Give`, active voice

When the buff lands on a character other than the source, use the active voice
with `Give`:

```
Give an ally +1✦.
```

Do not write the effect as the target gaining the buff (`An ally gains +1✦`).
`gains` is reserved for self-buffs where the source acts on itself (`This
character gains +1✦`, per §8.1).

---

## 9. Noun reference

The enemy side and the opponent are already uniform; the ally side follows the
same singular/distributive split.

- **Singular target** — `an ally`, or a typed singular such as `an allied
  warrior`: `Return an ally to hand.`, `Give an ally +1✦.`, `Rematerialize an
  ally.`
- **Distributive (all matching, or a count)** — `allied characters`, or a typed
  plural such as `allied warriors`: `Awaken each allied character.`, `Allied
  warriors gain +1✦ until end of turn.`
- **The enemy** is always `an enemy` (never `enemy character`).
- **The opponent** is always `the opponent` (never `your opponent` or `each
  opponent`).
- Ownership is expressed with `ally`/`allied`, never the word `control`. State a
  board-count condition with `With …,`: `With ≥3 allied warriors, draw a card.`

---

## 10. Durations and windows

### 10.1 Temporary effects: `until end of turn`

Any effect that temporarily changes a character's state — a spark buff or a
granted keyword — expires `until end of turn`:

```
Give an ally +1✦ until end of turn.
A character in your void gains reclaim until end of turn.
```

Do not write `+1✦ this turn` for a temporary buff.

### 10.2 Windows and counts: `this turn`

`this turn` is reserved for counting windows and play-permission windows — a
span the effect *looks at* rather than a state it *grants*:

```
Draw a card for each ally that dissolved this turn.
The next time you play a ≤2● cost event this turn, copy it.
You may play that card from your void this turn.
```

---

## 11. Conditions and thresholds

- A leading condition that counts allied or enemy characters in play is written
  `With <condition>,` and the effect follows: `With ≥3 allied characters, reveal
  the top card of your deck.` Use the `≥` and `≤` symbols for numeric thresholds
  in this form: `With ≥2 allied warriors, your events cost 1● less.`, `With ≤1
  enemy, draw a card.`, `With no allies, gain 1●.`
- A cost or spark threshold on a noun is a glued symbol prefix on the noun, not a
  trailing `with …` clause. Use `≤` for "or less" and `≥` for "or more", and
  spell out `cost` for an energy threshold: `a ≤2● cost character`, `≤2● cost
  characters`, `a ≥3● cost character`, `a ≤2✦ enemy`, `each ≤X✦ character`. The
  prefix sits directly before the head noun, after any other adjectives — `a
  played ≤2● cost card`, `a random ≤2● cost character` — and the article before
  it is always `a`, never `an` (`a ≤2✦ enemy`).
- A pure count of non-character objects keeps the words `or less`/`or more`: `If
  there are 7 or more cards in your void, …`, `When you discard one or more
  cards, …`.
- An equality threshold against a variable amount spells out the comparison:
  `with cost less than or equal to the stored ⧗`.

---

## 12. Quick checklist

- Symbols glued to numbers (`1●`, `+2✦`); use `X` with a `where X is …` clause.
- One ability per paragraph, blank line between, no trailing whitespace.
- First word after a `▸trigger:` or `cost:` colon is capitalized; mid-sentence
  stays lowercase.
- Standalone keywords (`Vengeful`, `Veil 2●`, `Reclaim 1●`) take no period;
  every effect and full sentence does.
- `When`, never `Whenever`; `Once per turn,` leads a frequency limit.
- Activated cost order: energy, exhaust, counters, then word costs; `❖ –` for
  Fast, `❖❖ –` for Interrupt.
- `Reclaim –` for any non-energy reclaim cost.
- `Choose one:` header, `- ` bullets, no blank lines between, each bullet ends
  in a period.
- `gains` for self-buffs, `has` for static spark, `Give` (active voice) for
  buffing others; never `gets`.
- `materialize` for figments, lowercase subtype, spark in `✦`.
- `an ally` / `an enemy` singular; `allied characters` distributive; `the
  opponent`.
- Temporary state change → `until end of turn`; counting or permission window →
  `this turn`.
- Board-count conditions use `With ≥N …,`; cost/spark thresholds are glued
  symbol prefixes (`a ≤2● cost character`, `a ≤2✦ enemy`, `a ≥3● cost
  character`), with article `a`; non-character pure counts keep `or less`/`or
  more`.
