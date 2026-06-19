# Gamble Site Designs: Farpoint Station

Five gambling / push-your-luck dialogue flows for the **Gamble** site, run by
**Gravok** in the **Farpoint Station** dreamscape. Each flow is a simple
"pick one" UI — the player clicks a button for the option they want, and the
only effects involved are gaining or losing essence, gaining a card, gaining a
dreamsign, or gaining a [Bane](../quests/quests.md). No bespoke rules-engine
work is required beyond resolving a roll and applying one of those outcomes.

The design space and terminology here are drawn from
[Gambling, Push-Your-Luck & Repeated-Choice Event Mechanics](gambling-push-your-luck-mechanics.md).

## Shared frame

The survey's central lesson is to **pick a stake the player feels, and choose
attrition vs. collapse deliberately**. The quest stake vocabulary maps cleanly
onto the genre's chips:

- **Essence** is the HP-equivalent chip: finite-but-renewable (battle rewards,
  essence sites), capped at 500 by default, so spending it is self-limiting.
- **Banes** are the curse-equivalent long-tail cost. The quest design already
  names banes as the downside of a losing Gamble, so they are the natural
  collapse / house-edge penalty.
- **Cards / deck slots** are the max-HP-equivalent highest-stakes chip, reserved
  for the biggest commitments.

All five designs obey the same contract:

- **Published odds.** Every probability and payout is shown to the player before
  they commit, so push-your-luck is a calculable expected-value decision.
- **Leave / stop after each revealed step.** Outcomes resolve before the player
  decides whether to continue, so overreaching is self-authored greed and
  stopping feels like discipline.
- **Full reconstructability.** Every roll, its published odds, and its outcome
  are written to `logs/quest-log.jsonl` so any production gamble can be
  reconstructed after the fact.
- **TOML configuration.** All entry fees, odds tables, payouts, reward tiers, and
  home-specialty overrides are configured in TOML and are subject to change.

Gravok's **Home Specialty** in Farpoint Station is uniformly "no entry fee and
bigger payouts," tuned per design below. The dreamscape's **affiliation** is
**Figments**, which design 4 leans on thematically.

The set is spread across the taxonomy on purpose, rather than being an
accidental monoculture:

| # | Design | Model | Stake | Downside | Steps |
| - | ------ | ----- | ----- | -------- | ----- |
| 1 | Crystal Roll | one-shot gamble | essence | lose the fee | commit once |
| 2 | The Conveyor | attrition | essence | overspend | step-by-step |
| 3 | Pressure Vault | collapse | essence pot | lose pot + gain a bane | step-by-step |
| 4 | Figment Reactor | collapse | a deck card | banish the card | 1–2 steps |
| 5 | Overclock Wager | deterministic greed | essence (banes as cost) | accrue banes | step-by-step |

---

## 1. Crystal Roll — one-shot, pick-your-odds

The clean, fast bet. Gravok rattles two crystal dice. This is the
"one decision, then it resolves" pole of the genre — the cleanest to implement
and a good baseline.

**Flow.** Pay an **entry fee of 50 essence**, then **pick one**:

- **Safe Bet** — *65%* chance to win **+120 essence**, otherwise nothing.
- **Long Shot** — *25%* chance to win **+320 essence**, otherwise nothing.

A third **Decline** button allows a free walk-away before paying the fee. The
result resolves once, animates, and the visit ends.

Both bets sit near EV-neutral after the fee (safe ≈ +28, long ≈ +30 net), so the
choice is a pure variance preference rather than a correct answer.

**Home Specialty.** No entry fee, and payouts are bumped to **+150 / +400**,
turning a coin-flip into clearly positive expected value.

---

## 2. The Conveyor — attrition push-your-luck, leave anytime

Calm, calculable, and incapable of catastrophe — the dopamine-per-pull model.
The only risk is *overspending*; the player can never be wiped, only bled. It
doubles as a soft mini-shop.

**Flow.** Each pull costs escalating essence and grants a **guaranteed reward of
rising quality**:

| Pull | Cost | Reward |
| ---- | ---- | ------ |
| 1 | 30 | a single draft-style card pick (1 of 4) |
| 2 | 50 | a card pick from a stronger sub-pool |
| 3 | 70 | a card pick plus 60 essence back |
| 4 | 100 | a dreamsign offer |

After every pull the player chooses **"Pull again (cost N)"** or **"Leave."**
They stop when the marginal cost outruns the value — self-authored greed against
a draining resource.

This is the genre's signature shape: two curves (cost rising, value rising)
crossing.

**Home Specialty.** The first pull is free, and every reward tier is shifted up
one rung.

---

## 3. Pressure Vault — collapse push-your-luck, lose the banked pot

The spiky, thrilling one. The fear is *losing it all*, and the catastrophe is a
**bane** layered on top of forfeiting the pot. Banking feels like discipline;
busting is a real feel-bad.

**Flow.** A held **pot** grows with each crack, and the bust chance escalates
and is shown:

| Crack | Pot becomes | Bust chance |
| ----- | ----------- | ----------- |
| 1 | 60 | 0% |
| 2 | 140 | 15% |
| 3 | 240 | 35% |
| 4 | 380 | 60% |

After each crack the player chooses **"Bank it"** (take the pot as essence and
end) or **"Crack again"** (roll the bust chance). On a **bust** the player loses
the entire pot **and gains a Bane**.

This is the only design that can wipe banked value, and the bane it grants gives
[Purge](../quests/quests.md) sites something to clean up later, tying the systems
together.

**Home Specialty.** Bust odds are halved and pot increments are larger — Gravok
is genuinely generous at home.

---

## 4. Figment Reactor — stake a deck card, asset-collapse

The highest-stakes chip: a permanent deck asset. Themed to Farpoint Station's
**Figments** affiliation, with Gravok "overcharging" a card in the reactor.

**Flow.** The site shows **4 cards from the deck** (subject to the dreamscape's
affiliation nudge). The player **picks one to insert**, or Declines.

- **Step 1** — *50%* the card is **duplicated** (a copy added to the deck);
  *50%* the card is **banished** (lost).
- If it duplicated, the player chooses **"Stop"** (keep both copies) or
  **"Overcharge again"**: *35%* yields a *second* copy plus a free
  Empowered/Kindled-style transfiguration on all copies; *65%* loses one copy
  back.

This is distinct because the stake is a deck slot rather than essence — a
scarier, more memorable wager, and the only flow that interacts with the deck
directly.

**Home Specialty.** Step 1 becomes a *70%* duplicate, and a bust banishes
nothing (a pity backstop, so maximum commitment is never pure waste).

---

## 5. Overclock Wager — long-tail curse cost instead of resource loss

A double-or-nothing where the price of greed is **deck pollution, not losing
essence** — often a scarier deterrent because a bane can't be healed away. This
flow is deterministic (no dice), making it the most legible: pure
greed-versus-long-tail-cost.

**Flow.** Start with a base payout pool of **80 essence**. Each step, **pick
one**:

- **"Cash out"** — take the current pool as essence and end.
- **"Overclock"** — the pool **doubles** (80 → 160 → 320 → 500, capped at the
  essence cap), **and you gain one Bane.**

So the first bane buys +80, the second buys +160, and so on. The player weighs a
fat essence haul against a growing tax they will feel for the rest of the run and
may have to pay Master Takeshi to purge.

**Home Specialty.** The first Overclock adds **no** bane (one free doubling), and
the essence cap is lifted for this payout.

---

## Implementation notes

Every flow reduces to the same primitives, so a single Gamble-site controller can
host all five:

- **Effects:** gain/lose essence, add a card to the deck, banish a card from the
  deck, add a dreamsign, add a bane.
- **State:** a per-visit step counter, an optional held pot, and (for design 4)
  the staked card.
- **Resolution:** a single weighted roll against a TOML-defined odds table, with
  the roll, the odds, and the outcome logged.

Which of the five flows a given Gamble site presents is itself a TOML-configured
choice, so the site can vary its game between appearances.
