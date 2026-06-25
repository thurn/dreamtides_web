# Quest Prototype: Visual UI Guide

This document is a screen-by-screen visual reference for the current quest
prototype, written to brief a designer (e.g. Claude Design) on a mobile UI
redesign. It assumes the reader has read [quests.md](../../quests/quests.md),
which covers *what* each system does; this document covers *how each screen
presents and behaves today* — what is on screen, how it is laid out, and what
every clickable or hoverable element does.

All screenshots are captured at 1920×1080 (the prototype's design canvas) in a
desktop/landscape layout. Most screens also have a portrait layout for mobile;
where the portrait arrangement differs meaningfully it is called out in the text.

A note on what to ignore for redesign purposes: the prototype carries a layer of
**developer/debug affordances** that are not part of the player-facing game.
These include the "Load Quest" / "Create Game" room gate, the "Debug: Regenerate
Atlas" button, the battle **Inspector** panel, and the utility "⋯" menu's
developer entries (Pool Viewer, Package Debug, Why Cards, Why Journey, Edit Quest
State, Save/Load/Download Log). They are flagged inline so they can be excluded
from a player-facing design.

---

## Dreamcaller Selection (Quest Start)

![Dreamcaller selection screen](images/01-dreamcaller-selection.png)

**What it does.** This is the first screen of a run. The player picks 1 of 3
offered Dreamcallers; the pick performs all run bootstrap (starter deck, starting
essence, draft/dreamsign pools, the initial atlas) and drops the player into
Firstlight Meadow. It is the only place the Dreamcaller is chosen, and the choice
defines the entire run.

> **Reaching it:** in the prototype this screen is preceded by a developer "room
> gate" landing page (a "Dreamtides / Quest Multiplayer" splash with a **Create
> Game** button and a **Load Quest** dropdown). That gate is multiplayer/debug
> plumbing, not part of the intended player flow, and should be ignored for the
> redesign.

**Layout.** A large gradient "Dreamtides" wordmark and a "Choose Your
Dreamcaller" subtitle sit at the top center. Below them, three Dreamcaller cards
are laid out in a single horizontal row (they stack vertically in portrait). The
cards animate in from below on load.

**Each Dreamcaller card, top to bottom, contains:**

- **Name** (e.g. "Seld Rakor") and **title/epithet** (e.g. "Standing Orders") in
  the header.
- A **portrait panel** — a tall framed image of the Dreamcaller (intended to be a
  live 3D model with an idle animation).
- **Rules text** — the Dreamcaller's ongoing/triggered ability, rendered with
  inline keyword styling (e.g. "reclaim" shown as a styled term).
- **Starting Essence** value (e.g. "200" with the essence glyph).
- Below the card body, a **"Tides:" row** (for the default tides4 algorithm) —
  a vertical list of colored, icon-tagged tide pills naming the card pools this
  Dreamcaller will draft from. (When tides are present they replace a
  **"Signature Cards:"** list, which is shown instead for non-tides algorithms —
  a star-bulleted list of named signature cards.)

**What you can click:**

- **The Dreamcaller card itself** is the primary action — the entire card is a
  button. Clicking it selects that Dreamcaller and starts the run. (There is no
  separate "Select" button; the whole card is the hit target.) On hover the card
  lifts slightly and its border/glow brighten.

**What you can hover (these reveal information, important for the redesign):**

- **The rules-text block** — hovering reveals a popover defining any glossary
  terms used in the ability text (the same term-definition panel used beside
  cards elsewhere).
- **The "Tides:" / "Signature Cards:" label** has a small **ⓘ info icon** —
  hovering it explains what tides / signature cards are ("Pools of cards you will
  see during the quest. Different tides are used every time you play." /
  "These signature cards define this Dreamcaller's strategy and steer the draft
  pool toward them.").
- **Each tide pill** — hovering shows a tooltip describing that tide's theme /
  contents.

**Redesign notes.** The core information hierarchy per Dreamcaller is: identity
(name + portrait + epithet) → power (ability text) → economy (starting essence) →
draft direction (tides). The whole card is the tap target, which on mobile may
want an explicit confirm step. A large amount of secondary information (tide
descriptions, glossary terms) lives only in hover popovers and will need a
touch-friendly equivalent (long-press / tap-to-expand) on mobile.

---

## Dream Atlas

![Dream Atlas screen](images/02-dream-atlas.png)

**What it does.** The Dream Atlas is the between-dreamscapes world map. It shows
the full 7-layer branching path from Firstlight Meadow to the final boss in
Limbo, tracks the player's progress, and is where the player chooses which
dreamscape to enter next. The player threads one node per layer toward the boss.

**Layout.** The whole map is a fixed 1920×1080 stage that uniformly scales to fit
the viewport (letterboxed), over a dark, drifting "dream mote" particle
background.

- **Top-left title block:** "Dream Atlas" heading and a subtitle that reads
  "Layer <N> · Choose your next dream" (or "Seven layers to the final dream").
- **Layer numerals I–VII** are watermarked across the top, one per column.
- **The node graph** fills the center: circular nodes arranged in 7 vertical
  columns (layers), joined by glowing connection lines (edges). Firstlight Meadow
  is the single node on the far left; the red boss node (Limbo) is on the far
  right and is always revealed.
- **Persistent bottom HUD** (rendered app-wide; see HUD section) shows essence,
  deck size, Dreamcaller portrait, dreamsigns, "Battles won N/7", and the View
  Deck / Glossary / utility buttons.
- **Top-right:** a **"🔄 Debug: Regenerate Atlas"** button — *developer only,
  ignore for redesign.*

**Node states are visually distinct** (this is central to the screen and must be
preserved): unrevealed (empty gray frame), revealed-but-locked (shows its
dreamscape icon, future layer), available (reachable now — its incoming edge is
drawn as a bright animated "open" line), completed (visited/won), and forgone
(dimmed; the route not taken). Edges originating at or before the current layer
are solid; edges reaching into still-locked layers are dotted.

**Node faces** show: the starter shows a meadow icon with subtle "you started
here" emphasis; the boss shows a skull/boss icon in a red frame; a revealed
dreamscape shows its circular scene icon plus a small **signature-site badge
icon** (the enhanced site it guarantees). A node carrying a **known dreamsign**
also shows that dreamsign in its corner.

**What you can click:**

- **An "available" node** — clicking it sets that dreamscape as the current
  destination and enters its Dreamscape screen. Only available nodes respond to
  clicks; all other states are non-interactive.

**What you can hover / long-press (reveals a floating preview card beside the
node):**

- **A revealed dreamscape node** → a rich preview card showing: the dreamscape's
  **scene art** and **name**, the **resident Dream Guide** (name + portrait), the
  **signature Site**, the guide's home-specialty **Bonus** text, and the
  **Affiliation** pill. The preview auto-flips to whichever side has room.
- **The boss node** → a red "Final Battle" preview naming Apollyon and describing
  the run's specific incarnation (title + deck description).
- **An unrevealed node** → a compact "An Unseen Dream" placeholder card.
- **A node carrying a known dreamsign** → an additional dreamsign card appears
  next to the preview, showing the dreamsign art, name, and full rules text.
- **Firstlight Meadow** → a short "a quiet place where every dream quest begins"
  preview (no guide/affiliation).

**Redesign notes.** This screen is information-dense and relies heavily on
hover previews to convey what each node offers; on mobile that detail needs a
tap/long-press treatment, and the previews are large (up to ~560px wide plus a
~308px dreamsign card) so they will not fit beside a node on a phone. The node
state vocabulary (5 states + 4 edge styles) is the screen's core visual language
and must remain legible at small sizes. The 7-column horizontal layout is
inherently wide and is the biggest portrait-orientation challenge.

---

## Battle Mode

Battle Mode is the core card-game match against an AI opponent. It has two
distinct screens: the **Battle Start** intro and the **in-battle board**.

### Battle Start (pre-battle intro)

![Battle Start screen](images/03a-battle-start.png)

**What it does.** Shown when the player arrives at a Battle site, before the
match begins. It introduces the opposing Dreamcaller so the player can read its
abilities and deck before committing.

**Layout.** A cinematic split layout over the dreamscape's scene art: the enemy
Dreamcaller's full-body figure stands on the left; a text column on the right
holds, top to bottom:

- The enemy Dreamcaller's **name** (e.g. "Seraveth") and **title** ("Twice-
  Mourned").
- An **Ability** block with the Dreamcaller's rules text (keyword-styled).
- A **Signature Cards** row of 3 face-up card thumbnails.
- A stats line: the **score-to-win** for the battle (e.g. "10 to win") and the
  **essence reward** (e.g. "100 essence").
- A primary **"Begin Battle"** button.

If the opponent carries dreamsigns (mid-run onward), those are shown here too.

**What you can click:**

- **Begin Battle** — starts the match: the camera transitions to the board, both
  Dreamcallers take their battle positions, decks animate in, and opening hands
  are dealt.

**What you can hover:** the ability text and signature card thumbnails surface
term definitions / card detail, as elsewhere in the app.

### In-Battle Board

![In-battle board](images/03b-battle-play.png)

**What it does.** The live card match, played under the rules in
[battle_rules.md](../../battle_rules/battle_rules.md). The board is symmetric
(enemy at top, player at bottom) with shared zones in the middle.

**Layout.** The board occupies the full screen. Key regions:

- **Turn / phase indicator** (top-left "Turn 1") and a **phase rail** across the
  top — DREAMWELL · DAY · DUSK · NIGHT · CHALLENGE — marking the current phase of
  the turn.
- **Battlefield lanes** in the center where characters are played; each side has
  a row of card slots, arranged as opposing front ranks for the Challenge phase.
- **Per-side status clusters** showing **score** (points toward the win
  threshold), **energy** (the resource for playing cards), the **Dreamwell**, and
  zone counters for **Void** and **Banished**, plus a **Draw Card** affordance.
- **The player's hand** is a fan/row of face-up cards along the bottom.
- A **card detail popup** appears when a card is focused, showing its full art
  and rules text (e.g. the "Sign of Arrival" event card in the screenshot).
- **Bottom-left tabs:** Deck / Stream / Log controls for inspecting battle state.

**What you can click / interact with:**

- **Cards in hand** — select/play a card (paying its energy cost).
- **Board characters** — select, reposition, and declare challengers per the
  battle rules.
- **Phase / Draw / advance controls** — move the turn forward (much routine
  bookkeeping is handled by "Basic Automation" by default).
- **Score/energy/zone clusters** — clicking the Void/Banished counters opens
  those zones for inspection.

> **Developer panel — ignore for redesign:** the right-hand **Inspector** panel
> (battle state dump, "No active AI proposal", Pool Viewer / Show enemy hand /
> Hide player hand toggles, "Skip to rewards" / "Force reload" / "Reset battle"
> actions, energy/score/draw debug steppers) is a debug surface, not part of the
> player-facing battle. The intended battle UI is the board, hand, phase rail,
> and per-side status clusters only.

**Redesign notes.** This is by far the most complex screen and the hardest to fit
to portrait: it must show two symmetric boards, multiple shared zones, a phase
timeline, per-side resources, and the hand simultaneously. The debug Inspector
currently eats roughly a third of the horizontal space and should be removed from
design consideration entirely. The phase rail and the score/energy/Dreamwell
clusters are the persistent "chrome" a mobile layout will need to keep glanceable
while maximizing room for the board and hand.
