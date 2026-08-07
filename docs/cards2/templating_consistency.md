# Rules-Text Templating Consistency — `cards.toml`

This report audits the `rendered-text` of all 502 cards in
`data/cards.toml` for templating consistency: writing the same effect
the same way every time. It identifies the major sources of variation that are
worth standardizing.

Cards are referenced by `#<card-number> <name>`, matching the `card-number`
field in the TOML.

## Conventions that are already consistent

These hold across the whole file and need no action; they are recorded so a
standardization pass does not disturb them.

- **Symbol spacing is always glued.** Energy and spark attach directly to their
  number — `1●`, `+2✦` — never `1 ●`. All 438 digit-symbol pairs follow this.
- **`draw a card`**, never `draw 1 card` (71 cards use the `a` form).
- **Triggers read `When …`**, never `Whenever …` (72 `When you`, 23 `When a`).
- **The enemy target is always `an enemy`** — `enemy character` appears zero
  times.
- **The opponent is always `the opponent`** — no `your opponent` / `each
  opponent` variants.
- **Activated abilities use `❖ – cost: effect`** uniformly, with `❖❖` for the
  two-charge form.

---

## 1. Outright errors

These are defects, not stylistic choices, and should be fixed regardless of any
templating policy.

| Card | Current text | Issue | Fix |
|---|---|---|---|
| #309 Dawnrunner | `materialize a 2● shadow figment` | Figment power written with `●` (energy); every other figment uses `✦` (spark) | `2✦` |
| #154 Wreckborn | `When an non-figment ally is dissolved` | `an` before a consonant sound | `a non-figment` |
| #193 Pyre Challenger | trailing line `use with another` | Broken / placeholder fragment: lowercase, no object, no period | Remove or complete |
| #340 Carrion Lord | `4✦ Monstrosity figment` | Subtype capitalized; all other figment subtypes are lowercase | `monstrosity` |
| #15 Luminwings | `…allied spirit animals, Gain 1●.` | `Gain` capitalized mid-sentence after a comma | `gain` |

---

## 2. Verb and word choice

### 2.1 `gets` vs `gains` for stat buffs

The dominant form is `gains +N✦` (29 occurrences). Three cards use `gets`:

- #94 Minstrel of Falling — `This character gets +1✦ for each…`
- #140 Frostbound Defiant — `that character gets +3✦.`
- #202 Ride of the Vanguard — `An ally gets +1✦ for each allied warrior…`

**Recommendation:** standardize on `gains`.

### 2.2 `create` vs `materialize` a figment

The dominant form is `materialize a 1✦ <subtype> figment`. Four cards use
`create`:

- #171 Fathomscourge — `create a 1✦ warrior figment`
- #241 Last Beacon — `Create a 1✦ outsider figment`
- #259 Twilight Troubadour — `create a 1✦ warrior figment`
- #260 Simulacra — `Create a figment copy of an ally until end of turn`

#260 produces a temporary copy, so `create` there may be deliberate. The other
three look like they should be `materialize`. This needs a stated rule (e.g.
*materialize for a permanent figment, create for a temporary token*) so the
distinction is intentional rather than incidental.

### 2.3 Granting spark to another character: `Give` vs `gains`

The convention for buffing a *different* character is `Give an ally +N✦`
(#168 Meadowlight Charger, #264 Oathbound Pair, #348 Shadow Reflection,
#353 Wired Duelist). A few cards instead phrase the same effect as the target
gaining the buff itself:

- #202 Ride of the Vanguard — `An ally gets +1✦…`
- #216 Colossal Convergence — `An allied character gains +X✦…`
- #502 Stoneborn Leviathan — `An ally gains +1✦.`

**Recommendation:** use `Give <target> +N✦` whenever the buff lands on a
character other than the source; reserve `gains` for self-buffs
(`This character gains +1✦`).

---

## 3. Noun reference: `an ally` vs `allied character`

The enemy side is fully consistent (`an enemy` everywhere). The ally side is
not. The de-facto rule is:

- **Singular target → `an ally`** — `Return an ally to hand`,
  `Rematerialize an ally`, `Give an ally +1✦`.
- **Distributive → `each` / `another allied character`** — `awaken each allied
  character`, `Another allied character cannot be targeted`.

Cards that break the singular-target rule:

- #345 Selfless Rescuer — `An allied character cannot be targeted…`, versus
  #207 Gateway Defender — `An ally cannot be targeted…` (same effect, two
  nouns).
- #216 Colossal Convergence — `An allied character gains…`, versus
  #502 Stoneborn Leviathan — `An ally gains…`.
- #417 Skyborne Jellyfish — `for each ally`, the lone `each ally`; the other
  seven distributive uses are `each allied character`.

**Recommendation:** singular targets use `an ally`; distributive quantifiers use
`allied character(s)`.

---

## 4. Punctuation and whitespace

This is the highest-volume category.

### 4.1 Terminal periods drift on ability lines

Most ability sentences end in `.`, but several keyword-effect lines omit it:

- **Erode:** `Erode N.` (17 cards) versus no period on #291 Echo Technician,
  #397 Veilseeker, #414 Pit Descender. #283 Whisper of the Past has
  `erode 3 ` — trailing space and no period.
- **Store:** `Store 1⧗.` versus `Store 1⧗` on #430 Dawnhorn Elder and the
  figment line of #480 Phantasmal Recruiter.
- **Full sentences missing a period:** #406 Flamestride Rider
  (`…cannot be dissolved while challenging`) and #480 Phantasmal Recruiter
  (`…warrior figments`).

**Recommendation:** every ability sentence ends in a period, including keyword
lines such as `Erode N` and `Store N⧗`.

### 4.2 Trailing whitespace

Lines with trailing spaces: #127 Driftrider, #429 Conjured Zenith,
#283 Whisper of the Past. These should be stripped.

### 4.3 `Choose one` blocks are inconsistent on three axes

Five cards use a choice block: #96 Return to Nowhere, #131 Burst of
Obliteration, #332 Junkfield Renegade, #412 Crimson Pilgrimage,
#450 Entropy Spike.

- **Header casing:** `Choose One:` (#96, #131) versus `Choose one:`
  (#332, #412, #450).
- **Blank lines between bullets:** present only in #96; absent in the other
  four.
- **Bullet terminal periods:** present (#96, #412, #450) versus absent
  (#131's last bullet, all of #332).
- **Number words versus digits:** #412 reads `Draw one of the cards` /
  `Draw two of the cards`, where the rest of the set uses digits.

**Recommendation:** fix the block template — `Choose one:`, no blank lines
between bullets, every bullet ends in a period.

---

## 5. Lower-severity style splits

### 5.1 Buff duration: `this turn` vs `until end of turn`

The same temporary-spark effect is written both ways:

- `+N✦ this turn` — #18 Moonlit Dancer, #73.
- `+N✦ until end of turn` — #169 Gleamharvester, #374, #428 Field Reverent.

Granting the *reclaim* keyword is consistently `until end of turn`, so the split
is specifically on stat buffs. Pick one phrasing for temporary stat changes.

### 5.2 Activated-cost ordering

The norm is `N●, ☾:` (energy before the moon symbol). The lone reversal is
#248 Mystic Runefish — `☾, 5●:`.

### 5.3 Reclaim cost format

`Reclaim N●` everywhere except #326 Fell Swoop — `Reclaim – Discard a card`
(an alternative-cost dash form). This may be intentional, but it is the only
non-numeric reclaim cost in the file and is worth confirming.

---

## Suggested order of work

1. **Section 1** — defects (wrong symbol, broken grammar, placeholder text).
2. **Section 4** — the largest volume of inconsistency; a single mechanical pass
   to enforce terminal periods, standardize the `Choose one:` block, and strip
   trailing whitespace clears most of it.
3. **Sections 2 and 3** — require deciding and documenting canonical templates
   (`gains` over `gets`; `materialize` vs `create`; `Give X +N✦` for buffing
   others; `an ally` for singular targets), then sweeping the named outliers.
4. **Section 5** — lowest stakes; settle the buff-duration wording since both
   forms are currently live.
