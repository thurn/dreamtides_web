# Postmortem: Desktop Dream Avatar Select design process

**Date range:** 2026-07-04 16:13 → 2026-07-05 07:46 (local), plus a follow-up
file split later that morning.
**Surface:** the desktop (wide-viewport) layout of the Dream Avatar select
screen (`src/cumulus/screens/quest-start-desktop.tsx`, formerly the desktop half
of `QuestStartScreen.tsx`).
**Sources:** four Claude session transcripts
(`ba1dac74`, `3da28f94`, `44eca388`, `21947819`), `git log`
`20792680..b00a2aa7`, and a current-tree audit of the screen, the tide
components, and the lint rules.

---

## Summary

Getting the desktop Dream Avatar select to a good state took **~15 hours of
wall-clock design work, 24 commits, and roughly 2× the screen's final line
count rewritten in place** (`QuestStartScreen.tsx`: 21 commits, +2093/−1376
against a ~1170-line result). Along the way: six wholesale redesign commits,
three parallel redesigns forked from the same parent within nine minutes (two
abandoned), a dev-tweaks panel built and fully deleted (+382/−382 net zero),
and at least seven distinct rounds of user rejection after Claude had declared
the work done.

The headline finding is **not** that verification was skipped. Every session
loaded the Cumulus skill, ran lint/typecheck/tests, and ran a real
browser-QA loop (87 `agent-browser` invocations across the four sessions)
before every "done" declaration. The "obviously wrong" UI shipped anyway,
because the QA loop verified the wrong things: it checked *requested elements
are present* instead of *the screen reads well*, it *eyeballed* spacing
instead of measuring it, and it verified only the content that happened to be
on screen instead of the worst case. Each of those three gaps was eventually
closed *within* the sessions — by pixel measurement, content-variant forcing,
and the human-driven tweaks panel — but each was closed reactively, after a
user rejection, and none of them is codified anywhere, so the next screen
starts from zero.

On the design-system question: token and component discipline was genuinely
good, the lint gates worked, and every escape hatch that was opened got closed
again. The gap is at the *convergence* step: the tide indicator now has one
shared semantic source but **three hand-rolled renderings with independently
declared copies of the same numbers**, and nothing in the process asks "did
this design push fork a component visual, and when does it fold back in?"

---

## Timeline

| # | Session | Local time | Commits | What happened |
|---|---------|-----------|---------|----------------|
| 1 | `ba1dac74` | Jul 4, 16:13–19:00 | `20792680`, `a6405b12`, `4f64d60b`, `232a1bca` | First desktop layout. Rejected as "3 mobile UI screens forced onto desktop" (7-point complaint). The fix round was rejected in turn as "too visually noisy," reverting several of its own additions. One promotion flatly denied. |
| 2 | — | Jul 4, ~19:17–19:26 | `999754a3` (+ abandoned `29fe72f5`, `4bf09ddd`) | Three parallel wholesale redesigns forked from `232a1bca` within 9 minutes; one chosen, two abandoned in worktrees. |
| 3 | `3da28f94` | Jul 4, 19:00–21:35 | `999754a3`, `8dbf505f`, `595e5f7f` | Redesign per a 7-item spec. Rejected twice for the same defect ("absurd amount of space in the card"; then "96 pixels … is not a 'tasteful gap'"). Fixed only after switching from eyeballed screenshots to `getBoundingClientRect()` measurement. |
| 4 | (not in sampled sessions) | Jul 4 evening | `8d2b…`, `bd64d18d`, `8dbf…` interleaved | Cutout-figure art direction landed between sessions. |
| 5 | `44eca388` | Jul 4 22:13 – Jul 5 06:44 | `2aac22f4`, `26038424`, `fb31f05c`, `adc4d29b`, `51aca436`, `370583fa`, `56c8f250`, `e8307c97`, `aea34715` | Polish pass, then the user requested a live tweaks panel. Six knob/bake rounds converged the proportions; panel then deleted and values normalized into the design. Two mechanism misses (column-vs-card width conflation; a portrait-height knob that added empty space instead of growing the art). |
| 6 | `21947819` | Jul 5, 06:45–07:46 | `7e90a920`, `b00a2aa7` | Tide info-card variant + ability box. Two aesthetic iterations implemented then reverted to the first version. The shipped auto-shrink was rejected as "way too aggressive" — the 3-line worst case had never been rendered during QA. |
| 7 | follow-up | Jul 5, 08:59 | `f443c41d` | Screen split into `quest-start-desktop.tsx` / `quest-start-mobile.tsx` / `quest-start-shared.tsx`. |

---

## What went well

These are worth keeping deliberately, not just noting in passing:

- **The browser-QA loop was universal.** Every commit in every session was
  preceded by real screenshots of the real screen at desktop viewports, plus
  interaction checks (hover reveals, cluster expansion). Ports were scoped,
  teardown was PID-targeted, the full test suite ran every round.
- **Token and component discipline held under pressure.** Session 1's edits
  contained 156 `token(...)`/`var(--…)` references against 15 raw `px`
  literals, all in the sanctioned box-measure category. Lint caught a raw
  `<i className>` and Claude switched to `GlowIcon` rather than exempting;
  `Motes` tint was checked against its enum rather than guessed.
- **New needs went through the customization ladder, not around it.** The tide
  info card became a strict `InfoCard` `variant="tide"`; the non-compressing
  hover became a typed `compress` prop on `Pressable`/`PressInfo`; both were
  documented in demos and the docs regenerated — exactly rung 3 of the ladder.
- **Escape hatches were closed behind us.** The tweaks panel required adding
  `src/cumulus/devtools/` to three lint-rule exemption lists; the final
  normalize commit (`aea34715`) deleted the panel, reverted all three
  exemptions, and left zero residue (verified by grep in the current tree).
- **The tweaks-panel loop itself worked.** Once taste-values (portrait scale,
  card overlap, equal-height on/off) were exposed as live knobs with a JSON
  readout the user could paste back, convergence was fast: six knob/bake
  rounds in ~40 minutes of active time, versus the hours of
  guess-screenshot-reject cycles that preceded it.
- **Self-correction happened inside the sessions.** After the "96px gap"
  rejection, QA switched to DOM measurement. After the auto-shrink rejection,
  QA looped dev-server reloads until a genuine 3-line ability rendered before
  declaring success. The right techniques were discovered — they just weren't
  standard practice going in.

---

## Why "obviously wrong" UI kept shipping

Five recurring failure modes explain essentially all of the churn. None of
them is "didn't look at the screen."

### 1. Checklist QA instead of judgment QA

The first desktop layout shipped a mobile-sized `Button size="lg" full` and
three unconstrained flex columns. Claude had screenshots in hand and declared
"the desktop layout renders exactly as requested… all requirements are
satisfied" — and by the letter of the request, it was. The user's response:

> "in general this UI is somewhat too large. It looks like you have taken 3
> mobile UI screens and forced them onto desktop. A desktop UI would never
> have a button this large."

The QA pass asked *are the requested elements present?* (three portraits, no
carousel, tide pills, group panel — yes) and never asked *does this read as a
desktop screen?* (density, control scale, platform idiom — no). The same
failure repeated at the composition level: each item on a complaint list was
fixed literally and verified individually, and two rounds later the *sum* was
rejected as "too visually noisy" — a property no per-item check would ever
evaluate.

### 2. Eyeballed spacing instead of measured spacing

The single most damning exchange of the whole arc:

> Claude: "a comfortable, deliberate margin above the button" / "tasteful gap"
>
> User: "96 pixels from the top of the bottom to the bottom of the closest
> tides role is not a 'tasteful gap', this is what your screenshot shows."

The screenshot *showed* the 96px gap; the review of the screenshot described
it qualitatively and generously. Spacing judgments made by eyeballing a
2880-wide screenshot are exactly the judgments the user kept overturning with
a ruler. The defect was fixed only when QA started computing
`getBoundingClientRect()` deltas in-browser and asserting the number (24px).
Worse, the first ship of this bug came with a hedge — "It reads as balanced,
but I can tighten it if you'd prefer" — i.e. the doubt existed *before*
commit and was shipped anyway.

### 3. Only the content on screen was verified

The ability-box auto-shrink shipped with a hard 40px cap after QA that
explicitly noted "current abilities fit ≤2 lines" and reasoned the math
*should* generalize. Nobody rendered a 3-line ability. The user found it on
live data within minutes: "This autofit algorithm is way too aggressive." The
fix session invented the missing discipline on the spot — loop reloads until
the mint produces a 3-line ability, then screenshot. Session `44eca388` had
independently invented the other variant (injecting varied-length text into
the DOM to compare equal-height vs natural-height cards). Content-variance
sweeps worked every time they were used; they were used only after a miss.

### 4. Equal-height cards vs. variable content — one CSS trap, hit repeatedly

Almost every layout defect in the arc is the same underlying problem: three
side-by-side cards whose ability text varies in length, plus a mechanism that
parks the slack somewhere visible.

- `CARD_MIN_H = 264` + a `flex: 1` spacer → guaranteed dead space
  ("absurd amount of space in the card").
- Fix: equalize to the tallest column → the slack relocated to a 70–96px gap
  above the button on shorter cards ("not a 'tasteful gap'").
- A `portraitHeight` knob that increased a container with
  `object-fit: contain` art → empty space above the figure instead of larger
  art ("increasing the portrait height just pushes the text up").
- A `columnWidth` knob that conflated the figure stage with the console card.

The stable resolution — natural-height cards, vertically centered, with a
two-line *minimum* and gentle shrink — took four commits spread over three
sessions to reach. These are mechanism bugs, not taste bugs: a knob or
constraint that doesn't do what its name implies. Screenshots can't catch a
knob that silently does nothing; only driving the knob to its extremes during
QA can.

### 5. Direction thrash treated as full-fidelity implementation rounds

The expensive rejections were *directional* ("too visually noisy", the
revert-to-first-version in session `21947819`, the three-way parallel redesign
where two complete implementations were discarded). Each direction was
explored at full implementation fidelity — real components, tests updated,
lint clean, QA'd — so each discarded direction cost an hour, not minutes.
Decisions were also re-litigated: `AskUserQuestion` settled "always-full tide
chips" in session 1, and session 1's own fourth iteration reverted to the
collapsed cluster. For layout/crop/density questions, cheap side-by-side
variants (CSS-toggled screenshots of two or three candidate compositions)
would have let the human pick a direction before anything was built properly.

### A note on the lint blind spot

None of the values that caused complaints could ever have been caught by the
token lint suite, *by design*: `no-untokenized-lengths` deliberately exempts
box measures (width/height/min/max), and every problem constant —
`CARD_MIN_H`, `COLUMN_W`, `PORTRAIT_H`, `CARD_OVERLAP`, the 40px ability cap —
is a box measure, hand-guessed with comments like "a touch bigger." The
carve-out is correct (these *are* content-driven caller numbers), but it means
this entire class of value is governed only by visual QA — which is exactly
where the process was weakest. The tweaks panel is the right tool for this
class and should be treated as such, not as a one-off hack.

---

## Design-system report card

The question: are we iterating on the design system during development, or
arbitrarily hacking on things?

**Mostly the former, with one systematic gap.**

### Good system citizenship (observed, with receipts)

- New variants over new hacks: `InfoCard variant="tide"`, `Pressable
  compress`, both demo-documented and doc-regenerated in the same push.
- `GroupPanel.style()` used as the sanctioned rung-2 wrapper for equal-height
  cards rather than a new `GroupPanel` prop.
- Tide colors and glyphs centralized: when the desktop screen and `InfoCard`
  both needed tide visuals, the lookup was extracted to a shared spec
  (`tideVisual`) rather than duplicated.
- The devtools lint exemption was opened for a stated purpose and fully
  reverted when the purpose ended.

### The gap: divergence has a workflow, convergence doesn't

The tide indicator is the canonical example. Current state
(post-`f443c41d`):

1. **`TidePill`** — the canonical pill (12px font, "3px 9px" padding).
2. **`TideCluster`** — collapsed discs with its own `DISC_PX = 24`
   (`TideCluster.tsx:43`) and hand-mirrored copies of TidePill's pill metrics
   (`PILL_FONT_PX = 12`, `PILL_PAD_X = 9`, `PILL_GAP = 6`), with a comment
   naming TidePill as the source of truth it mirrors.
3. **`quest-start-desktop.tsx`** — a third, screen-local disc: its own
   `TIDE_DISC_PX = 24` (line 36), its own hover state, its own
   `borderRadius: "50%"` span, its own brightness-on-hover treatment, feeding
   `InfoCard.PressInfo` directly.

The semantic layer (color, glyph, tide identity) is unified; the *rendering*
layer is forked three ways, and the agreement between the two independent
`24`s and the mirrored pill metrics is maintained by hand. A future resize of
one silently desyncs the others. Notably, the desktop divergence was
*requested* ("remove the expand/collapse in favor of hover-only discs") — the
fork was the right move for design iteration. What never happened is the fold:
once the desktop disc design stabilized, nothing prompted "promote this into
the Tide component family." Divergence had a workflow (build it locally, keep
lint green); convergence had no trigger at all.

This matches the stated goal for the tide pill exactly: iterate a lot during
design, *then end with a single unified design*. The first half happened; the
second half needs a forcing function.

**Concrete unification:** give the Tide family one collapsed-disc rendering —
either a `TidePill` disc variant or a static/hover mode on `TideCluster` —
sized by a single constant in the shared tide spec, and have both the HUD
cluster and the desktop select render it. This is now tracked in
`pre-existing-issues.txt`.

### Housekeeping left behind

- Abandoned redesign worktrees `.worktrees/dream-avatar-desktop-redesign{,-2}`
  still exist, and `wt/dream-avatar-desktop-redesign-2` was pushed to `origin`.
  Discarded directions should be pruned when the surviving direction promotes.

---

## Recommendations

### A. Skill-level: add a "visual QA bar" to the cumulus skill

The cumulus skill is thorough about *what to build with* and silent about *how
to judge the result*. The four sessions independently invented the missing
practices after being burned; codify them so the next screen starts with them.
Proposed additions (a short "Verifying a screen" section in
`.claude/skills/cumulus/SKILL.md`, or a referenced checklist):

1. **Measure, don't adjectivize.** Any spacing/size claim in a QA summary
   must be a number obtained from the DOM (`getBoundingClientRect()` deltas),
   not an adjective. A gap that isn't a `--space-*` step (or a deliberate,
   commented box measure) is a finding. Banned in QA summaries: "tasteful,"
   "comfortable," "balanced" without an accompanying measurement.
2. **Sweep content variance before declaring done.** Render the screen's
   worst cases, not the current mint: longest and shortest text in every
   variable slot (force via DOM injection or reload-minting), max-count
   collections (tides at cap), and each toggleable state. If a constraint
   exists (a cap, a shrink, an overflow), *drive it to its limit and
   screenshot the limit.*
3. **Exercise every knob you add.** A new prop/constant/tweak must be
   demonstrated at min and max in QA. This is what catches the
   knob-wired-to-the-wrong-property class (portrait height that didn't grow
   the portrait) — a screenshot of the default proves nothing about the knob.
4. **Do one holistic pass, separate from the checklist pass.** After
   verifying the requested items, evaluate the composition cold: Is control
   scale right for the platform (desktop is not scaled mobile)? Is the
   visual-weight budget spent on what matters? Would removing an element hurt?
   A fresh-context subagent judging only the screenshot (without the change
   list) is a cheap way to get an unanchored read.
5. **A hedge is a stop sign.** If the pre-commit summary contains "but I can
   adjust if you'd prefer," resolve that doubt *before* committing — fix it,
   measure it, or ask with a side-by-side. Both shipped hedges in this arc
   were the exact defect the user rejected.

### B. Process-level

6. **Cheap directional probes before full-fidelity rounds.** When the open
   question is composition/direction (crop style, density, chrome-vs-quiet),
   produce 2–3 throwaway variants and screenshot them side by side for a
   human pick *before* building any of them properly. The three-way parallel
   redesign got the "generate alternatives" instinct right at the wrong
   fidelity — three complete implementations to discard two.
7. **Bless the tweaks-panel workflow for taste values.** Live knobs + JSON
   readout + "paste back and bake" converged in minutes what
   guess-and-reject cycles failed to converge in hours, and the cleanup
   contract (delete panel, revert exemptions, bake constants, same push) was
   honored. Name it in the cumulus skill as the sanctioned way to tune box
   measures, with that cleanup contract spelled out — and consider a small
   reusable `devtools` harness (schema-driven panel + lint exemption already
   in place) so the ~380 lines of panel don't get rebuilt per screen.
8. **Document the equal-height/variable-content trap.** One paragraph in the
   cumulus skill's screen-composition guidance: for N side-by-side cards with
   variable content, prefer natural height + cross-axis centering with a
   small min-height floor; a fixed height or stretch-equalization parks the
   slack in whichever flex spacer is nearest, and that slack *will* read as a
   broken gap.

### C. Design-system follow-ups

9. **Unify the tide disc** (tracked in `pre-existing-issues.txt`): one
   collapsed-disc rendering in the Tide component family, one size constant
   in the shared tide spec, consumed by both `TideCluster` and the desktop
   select.
10. **Add a convergence trigger.** At the end of any design push that built a
    screen-local rendering of an existing component concept ("requested
    divergence"), explicitly decide: promote it into the component family,
    or file the consolidation in `pre-existing-issues.txt`. The decision —
    not the consolidation itself — should be a required step, so forks stop
    aging silently into parallel implementations.
11. **Prune discarded directions at promote time**: delete losing worktrees
    and their remote branches when the surviving branch fast-forwards to
    master.

---

## Action items

- [x] Add the "Verifying a screen" QA bar (items A1–A5) to
      `.claude/skills/cumulus/SKILL.md`.
- [x] Name the tweaks-panel workflow + cleanup contract in the cumulus skill.
      Evaluated the reusable devtools panel harness and decided against
      pre-building it: the panel is ~300 lines of schema-specific UI built
      rarely, and a permanent harness would need a standing lint exemption
      for raw inputs, whereas the documented contract keeps every exemption
      temporary. Revisit if a third screen needs a panel.
- [x] Add the equal-height/variable-content guidance to the screen-composition
      docs (a "Variable-content siblings" rule under the cumulus skill's Core
      rendering rules).
- [x] Add the convergence trigger (recommendation C10) to the cumulus skill's
      Customization section ("Requested divergence must converge").
- [x] Unify the collapsed tide disc into one component rendering with one
      size constant: `TideDisc` (`src/cumulus/components/hud/TideDisc.tsx`)
      exports the single disc rendering and `TIDE_DISC_PX`; TideCluster and
      the desktop select both consume it, and TideCluster's flyer reads the
      sm pill metrics exported by TidePill instead of re-declaring them.
- [x] Delete `.worktrees/dream-avatar-desktop-redesign{,-2}` and the
      `wt/dream-avatar-desktop-redesign-2` branch on `origin` (the fully-merged
      `wt/dream-avatar-cutout-art` remote branch went with them).
