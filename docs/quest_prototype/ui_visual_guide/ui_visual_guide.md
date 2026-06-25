# Quest Prototype: Visual UI Guide

This document is a screen-by-screen visual reference for the current quest
prototype, written to brief a designer (e.g. Claude Design) on a mobile UI
redesign. It assumes the reader has read [quests.md](../../quests/quests.md),
which covers *what* each system does; this document covers *how each screen
presents and behaves today* — what is on screen, how it is laid out, and what
every clickable or hoverable element does. The guiding question for each screen
is: "what are all the things you can click or hover here, where are they, and
what do they do?"

Each screen below is its own top-level (`#`) section. Screenshots are captured at
1920×1080 (the prototype's design canvas) in a desktop/landscape layout. Most
screens also have a portrait layout for mobile; where the portrait arrangement
differs meaningfully it is called out in the text.

**On developer/debug surfaces.** The prototype carries a layer of
developer/debug affordances mixed into the player UI: the "Create Game" / "Load
Quest" room gate, the "Debug: Regenerate Atlas" button, the battle **Inspector**
panel, the per-card right-click context menu, and the "⋯" utility menu's
developer entries (Pool Viewer, Package Debug, Why Cards, Why Journey, Edit Quest
State, Save/Load/Download Log). These are documented here rather than hidden, but
they are **not part of the player-facing game**. In a mobile redesign they should
become their own separate, dedicated screens (a developer/debug screen reachable
from a menu), not panels and overlays crowded into the live gameplay screens.
They are flagged inline wherever they appear.

---

# Dreamcaller Selection (Quest Start)

![Dreamcaller selection screen](images/01-dreamcaller-selection.png)

**What it does.** This is the first screen of a run. The player picks 1 of 3
offered Dreamcallers; the pick performs all run bootstrap (adds the fixed starter
deck, grants starting essence, builds the draft and dreamsign pools from the
Dreamcaller's tides, generates the initial atlas) and drops the player into
Firstlight Meadow. It is the only place the Dreamcaller is chosen, and the choice
defines the entire run, so the screen's job is to let the player compare three
distinct play identities at a glance and commit.

> **Developer surface (separate mobile screen):** in the prototype this screen is
> preceded by a "room gate" landing page — a centered "Dreamtides / Quest
> Multiplayer" splash with a glowing **Create Game** button and a **Load Quest ▾**
> dropdown in the top-right. That gate is multiplayer/debug plumbing for creating
> or rejoining a shared room. For a player-facing design it should be replaced by
> a normal title/menu screen (or skipped entirely); the saved-run loading belongs
> on a dedicated developer screen.

**Overall layout.** Centered, vertically-stacked composition on a near-black
backdrop with a faint purple vignette:

1. A large gradient **"Dreamtides"** wordmark (purple, glowing) at top center.
2. A **"Choose Your Dreamcaller"** subtitle beneath it.
3. A single horizontal **row of three Dreamcaller cards**, equal width, centered.
   On load the title drops in from above, the subtitle fades in, and the three
   cards rise into place with a slight stagger. On mobile/portrait the three
   cards stack vertically instead of sitting in a row.

**Anatomy of a single Dreamcaller card** (top to bottom — every card is
identical in structure):

- **Header:** the Dreamcaller's **name** (e.g. "Seld Rakor") in bold, with its
  **title/epithet** (e.g. "Standing Orders") in italic beneath it.
- **Portrait panel:** a tall, rounded, framed image of the Dreamcaller filling
  most of the card. This is intended to be a live 3D character model performing an
  idle animation; in the current build it renders as a framed portrait.
- **Ability (rules text):** the Dreamcaller's ongoing/triggered ability, rendered
  with the app's shared rules-text styling — keyword terms (e.g. "reclaim") are
  visually highlighted inline exactly as they appear on cards.
- **Starting Essence:** a small labelled line ("STARTING ESSENCE") with the value
  (e.g. "200") shown using the essence glyph/styling used everywhere essence
  appears.
- **Draft direction:** below the card body, a **"Tides:" row** — a small label
  with an info icon, then a vertical list of **colored, icon-tagged tide pills**
  naming the card pools this Dreamcaller will draft from (up to 4 shown, largest
  first). This is how the player reads what kind of deck this Dreamcaller steers
  toward. (For non-tides draft algorithms this is replaced by a **"Signature
  Cards:"** list — a star-bulleted vertical list of named signature cards. Only
  one of the two appears.)

**What you can click:**

- **The whole Dreamcaller card is a single large button.** There is no separate
  "Select" control — clicking anywhere on the card selects that Dreamcaller and
  immediately starts the run. On hover the card lifts a few pixels and its border
  and outer glow brighten to signal it is the active target; on press it scales
  down slightly. This makes the entire card a generous hit target, which is
  good for touch, but it also means there is no distinct confirm step — a single
  tap commits the entire run, which a mobile design may want to gate behind an
  explicit confirm.

**What you can hover / long-press (these reveal information that exists *only* on
hover today — important to re-home for touch):**

- **The ability text block** → a popover that defines any glossary terms used in
  the ability (the same term-definition panel shown beside cards elsewhere). So
  the full meaning of the ability is only available on hover.
- **The "Tides:" / "Signature Cards:" label's ⓘ info icon** → a tooltip
  explaining the concept ("Pools of cards you will see during the quest.
  Different tides are used every time you play." / "These signature cards define
  this Dreamcaller's strategy and steer the draft pool toward them.").
- **Each individual tide pill** → a tooltip describing that specific tide's theme
  and contents (its summary/description).

**Redesign notes.** The information hierarchy per Dreamcaller is: identity (name
+ portrait + epithet) → power (ability text) → economy (starting essence) →
draft direction (tides). Three of these cards must be comparable side-by-side,
which the portrait-heavy layout makes hard on a narrow screen — vertical stacking
forces scrolling and loses the at-a-glance comparison. A large amount of
secondary, decision-relevant detail (each tide's meaning, glossary terms) lives
exclusively in hover popovers and needs a first-class touch equivalent
(tap-to-expand / long-press / detail sheet). Consider whether "tap card = start
run" should become "tap card = expand detail, then confirm."

---

# Dream Atlas

![Dream Atlas screen](images/02-dream-atlas.png)

**What it does.** The Dream Atlas is the between-dreamscapes world map and the
hub the player returns to after every battle. It renders the entire run as a
7-layer branching graph from Firstlight Meadow (left) to the final boss in Limbo
(right), shows how far the player has progressed, and is where the player chooses
which dreamscape to enter next. The player threads exactly one node per layer
toward the boss; the map is never pruned, so the chosen and forgone routes both
stay visible.

**Stage and framing.** The whole map is a fixed 1920×1080 "stage" that uniformly
scales to fit the viewport and is letterboxed (it never reflows — it just shrinks
to fit, which on a tall phone leaves large empty bands). The background is a dark
purple "dream" wash with ~26 slowly drifting glowing "mote" particles for
atmosphere. Fixed overlays sit on top of the scaling stage:

- **Top-left title block:** a "Dream Atlas" heading and a subtitle reading
  "Layer <N> · Choose your next dream" (or "Seven layers to the final dream" when
  nothing is selectable).
- **Layer numerals I–VII** are drawn as large faint watermarks across the top,
  one centered over each column, so the player can read which layer is which.
- **The node graph** fills the center (see below).
- **Persistent bottom HUD** (rendered app-wide; see the HUD section) runs along
  the bottom edge with essence, deck size, Dreamcaller portrait, dreamsigns,
  "Battles won N/7", and the View Deck / Glossary / utility buttons.
- **Top-right "🔄 Debug: Regenerate Atlas" button.** *Developer surface —
  on mobile this belongs on the separate developer screen, not on the map.* It
  discards and rebuilds the atlas at the current progress depth for live
  iteration on map generation.

**The node graph.** Circular nodes are arranged in 7 vertical columns (one per
layer), connected by glowing lines (edges). Firstlight Meadow is the single
larger node on the far left; the red boss node (Limbo) is the larger node on the
far right and is **always revealed** from the start so the destination is visible.
Node and edge appearance encode the run's state and are the screen's core visual
language:

**Node states** (each visually distinct, and this distinction is the whole point
of the screen):
- **Unrevealed** — an empty gray round frame (dreamscape not yet known).
- **Revealed-locked** — shows its dreamscape's circular scene icon, but sits in a
  future layer that can't be chosen yet.
- **Available** — reachable from the just-completed node; selectable now. Its
  incoming edge is drawn as a bright, animated "open" flow line.
- **Completed** — a dreamscape already visited and won.
- **Forgone** — was revealed/reachable but the player took a different route;
  rendered dimmed, can never be visited.

**Node faces:**
- The **starter** shows a meadow/flag icon with subtle "you started here"
  emphasis.
- The **boss** shows a skull/boss icon in a red frame.
- A **revealed dreamscape** shows its circular scene icon plus a small
  **signature-site badge icon** in the corner — the enhanced site that dreamscape
  is guaranteed to offer (this, plus the name, is how the player reads what a
  dreamscape specializes in before entering).
- A node carrying a **known dreamsign** additionally shows that dreamsign's icon
  in its corner.

**Edge styles:** edges originating at or before the current choice layer are
drawn **solid** (routes the player can already reason about); edges reaching
forward into still-locked layers are **dotted** (speculative). Completed→completed
edges read as "traveled"; completed→available edges get the animated "open" flow.
Edges never cross.

**What you can click:**

- **An "available" node** — clicking it sets that dreamscape as the current
  destination and navigates to its Dreamscape screen. Only `available` nodes are
  clickable; nodes in every other state are inert.
- *(Developer)* the "Debug: Regenerate Atlas" button.

**What you can hover / long-press — the heart of this screen's information.**
Hovering a node pops a large **floating preview card** that auto-flips to whichever
side of the node has room and is vertically clamped to stay on stage. There are
three preview variants plus an optional companion card:

- **Revealed dreamscape → full preview** (≈560px wide): the dreamscape's **scene
  art** banner with its **name**; the resident **Dream Guide**'s name and
  portrait figure; and three info rows — **Site** (the signature site name +
  icon), **Bonus** (the guide's home-specialty text), and **Affiliation** (a
  named pill, or "None — a neutral on-ramp"). This is where the player learns
  what a dreamscape actually offers.
- **Boss node → red "Final Battle" preview**: Limbo's scene art, the boss figure,
  and rows naming **Apollyon** and describing the run's specific **incarnation**
  (its title and short deck description), so the player can scout the final fight.
- **Unrevealed node → compact "An Unseen Dream" card**: a short placeholder
  explaining the node is revealed only as the player draws near.
- **Firstlight Meadow → a short "a quiet place where every dream quest begins"
  note** (no guide/affiliation rows).
- **Known-dreamsign companion card** (≈308px): when a hovered node carries a known
  dreamsign, a second card appears beside the preview showing the dreamsign's art,
  name, and full rules text.

**Redesign notes.** This is the most information-dense navigation screen, and
nearly all of its decision-relevant content (what each dreamscape offers: guide,
site, bonus, affiliation, any known dreamsign) lives only in hover previews that
are far too large (up to ~560 + ~308 px wide) to sit beside a node on a phone.
The 7-column horizontal graph is inherently wide and is the single biggest
portrait-orientation challenge in the app — letterbox-scaling it to a tall screen
would make nodes tiny. The five node states and four edge styles are a rich
visual vocabulary that must survive at small sizes. A mobile design likely needs
a fundamentally different presentation of the same graph (e.g. vertical scroll
layer-by-layer, tap-a-node-to-open-a-detail-sheet) rather than a scaled-down copy
of the desktop map.

---

# Battle Start (Pre-Battle Intro)

![Battle Start screen](images/03a-battle-start.png)

**What it does.** Shown when the player arrives at a Battle site, before the match
begins. Its job is to introduce the opposing Dreamcaller — its abilities,
signature cards, and any dreamsigns — and state the stakes (score to win, essence
reward) so the player can scout the fight before committing to it. Clicking
through starts the match.

**Layout.** A cinematic split composition rendered over the dreamscape's scene
art, dimmed for contrast:

- **Left:** the enemy Dreamcaller's **full-body figure**, lit with ambient
  particle/glow effects, occupying the left half (intended to be the animated 3D
  model in its "card" presentation).
- **Right:** a text column, top to bottom:
  - the enemy Dreamcaller's **name** (e.g. "Seraveth", large serif) and
    **title/subtitle** beneath it (e.g. "Twice-Mourned", italic);
  - an **"ABILITY"** label and the Dreamcaller's **rules text**, with keyword
    terms (e.g. "reclaim") highlighted inline;
  - a **"SIGNATURE CARDS"** label and a **row of 3 face-up card thumbnails**;
  - a stats line pairing the **score to win** for this battle (e.g. "10 to win")
    with the **essence reward** (e.g. "100 essence"), each with its glyph;
  - a primary **"Begin Battle"** button (purple, glowing) below the stats.
- If the opponent carries **dreamsigns** (from the run's midpoint onward), those
  are surfaced here as well so the player can see the opponent's passive effects.

In portrait the figure moves to the top and the text column flows beneath it.

**What you can click:**

- **Begin Battle** — starts the match. The camera transitions from this intro to
  the battle board: the enemy Dreamcaller animates to its battle position (small
  head-only card), both decks and the player's Dreamcaller animate to their
  starting spots, and opening hands are dealt to both sides. This is the single
  forward action on the screen.

**What you can hover / long-press:**

- **The ability text** → glossary term definitions, as on the Dreamcaller select
  screen and on cards.
- **Each signature card thumbnail** → an enlarged card preview with full art and
  rules text.
- **Any opponent dreamsign** (when present) → the full dreamsign card on hover.

**Redesign notes.** This screen is mostly presentational and translates to mobile
relatively cleanly (figure on top, scouting info + a single big "Begin Battle"
button below). The key content to preserve is the *scouting* function — ability,
signature cards, dreamsigns, and the win/reward stakes must all be legible before
the player commits, and the card/dreamsign detail currently locked behind hover
needs a tap equivalent.

---

# Battle Board (In-Battle)

![In-battle board](images/03b-battle-play.png)

**What it does.** The live card match, played under the rules in
[battle_rules.md](../../battle_rules/battle_rules.md). The board is **symmetric**:
the two sides mirror each other around a central battlefield, with the local
player anchored at the bottom and the opponent at the top. By default a local AI
drives the opponent and "Basic Automation" handles routine rules bookkeeping, so
the player mostly plays cards and advances phases. This is by far the most complex
and information-dense screen in the app.

> **Screenshot note:** the capture above has the developer **Inspector** open
> along the right edge, which compresses the board. The Inspector is a debug
> surface (detailed at the end of this section) and is **not part of the
> player-facing battle** — picture the board widened to fill the space it
> occupies.

**Top chrome — the Status Bar.** A bar across the very top carries the global
match state: the **turn / round number** ("Turn 1"), a **phase rail** naming the
turn's phases — **DREAMWELL · DAY · DUSK · NIGHT · CHALLENGE** — with the current
phase highlighted, and both sides' **scores** (points toward the win threshold).
The active phase advances through this sequence; in manual mode the phase names
act as controls to set the phase. A screen-reader live region (not visible)
announces "<side> Turn N <Phase>" as state changes.

**AI proposal banner.** Just under the status bar, a slim banner appears while the
AI opponent holds an un-approved move ("AI proposes: …") or is computing one
("AI · Thinking…"). While a proposal is held, the player's own board controls are
locked and the human acts only through the approve/reject icons in the phase
cluster (see below). The banner renders nothing on the human's own turn.

**Central battlefield (top → bottom).** The middle of the screen is the shared
battlefield, stacked as opposing ranks:

- **Enemy back rank**, then **enemy front rank** (the opponent's character slots);
- a **judgment divider** line across the middle that lights up ("active") during
  the **Challenge** phase, when opposing front ranks fight;
- **player front rank**, then **player back rank** (the local player's slots).

Each rank is a row of card slots; characters are played into slots and can be
repositioned. Above the battlefield, during the Dreamwell phase (turn 2+), the
current **Dreamwell card** for the active side is shown centered (the card that
ramps energy / draws for the turn).

**Side columns (flanking the battlefield).** To the left and right of the
battlefield sit two **side-zone columns**, one per side, each containing:

- a **Void** and a **Banished** small-zone button, each showing a count; clicking
  one opens that zone's full **card browser**, and cards can be dragged onto them;
- a **Status Strip** for that side showing the side's **Dreamcaller portrait**
  (name + title), **energy** (current/max — the resource for playing cards),
  **score**, and a **Draw Card** control, with the active side highlighted.
  Clicking the portrait opens that side's **summary popover** (Dreamcaller ability
  + dreamsigns). The strip also exposes per-side energy/score/draw steppers used
  for manual play and debugging.

There is also a **Stack zone** (labeled "Stack") used while a card/effect is
resolving, with per-entry "Void" / "Banish" resolution buttons, and it accepts
dropped cards.

**The player's hand.** A **hand tray** runs along the bottom: the local player's
cards fanned/rowed face-up, showing each card's cost and art. (A debug mode can
hide the player's hand and/or reveal the opponent's hand in a tray at top.)

**Bottom Action Bar.** Below the hand, a row of controls: **Undo / Redo**, a
**Basic Automation** on/off gear toggle, a **Battle Log** toggle (opens a
side drawer of the full command history), a **Dreamwell History** toggle (the
drawer of revealed Dreamwell cards), and the **Inspector** toggle.

**What you can click / interact with (player actions):**

- **Cards in hand** — double-click (or drag) plays a card to the battlefield,
  paying its energy cost (automation routes events to the void and spends energy);
  right-click opens a context menu of card actions; hover shows an enlarged
  preview.
- **Battlefield characters** — drag to reposition/swap slots; drag cross-side or
  to a zone to move; right-click for the context menu; hover for the enlarged
  card preview.
- **Phase controls / phase rail** — advance the turn. Much routine work
  (spending energy, ramping/drawing at start of turn, clearing exhaustion at
  Dawn, resolving the Challenge, enforcing the hand limit, advancing bookend
  phases) is handled automatically by Basic Automation; with it off, every step
  is manual.
- **The AI approve / reject icons** (in the phase cluster) — when the AI holds a
  proposal, a check **approves** it (committing it to shared state) and a cross
  **rejects** a proposed card play.
- **Void / Banished / Stack zones** — click to open a zone's card browser; drop
  cards onto them to move cards there.
- **Side Status Strip portrait** — opens the side's Dreamcaller/dreamsign summary.
- **Action Bar buttons** — Undo, Redo, toggle Automation, Battle Log, Dreamwell
  History, Inspector.

**Overlays this screen can raise** (each a modal/drawer over the board): the
**zone browser** (full contents of a void/banished/deck zone), a **card picker**
and a **choice prompt** (for effects that ask the player to pick cards or choose
an option), a **Foresee** overlay (look at / reorder the top of a deck), a
**deck-order picker**, the **side summary** popover, the **Dreamcaller panel**,
the **Battle Log** and **Dreamwell History** drawers, and finally the
**result/reward overlay** when the battle ends (Victory shows the reward surface;
Defeat shows the result overlay with a reset path — see the Victory/Defeat
screen).

> **Developer surfaces on this screen** (each should be its own separate screen
> on mobile, not an inline panel): the **Battle Inspector** (right-edge drawer —
> documented in its own section below), the **right-click card context menu**
> (per-card debug actions and card notes), and the board's manual
> energy/score/phase steppers built into the status strips for hand-driven/debug
> play. The intended player-facing battle is the status bar + phase rail, the
> symmetric battlefield, the side status strips (score/energy), the hand tray, and
> the minimal action bar — everything else is developer tooling.

**Redesign notes.** This is the hardest screen to fit to portrait: it must
simultaneously present two mirrored multi-rank boards, two side columns of
resources and zones, a phase timeline, a stack, the hand, and an action bar.
The developer Inspector currently consumes roughly a third of the width and
should be removed from gameplay-layout consideration entirely (re-homed to a
separate debug screen). The persistent "chrome" a mobile layout must keep
glanceable is small but essential: whose turn / which phase, both scores, and the
active side's energy and hand. The biggest spatial tension is that a symmetric
top-vs-bottom board plus a bottom hand and bottom action bar all compete for
vertical space on a phone; the side columns (zones + status strips) have no
natural home in a narrow layout and will likely need to collapse into
tap-to-open chips.

---

# Battle Inspector (Developer)

![Battle Inspector panel](images/04-battle-inspector.png)

**What it does.** The Inspector is a **developer/debug panel** for the battle
board — a live read-out of battle state plus a dense set of tools for forcing
state, editing each side, and inspecting the AI. It is **not part of the
player-facing game**; it is promoted to its own section here because it is a
large, complex sub-UI. On desktop it is a right-edge drawer that is open by
default at wide widths; on a narrow layout it collapses to an "INSPECT" handle.
In a mobile redesign this belongs on a **separate developer screen**, not docked
beside the live board.

**How it opens.** A vertical **"INSPECT" / "CLOSE" handle** rides the right edge
of the board; clicking it toggles the drawer. The Action Bar's Inspector button
toggles the same drawer. When open it shows a header ("Inspector" + an ✕ close)
above a scrolling body of sections.

**Sections, top to bottom:**

- **Battle State** — a read-out: chips for the current **Turn**, **phase**,
  **active side**, and **result** ("Live" until decided); the **Battle**
  (opponent name); per-side **zone counts** in a compact code (H=hand, D=deck,
  V=void, B=banished, Bk=back rank, Fr=front rank); the **Stack** size; and the
  **Dreamwell order** band of the next Dreamwell card.
- **AI Reasoning** (only in AI battles) — the planner's read on the current
  decision: the held **Proposal** description, its **Kind**, the **Card** and
  **Target** involved, the **Heuristic** score before→after, a live static
  **board evaluation** ("Live eval", or "win"/"loss" when decided), the fixed
  **Planner** settings ("beam 12 · expectiminimax · sample 8"), and a count of
  **recent AI choices** with the latest rationale.
- **Visibility** — chip buttons: **Pool Viewer** (open the card-pool browser),
  **Show / Hide enemy hand**, and **Hide / Show player hand** (the
  multiplayer-view simulation).
- **Result** — chip buttons to force an outcome: **Skip to rewards**, **Force
  defeat**, **Force draw**, and a red **Reset battle**.
- **Your state** and **Enemy state** — one editor block per side, each with:
  stepper rows for **Energy**, **Max energy**, and **Score**; a **Draw / discard**
  row (**+1 Draw**, **Discard**); a **Deck tools** row (**Foresee**, **Shuffle**,
  **Open Deck**); a **Dreamwell + draw** button (run the energy ramp + draw); an
  **Erode** row (a count stepper + an "Erode N" button that mills the top N cards);
  and a **Side actions** row (**Create Figment**).
- **History** — **↶ Undo** and **↷ Redo** chips (disabled when there is nothing to
  undo/redo).

**What you can click:** every item above is a control — read-outs in Battle State
/ AI Reasoning are passive, and everything in Visibility, Result, the per-side
editors, and History is an actionable chip, stepper, or button. Several of these
open their own overlays (Pool Viewer, Foresee, the deck browser, the Figment
creator), which are themselves complex sub-UIs.

**Redesign notes.** This panel has no player-facing role and should be excluded
from the gameplay layout entirely, re-homed onto a dedicated developer screen.
Documented here so its tools are inventoried and so the board's redesign can
reclaim the ~27% of screen width it currently occupies.
