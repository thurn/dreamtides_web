# Dreamtides Battle Mode — Card-Mechanics Checklist (Rewrite Design Deliverable)

Comprehensive, categorized inventory of every game mechanic the battle engine must
support, derived from a survey of the card pool.

**Sources surveyed**
- Rules vocabulary/definitions: `/Users/dthurn/quest_prototype/docs/battle_rules/battle_rules.md`
- Card pool: `/Users/dthurn/quest_prototype/data/tabula/cards.toml` (519 cards; 375 Character, 144 Event)
- Identity cards: `/Users/dthurn/quest_prototype/data/tabula/dream_avatars.toml` (32 dream avatars)

**Counting method:** frequencies are occurrence counts of the symbol/phrase across all
`rendered-text` fields, computed with UTF-8-correct regex (Python `re`). Multi-byte symbols
(● ⧗ ⍟ ☪ ✦ ❖ – ▸ ≤ ≥) are mis-counted by byte-oriented `grep -o`; the numbers below are the
corrected values. A count is "occurrences", which can exceed the number of distinct cards
(one card may use a mechanic twice). Where useful, distinct-card counts are noted.

**Classification key**
- **[DET]** = DETERMINISTIC — fully resolvable from board state + card fields with no player
  decision. Structural automation can own this.
- **[CHOICE]** = CHOICE/TARGETED — requires the player to pick a target, mode, value of X,
  ordering, or yes/no. Needs a debug-rail / manual driver since the engine does not interpret
  card text.
- **[MIXED]** = the mechanic has both auto and player-driven forms; tag depends on the specific
  card.

**Engine assumption:** the engine does NOT read/interpret card prose. So [DET] mechanics are
candidates for full structural automation keyed off card fields and board state; [CHOICE]
mechanics must be surfaced through a manual tool the player drives.

---

## Symbol legend (for reference)
● energy · ⧗ counters · ⍟ victory points · ☪ exhaust · ✦ spark · ❖ fast · ❖❖ interrupt ·
– keyword marker · ▸ named-trigger marker · ≤ at-most · ≥ at-least

Raw symbol occurrence counts (cards_v2): ● 285 · ✦ 142 · ▸ 157 · ☪ 65 · ⍟ 45 · ⧗ 38 ·
– 32 · ❖ 19 · ≤ 80 · ≥ 1.

---

## 1. Card Types & Timing Categories

- [ ] **Character** — permanent; enters play (exhausted unless Awakened); has ✦ + subtype. 375 cards. **[DET]** (placement is structural; back rank, exhausted)
- [ ] **Event** — one-shot; resolves then goes to void. 144 cards. **[DET]** structurally; effect may be [CHOICE]
- [ ] **Dream Avatar** — identity card in play at start; ongoing ability. 32 records. **[DET]** presence; abilities vary
- [ ] **Fast (❖)** — playable in any Fast window. `is-fast=true`: 69 cards; ❖ in text 19. **[DET]** (timing flag)
  - Example: *Starlight Guide*, *Miraculous Arrival*
- [ ] **Interrupt (❖❖)** — Fast subtype, also playable in response on the stack. `is-interrupt=true`: 36 cards; ❖❖ in text 5. **[DET]** (timing flag); playing in response is **[CHOICE]**
  - Example: *Miraculous Arrival* (Offering / Interrupt)

---

## 2. Keywords

- [ ] **Reclaim / Reclaim N●** — may play from void; becomes reclaimed (banished when it leaves play). 73 occurrences (~45 cards). "Reclaim N●" form: 28. **[CHOICE]** (player chooses to play from void; reclaimed-status replacement is **[DET]**)
  - Examples: many; e.g. cards granting "gains reclaim until end of turn"
- [ ] **Erode N** — top N of your deck → void (eroded cards); can target opponent ("erodes N"). 18 + 8 ("erodes") = 26. **[DET]** (count fixed; no target choice — but empty-deck → Fatigue)
- [ ] **Offering** — play for 0● by banishing a hand card; banished end of turn. 11. **[CHOICE]** (player picks card to banish + chooses Offering mode)
  - Example: *Miraculous Arrival*
- [ ] **Ephemeral** — drawn-with-ephemeral cards banish at end of turn if still in hand. Rendered lowercase: "draw a card with ephemeral", 9 occurrences. **[DET]** (end-of-turn banish is automatic)
  - Examples: *Vrakmoth* (dream avatar), several "draw a card with ephemeral" cards
- [ ] **Vengeful** — on losing a challenge, dissolves the opposing enemy. 5 occurrences (plus innate on Wraith figment). **[DET]**
- [ ] **Veil N●** — opponent pays N● extra to target this character. 18 occurrences. **[DET]** for the source; the opponent's pay-or-fail is **[CHOICE]** at target time
  - Examples: *"Veil 2●"*, *"Awakened, Veil 2●"*
- [ ] **Support – <benefit>** — back-rank character benefits the ≤2 front-rank positions it supports. Keyword form "Support –": 8; "Supported" refs: 8. **[DET]** (positional, board-derived)
  - Examples: *"Support – Supported allies have +1✦ for each stored ⧗."*, *"Support – Supported allies have +2✦."*
- [ ] **Awakened (keyword) / Awaken (effect)** — enters/becomes un-exhausted. Awakened keyword 15; Awaken verb 7 (30 total "awaken*"). **[DET]** keyword; **[CHOICE]** when "Awaken an ally" picks a target
  - Example: *Kaleth* (dream avatar): "2●, ☪: Awaken an ally."
- [ ] **Phasing** — keyword on 6 cards. **NOT DEFINED in battle_rules.md — flag for designer.** Appears as a standalone keyword line like Awakened. **[?]** (needs a rule before classification)
  - Examples: *Headtaker Wurm*, *Thronebound Arbiter*, *Driftrider*, *Northlight Maestro*, *Vanishing Inquisitor*, *Breach Artist*
- [ ] **Prevent** — counter a card on the stack (always Interrupt); conditional forms ("unless the opponent pays N●"). 14. **[CHOICE]** (choose to respond + which card)
  - Example: *"Prevent a played ≤2● cost card."*, *"Prevent a played ≤2✦ character."*
- [ ] **Discover** — look at 3 deck cards matching a criterion, add one to hand. 31. **[CHOICE]** (pick 1 of 3)
  - Examples: *"Discover a ≤2✦ character."*, *Vethran* (dream avatar): "Discover a card with cost X●."
- [ ] **Foresee N** — look at top N, reorder, optionally bin some to void. 12. **[CHOICE]** (ordering + bin decisions)
- [ ] **Copy** — duplicate a card/effect; "figment copy of '<card>'" and "copy the next event". 4 copy-phrasings. **[CHOICE]/[MIXED]** (which card to copy; figment-copy uses the copied card's identity)
  - Examples: *"Materialize a figment copy of 'Blade of Unity'."*, *Kasane* (dream avatar): "Copy the next event you play this turn."
- [ ] **Gain control** — take an opponent's character to your side. 1 card. **[CHOICE]** (target)
  - Example: *"▸Materialized: Gain control of a ≤X● cost enemy."*
- [ ] **Abandon** — move your own character play→void (can't be prevented; fires ▸Dissolved; frequent cost). 87 total; "Abandon this character" 20; "Abandon another" 11. **[CHOICE]** (which ally) — except "Abandon this character" is **[DET]** (self-target)
- [ ] **Rematerialize** — re-trigger an in-play character's ▸Materialized. 3. **[CHOICE]** (target ally)
  - Example: *Starlight Guide*: "▸Challenge: Rematerialize an ally."
- [ ] **Banish** — send a card to the Banished zone (from play / void / until-source-leaves / until-Day). "banish*" 32. **[MIXED]** (target-dependent)
- [ ] **Dissolve** — move a target character play→void. "dissolve*" 83. **[CHOICE]** (target) — except "dissolve each/all" mass forms (see §12) which are **[DET]**
- [ ] **Materialize** — put a character into play (from hand/void/deck/created). "materialize*" 177 (includes figment creation). **[MIXED]**: placement is **[DET]**; "materialize from your void/deck (chosen)" is **[CHOICE]**

---

## 3. Named Triggers (▸)

- [ ] **▸Materialized** — fires on entering play. **81** (the single most common trigger). **[DET]** trigger; effect varies
  - Example: *Gatebound Warden* line region, *"▸Materialized: Materialize a 1✦ ethereal figment."*
- [ ] **▸Dawn** — fires in controller's Dawn phase after un-exhaust. **41**. **[DET]** trigger
  - Example: *Driftcaller Sovereign*: "▸Dawn: Gain 1●."
- [ ] **▸Dusk** — fires in controller's Dusk phase. **0 on cards** (Dusk effects arrive via phase/Dreamwell; the trigger slot still must exist). **[DET]** trigger
- [ ] **▸Night** — fires at start of controller's Night phase. **5**. **[DET]** trigger
  - Example: *Korrax* (dream avatar): "▸Night: Give an ally +1✦."
- [ ] **▸Challenge** — fires at Night start if this character is a challenger. **10**. **[DET]** trigger (board-derived); effect may target
  - Example: *Gatebound Warden*: "▸Challenge: Banish an enemy until end of turn."
- [ ] **▸Dissolved** — fires when this character is dissolved. **20**. **[DET]** trigger
  - Example: *"▸Dissolved: Materialize X 1✦ survivor figments, where X is this character's spark."*
- [ ] **Combined named triggers** (e.g. "▸Materialized, ▸Dawn", "▸Materialized, Dissolved"). Present. **[DET]** (fire on each listed occasion)

---

## 4. Descriptive Triggers ("When …")

- [ ] **When you play a card** — 2. **[DET]** trigger
- [ ] **When you play an event** — 11. **[DET]** trigger
  - Example: *"When you play an event, materialize a 1✦ ethereal figment."*
- [ ] **When you play a character / a warrior / a spirit animal** — "play a character" 9 (+ tribal forms). **[DET]** trigger
  - Example: *"When you play a warrior, materialize a 1✦ warrior figment."*
- [ ] **When you play your second card / second event / second character in a turn** — ~2 on cards; also dream avatars *Tessa*, *Seraveth*, *Rael*. **[DET]** trigger (count-based)
- [ ] **When you discard a card** — 18. **[DET]** trigger
  - Example: *"When you discard a card, draw a card with ephemeral."*
- [ ] **When you draw** — 1. **[DET]** trigger
- [ ] **When you materialize a (figment / non-figment / character)** — "When you materialize" 19; figment-specific 2; non-figment forms present. **[DET]** trigger
  - Example: *"When you materialize a figment, store 1⧗."*
- [ ] **When an ally / allied <type> is dissolved (or "leaves play")** — "ally is dissolved"-style 15; "leaves play" 5. **[DET]** trigger
  - Example: *"When a non-figment ally is dissolved, materialize a 1✦ ember figment."*
- [ ] **When a card leaves your void** — present (dream avatar *Vaela*; *"When a character card leaves your void, materialize a 2✦ shadow figment."*). **[DET]** trigger
- [ ] **When you abandon (an ally)** — 6 (+ dream avatar *Kragg*). **[DET]** trigger
- [ ] **When an allied character scores ⍟** — "scores ⍟" 7. **[DET]** trigger (distinct from flat "gain ⍟"; only true scoring fires it)
- [ ] **When the opponent scores ⍟** — dream avatar *Karev Soltis*. **[DET]** trigger; "unless opponent pays 1●" branch is **[CHOICE]** for opponent
- [ ] **When you reclaim / when you store ⧗** — "you reclaim a" 4; store-counter triggers fold into §7. **[DET]** trigger
- [ ] **At the start / end of turn (conditional)** — "At the start of your turn, if …" (e.g. *Seld Rakor*, *Senemhet*). **[DET]** trigger (state-conditioned)

---

## 5. Activated-Ability Cost Types

- [ ] **● energy cost** ("N●:") — 54 (+ 16 on dream avatars). **[DET]** to pay (resource check)
- [ ] **X● cost** ("X●:") — 7. **[CHOICE]** (player picks X)
- [ ] **☪ exhaust cost** ("☪:") — 65 (+ 15 on dream avatars). **[DET]** to pay; auto back-rank move on front-rank source is **[DET]**
- [ ] **⧗ counter spend** ("N⧗:") — 9. **[DET]** to pay (uses stored counters)
- [ ] **Abandon-a/-another-character cost** — "Abandon …:" 63; "Abandon another" 11. **[CHOICE]** (pick which ally) — "Abandon this character:" 20 is **[DET]** (self)
- [ ] **Discard-as-cost** ("Discard …:") — 19. **[CHOICE]** (pick card from hand)
  - Example: *Kael Voss* (dream avatar): "2●, ☪, Discard a card: Materialize a 1✦ survivor figment."
- [ ] **Banish-from-void cost** — 4. **[CHOICE]** (pick void card)
- [ ] **"Once per turn" limiter** — 12 (+ 6 dream avatars). **[DET]** (usage gate)
- [ ] **Composite costs** (e.g. "2●, ☪, Abandon an ally", "3●, X●, ☪") — common across dream avatars and cards. **[MIXED]** (resource parts [DET]; target/X parts [CHOICE])
  - Examples: *Caedryn*: "2●, ☪, Abandon an ally: …"; *Vethran*: "3●, X●, ☪: Discover a card with cost X●."

---

## 6. Static Abilities

- [ ] **Spark anthems** ("Allied <type> have +N✦", "have +X✦") — "have +N✦" 13; "allied … have" 8. **[DET]** (board-derived continuous bonus)
  - Examples: *"Allied spirit animals have +1✦."*, *"Other allied warriors have +1✦."*
- [ ] **Self-scaling spark** ("This character has +1✦ for each allied warrior") — present. **[DET]**
- [ ] **Void-anchored static** ("If this card is in your void, allied characters have +1✦.") — present. **[DET]** (zone-conditioned static)
- [ ] **Cost reductions** ("costs ● less", "the next character you play costs 2● less") — "● less" 6 (+ dream avatar *Kragg*; *Yveth Coravel* "cost reduced by 1●"). **[DET]** (continuous cost mod)
- [ ] **Rule-change statics** (granting keywords to a group) — folded into anthems above. **[DET]**

---

## 7. Counters (⧗)

- [ ] **Store ⧗** ("store N⧗", "store 1⧗ when …") — 9 store-phrasings (19 "store"-line hits incl. triggers). **[DET]** (increment on trigger)
- [ ] **Spend ⧗ as cost** ("N⧗, ☪: …") — see §5 (9). **[DET]**
- [ ] **Reference stored ⧗** ("+1✦ for each stored ⧗", "cost ≤ stored ⧗") — "stored ⧗"/"each ⧗" 6. **[DET]** (board-derived scaling)
  - Examples: *"Supported allies have +1✦ for each stored ⧗."*, *Desolation's Edge*: "Dissolve each character with cost ≤ the stored ⧗."
- [ ] **Counters reset to 0 on leaving play** — rule. **[DET]**

---

## 8. Victory Points (⍟)

- [ ] **scores ⍟ (a character scoring)** — 7 references to the scoring event; the core Challenge-phase score is structural. **[DET]**
- [ ] **gain N⍟ / gain X⍟ (flat award)** — 25. **[DET]** (does NOT count as a character scoring)
- [ ] **Fatigue** — empty-deck draw/erode awards opponent 1⍟,2⍟,4⍟,… (doubling). Rule-level. **[DET]**
- [ ] **Victory threshold (default 25⍟) / 50-turn draw** — rule. **[DET]**

---

## 9. Energy (●)

- [ ] **Gain N● (current)** — 67. **[DET]**
  - Examples: *Driftcaller Sovereign* "Gain 1●", *Senemhet* "If you have 5●, gain 1●"
- [ ] **Gain N maximum ●** (permanent production) — 2. **[DET]**
- [ ] **Double your current ●** — 1. **[DET]**
- [ ] **Gain ● for each allied <type/figment>** — e.g. *Grath* "Gain 1● for each allied spirit animal", *"Gain 1● for each allied figment."* **[DET]** (board-derived)
- [ ] **Pay-N●-or-else branches** ("unless the opponent pays N●") — ~10. **[CHOICE]** (opponent decision)
- [ ] **Dreamwell energy production / current-● reset each turn** — rule/structural. **[DET]**

---

## 10. Figments (created characters) & Stacking

Creation phrasing is "Materialize a N✦ <type> figment" (38 "<type> figment" hits in text) plus
"figment copy of '<card>'". Figment word appears 88×.

Figment-creation counts by type (occurrences of "<type> figment" in rendered-text):

- [ ] **Warrior** (base 1✦) — 6. **[DET]** create
- [ ] **Ancient** (4✦) — 0 created in text (subtype exists). **[DET]**
- [ ] **Enigma** (0✦) — 0 created. **[DET]**
- [ ] **Shadow** (2✦) — 3. **[DET]**
  - Example: *"When a character card leaves your void, materialize a 2✦ shadow figment."*
- [ ] **Spirit Animal** (1✦) — 2. **[DET]**
- [ ] **Synth** (0✦, Support +1✦) — 0 created (subtype exists). **[DET]**
- [ ] **Monstrosity** (4✦) — 1. **[DET]**
- [ ] **Survivor** (1✦) — 4. **[DET]**
  - Example: *"▸Dissolved: Materialize X 1✦ survivor figments, where X is this character's spark."*
- [ ] **Celestial** (2✦) — 0 created. **[DET]**
- [ ] **Wraith** (0✦, Vengeful) — 1. **[DET]**
- [ ] **Ethereal** (1✦) — 6. **[DET]**
- [ ] **Radiant** (2✦) — 0–1 ("radiant figment" appears, e.g. "materialize a 2✦ radiant figment"). **[DET]**
- [ ] **Ember** (1✦, Awakened) — 2. **[DET]** (often "with awakened … abandon at end of turn")
  - Example: *"☪: Materialize two 1✦ ember figments with awakened. Abandon them at end of turn."*
- [ ] **Outsider** (1✦) — 0–1 ("outsider figment", e.g. *Edran*). **[DET]**
- [ ] **Figment copy of a named card** — uses the copied card's printed identity. **[CHOICE]/[MIXED]** (which card)
  - Examples: *"Materialize a figment copy of 'Blade of Unity'."*, *"Materialize a figment copy of an ally until end of turn."*
- [ ] **Figment STACKING** — same-type figments share one position as a stack: total spark, sorted highest-on-top, move/exhaust/awaken/challenge/defend together, top-down spark absorption in challenges. Rule/structural. **[DET]** (but targeting a stack must hit the topmost — see §11)
- [ ] **Materialize X figments where X = …** (variable count) — e.g. survivor example above. **[DET]** (count is computed)

---

## 11. Targeting Predicates

- [ ] **≤N✦ (spark at most)** — 15 (mostly ≤2✦, some ≤3✦/≤1✦/≤5✦/≤4✦). **[CHOICE]** (pick among eligible)
  - Examples: *"Dissolve a ≤2✦ enemy."*, *"Discover a ≤2✦ character."*
- [ ] **≥N✦ (spark at least)** — 0 in pool. (Slot may still be needed.)
- [ ] **≤N● cost** — 59 (dominant comparison predicate; mostly ≤2●, some ≤3●/≤4●/≤1●). **[CHOICE]**
  - Examples: *"play a ≤2● cost character from your void"*, *"Dissolve a ≤3● cost enemy."*
- [ ] **≥N● cost** — 1 (≥3●). **[CHOICE]**
- [ ] **=X● / =N● cost** (exact cost, often tied to X) — 0 literal "=N●"; "cost X●" exact-match forms appear (e.g. *Vethran*, *Caedryn* "cost 1● higher"). **[CHOICE]**
- [ ] **enemy vs. ally** — "an enemy" 27; "an ally / allied" 95. **[CHOICE]** (target side)
- [ ] **"another" (not the source)** — 19. **[CHOICE]**
- [ ] **non-figment** predicate — 10. **[CHOICE]** (eligibility filter)
- [ ] **by subtype** (warrior / spirit animal / survivor referenced mechanically) — warrior 41, spirit animal 13, survivor 8 in text. **[CHOICE]** (filtered target/count)
- [ ] **in your void** target — "your void" 81 (read §13). **[CHOICE]** (pick void card)
- [ ] **topmost (highest-spark) figment of a stack** — rule: a single-target effect on a stack must hit the topmost. **[DET]** rule, but the surrounding effect is **[CHOICE]**
- [ ] **random target** ("a random character", "a random character with cost 1● higher") — present (*Caedryn*). **[DET]** (engine rolls; no player choice)

---

## 12. Modal & Mass / Multi-target Effects

- [ ] **"Choose one:"** (modal) — 5 cards. **[CHOICE]** (pick a mode)
  - Examples: *Return to Nowhere*, *Burst of Obliteration*, *Junkfield Renegade*, *Crimson Pilgrimage*, *Entropy Spike*
- [ ] **"You may …" (optional effect / optional additional cost)** — 28. **[CHOICE]** (yes/no)
- [ ] **Dissolve each / Dissolve all / Dissolve each ≤X✦ (mass removal)** — present. **[DET]** when "all/each" with no further choice; **[CHOICE]** when an X is chosen
  - Examples: *Apocalypse* "Dissolve all characters."; *Ordained Collapse* "Dissolve each character with cost X●."; *Collateral Damage* "Dissolve each ≤X✦ character."; *Desolation's Edge* "Dissolve each character with cost ≤ stored ⧗."
- [ ] **Return all / Return all but one (mass bounce)** — present. **[DET]** (all) — choosing which one stays is **[CHOICE]**
  - Examples: *The Waking Titan* "5⧗: Return all other characters to hand."; *Key to the Moment* "Return all but one allied character to hand…"; *Veilseeker* "Return all ≤2● cost characters from your void to play."

---

## 13. Zone Interactions

- [ ] **Void — play/return/banish from void** ("from your void", "in your void", "to hand") — "your void" 81. **[CHOICE]** (pick card)
  - Examples: *Kell Tarn* "play a character from your void"; *"return a ≤2● cost character from your void to hand"*
- [ ] **Grant Reclaim to a void card** ("a ≤3● cost event in your void gains reclaim") — folded into §2. **[CHOICE]/[DET]** (which card)
- [ ] **Hand — return to hand / draw / discard** — "to hand" 46. **[MIXED]**
- [ ] **Deck — top N, materialize from deck, search/Discover** — "your deck"/"top N" 23. **[CHOICE]** (selection)
- [ ] **Banished — banish from play/void; banish until <condition>** — "banish*" 32. **[MIXED]**
- [ ] **Opponent's zones** ("Reveal the opponent's hand", "Discard a chosen card from the opponent", opponent's void/deck) — 19. **[CHOICE]** (choose from revealed)
- [ ] **Shuffle void/hand into deck** — "shuffle" 7; "shuffle your hand and void into your deck" 5. **[MIXED]** ("up to 3 from void" is **[CHOICE]**; "hand and void" is **[DET]**)
  - Examples: *"Abandon this character: Shuffle up to 3 cards from your void into your deck. Draw a card."*; *"Shuffle your hand and void into your deck. Draw 5 cards. Gain 5●."*

---

## 14. Card Selection / Hand Filtering

- [ ] **Draw N cards / Draw a card / Draw X** — 98. **[DET]** (unless "draw then choose")
- [ ] **Discard a card / Discard X / "draw then discard X"** — 84. **[CHOICE]** when player picks which to discard (random-discard would be [DET])
- [ ] **Foresee N** — 12. **[CHOICE]** (reorder + bin)
- [ ] **Discover** — 31. **[CHOICE]** (pick 1 of 3)
- [ ] **Look at the top N (then choose)** — 5. **[CHOICE]**
  - Example: *"Look at the top 4 cards of your deck. Choose one: Draw 1 of the cards, or draw 2 … they gain ephemeral."*
- [ ] **Reveal (hand/cards)** — 3. **[MIXED]** (reveal is [DET]; downstream choice is [CHOICE])
- [ ] **Draw an event / draw a <type>** (typed draw) — e.g. *Ovanel* "draw an event". **[DET]** (engine finds matching card)

---

## 15. Exhaust / Awaken / Repositioning (board state)

- [ ] **Exhaust an enemy / exhaust a character** (effect) — "Exhaust …" effect present (rules example "2●: Exhaust an enemy"). **[CHOICE]** (target)
- [ ] **Awaken an ally** (effect) — *Kaleth* "2●, ☪: Awaken an ally." **[CHOICE]** (target)
- [ ] **Auto back-rank move when front-rank source pays ☪** — rule/structural. **[DET]**
- [ ] **Repositioning** (Day by active player; Dusk by opponent; exhausted can't enter front rank; swaps on occupied) — structural. **[CHOICE]** (player drags positions) but rule-constrained
- [ ] **Give an ally +N✦ (this turn or permanent)** — e.g. *Korrax* "Give an ally +1✦." **[CHOICE]** (target)

---

## 16. Win Conditions / Special / Hard-to-automate

- [ ] **"You win the game"** — 1 card. **[DET]** trigger (its condition is state-based), but a unique end-state hook.
  - Example: *Terminus* — "If you have no cards in your deck, you win the game."
- [ ] **Extra turn** — 1 card. **[DET]** effect but requires turn-loop support.
  - Example: *Moment Rewound* — "Take an extra turn after this one."
- [ ] **Mass dissolve scaled by X / by stored ⧗** — see §12. **[MIXED]** (X is [CHOICE]; resolution [DET]).
- [ ] **Copy (card / next event / figment-copy of a named card)** — see §2/§10. **[CHOICE]** — engine must clone full card identity, including the copied card's own abilities.
- [ ] **Gain control of an enemy** — see §2. **[CHOICE]** — moves a character across sides; ownership re-assignment.
- [ ] **Phasing** — 6 cards, **undefined in current rules**. **[?]** — must define before automating.
- [ ] **Shuffle hand+void into deck + draw 5 (+ gain ●)** ("reset" effect) — see §13. **[DET]** (deterministic bulk move).
- [ ] **"Until end of turn" temporary grants** (gain +X✦, gain reclaim, cost reductions) — duration tracking. **[DET]** bookkeeping; underlying grant may target ([CHOICE]).
- [ ] **Pay-or-prevent / "unless opponent pays N●" interactive branches** — opponent decision points. **[CHOICE]** (opponent).

---

## 17. Tribal Subtypes (mechanically referenced)

Subtype field values present (card counts): Warrior 92, Visitor 69, Spirit Animal 39,
Explorer 34, Survivor 27, Ancient 26, Synth 19, Tinkerer 16, Child 13, Musician 10, Mage 7,
Outsider 5, Monster 4, plus Visionary/Renegade/Detective/Super/Hacker/Guide/Avatar/Visionary.

Mechanically referenced in card text (drive triggers/anthems/targets/figment-creation):

- [ ] **Warrior** — 41 text refs (anthems, "when you play a warrior", warrior figments). **[DET]/[CHOICE]**
- [ ] **Spirit Animal** — 13 text refs (anthems, "play a spirit animal", energy-per-spirit-animal). **[DET]/[CHOICE]**
- [ ] **Survivor** — 8 text refs (survivor figments). **[DET]/[CHOICE]**
- [ ] **Figment types as a tribal set** (Warrior/Ancient/Enigma/Shadow/Spirit Animal/Synth/Monstrosity/Survivor/Celestial/Wraith/Ethereal/Radiant/Ember/Outsider) — see §10. **[DET]**
- [ ] Remaining subtypes (Visitor, Explorer, Tinkerer, Child, Musician, Mage, Monster, Detective, etc.) appear as flavor tags with **no mechanical text references found** — engine must store the tag but no automation is keyed to them today. **[DET]** (data only)

---

## 18. Dream Avatar Ongoing Abilities (identity cards)

32 dream avatars. Ability shapes (occurrences within dream_avatars_v2): ● activated 16, ☪
activated 15, Once-per-turn 6, ▸Dawn 1, ▸Night 1, Abandon-cost 3, figment-creation 4. No
"Choose one" and no static "+✦" anthems among dream avatars; their power is mostly activated and
"when you …" triggered abilities.

- [ ] **At-start-of-turn passive** (gain ●/draw/foresee, conditional) — *Drusus Calvus*, *Threxan*, *Seld Rakor*, *Senemhet*. **[DET]**
- [ ] **Activated ● / ☪ / composite abilities** — *Vethran*, *Ossian*, *Kaleth*, *Caedryn*, *Kael Voss*, *Grath*, *Yveth Coravel*, etc. **[MIXED]**
- [ ] **Fast/Interrupt activated abilities** — *Calloway Flint* ("❖❖ – 4●, ☪"), *Edran* ("❖ – 4●, ☪"), *Zeva* ("❖❖ …"). **[DET]** timing flag
- [ ] **"When you play your second card/event/character"** — *Tessa*, *Seraveth*, *Rael*. **[DET]** trigger
- [ ] **Discard/void-synergy triggers** ("when you discard", "when a card leaves your void", reclaim-granting) — *Vrakmoth*, *Corvath*, *Vaela*. **[DET]** trigger; reclaim grant choice may be **[CHOICE]**
- [ ] **"unless the opponent pays N●"** interactive — *Karev Soltis*. **[CHOICE]** (opponent)
- [ ] **Copy (next event)** — *Kasane*. **[CHOICE]**
- [ ] **Figment creation** — *Edran* (outsider), *Kael Voss* (survivor), *Serenath Veyl* (figment-conditioned). **[DET]**

---

## Notes / flags for the rewrite

- **Phasing** (6 cards) has no definition in `battle_rules.md`. Needs a rule before it can be
  automated. Currently unclassifiable.
- Several figment types (Ancient, Enigma, Synth, Celestial) are not created by
  any card text but still need engine support because the figment table defines them and
  subtypes appear on real cards.
- The biggest automation wins are the **named triggers** (▸Materialized 81, ▸Dawn 41,
  ▸Dissolved 20) and **figment materialization** (177 materialize occurrences) — all [DET]
  trigger/placement; the engine fires the trigger and the *effect body* is what may need a
  [CHOICE] rail.
- Most heavy-lifting [CHOICE] surfaces are: target selection for **Dissolve/Abandon/Banish**,
  **void replay (Reclaim / "from your void")**, **Discover/Foresee/Discard selection**, **X-cost
  selection**, and **modal "Choose one"**.
