# Quest Prototype: Redesign Screen & Element List

This document is a flat, numbered checklist of every screen and major UI element
(large windows, dialogs, drawers, overlays) that needs to be redesigned for the
mobile UI redesign. It is the work-list companion to the two visual guides:

- [Quest Prototype Visual UI Guide](ui_visual_guide.md) — the quest/meta layer.
- [Battle UI Visual Guide](battle_ui_visual_guide.md) — battle mode.

Items are ordered roughly the way a redesign should proceed: start with the
run's first decision (Dreamcaller selection), move through the most important
navigation and reward screens, cover the site screens and reference surfaces,
then the persistent chrome and developer tooling, and finish with battle mode —
the largest, most complex surface — at the end.

Each item has a stable number for reference. Developer/debug surfaces are marked
**(developer)**; in the redesign these should become their own dedicated screens
rather than panels crowded into live gameplay.

---

## Quest / Meta Layer

### Core flow

1. **Dreamcaller Selection** — the run-start screen; pick 1 of 3 Dreamcallers (identity, ability, starting essence, draft direction).
2. **Starting Deck reveal** — one-time modal shown right after Dreamcaller pick; presents the fixed starter deck before the first Atlas view.
3. **Dream Atlas** — the between-dreamscapes world map; the 7-layer branching graph and the run's primary navigation hub.
4. **Dreamscape Atlas hover preview card** — the large floating dreamscape/boss/unrevealed preview (guide, site, bonus, affiliation, known dreamsign); the heart of Atlas decision-making.
5. **Dreamscape Screen** — inside-a-dreamscape view; the scatter of clickable site nodes over scene art.
6. **Dreamscape site-node hover popover** — the per-node name + one-line description label.

### Site screens

7. **Draft** — pick 1 of 4 cards, 5 picks per visit, with the running deck tray.
8. **Card Shop** (Tobias) — buy cards with essence; restock; regular and enhanced forms.
9. **Dreamsign Market** (Amunet) — buy dreamsigns; same shop frame as Card Shop.
10. **Dreamsign Revelation** (Sigrún) — free dreamsign offer (single, or choose 3–4 enhanced).
11. **Dreamsign Reward site** — non-interactive grant of a pre-disclosed known dreamsign; accept/decline.
12. **Essence site** — non-interactive essence count-up grant (pure feedback, no decision).
13. **Transfiguration** (Durgan) — two-phase reforge: pick a card, then pick a form.
14. **Duplication** (Deacon Holt) — single-select-then-confirm; copy one deck card.
15. **Purge** (Master Takeshi) — deck-thinning grid with escalating cost meter and bane handling.
16. **Dream Augury / Merchant** (Aldric) — two deck-tuned offers side-by-side; ~a dozen bespoke reward-object treatments.
17. **Placeholder sites** — Tempting Offer (Maddox), Gamble (Gravok), Temporal Fork ("Layaway"); shared stub screen pending real encounters.

### Reference & end-of-run

18. **Deck Viewer** — full-screen deck browser (filter / sort / size) with Dreamcaller + dreamsigns sidebar; reused by Purge.
19. **Card detail overlay** — full-screen enlarged single-card view (art, rules, transfiguration info) opened from the Deck Viewer and grids.
20. **Glossary** — centered modal listing every keyword and its definition.
21. **Quest Complete (Victory)** — run victory end-state; stats grid + optional final-deck reveal + actions.
22. **Quest Failed (Defeat)** — run defeat/draw end-state; result reason + terminal-battle summary grid.

### Persistent chrome & shared overlays

23. **Persistent HUD (bottom bar)** — always-on run state (essence, deck size, Dreamcaller, dreamsigns, progress) + global controls.
24. **Dreamcaller HUD popover** — the chip's portrait + name + title + full ability text.
25. **Dreamsign hover card** — the larger art + name + full effect-text card raised from a dreamsign thumbnail (shared with battle).
26. **Dreamsign-purge overlay** — blocking cap-handling modal (drop one of 12 dreamsigns to accept a new one).

### Developer surfaces (re-home to a dedicated developer screen)

27. **"⋯" utility menu** *(developer)* — the HUD dropdown (Pool Viewer, Package Debug, Why Cards, Why Journey, Edit Quest State, Save/Load Quest, Download Log).
28. **Pool Viewer** *(developer)* — the full-screen card-pool browser with algorithm chip, provenance banner, and source/tide toggles.
29. **Quest Debug Editor** *(developer)* — tabbed live quest-state inspector/editor (deck, essence, dreamsigns, atlas node states).
30. **Package Debug, Card Source ("Why Cards"), Why Journey overlays** *(developer)* — the remaining draft/offer provenance inspectors.
31. **Room gate / landing page** *(developer)* — the "Create Game" / "Load Quest ▾" multiplayer room splash that precedes Dreamcaller selection.

---

## Battle Mode

### Core screens

32. **Battle Start (pre-battle intro)** — scout the opposing Dreamcaller (ability, signature cards, dreamsigns, stakes); "Begin Battle".
33. **Battle Board (in-battle)** — the live match: status bar, phase rail, symmetric multi-rank battlefield, side columns, hand tray, action bar. The single hardest screen to fit to portrait.
34. **Battle right-side debug rail / Inspector** *(developer)* — the right-edge state read-out and per-side editing tools that currently consume ~27% of board width.

### In-battle overlays, drawers & panels

35. **Dreamwell Card Display** — the turn's revealed Dreamwell card shown above the battlefield.
36. **Card Zone Browser** — the reusable deck / void / banished contents modal (search / sort / filter + per-zone actions).
37. **Card Picker** — "choose / discard N cards" blocking modal (source card + candidate grid + confirm).
38. **Choice Prompt** — the yes/no-or-pick-an-option blocking modal (its option-button sibling of the Card Picker).
39. **Foresee Overlay** — look at / act on / reorder the top N cards of a deck.
40. **Deck Order Picker** — arrange the full deck or a Foresee subset into a specific order.
41. **Card Hover Preview** — the pervasive enlarged-card + term-definitions read-this-card affordance.
42. **Side Summary popover** — per-side Dreamcaller ability + all that side's dreamsigns (raised from the status-strip portrait).
43. **Dreamcaller Panel** — the larger, dedicated per-side Dreamcaller/dreamsign sheet (currently unwired; folds into the side-summary surface).
44. **Battle Log Drawer** — chronological command/event history backing Undo/Redo, with category filters.
45. **Dreamwell History Drawer** — scrollable record of every Dreamwell card drawn this match.
46. **Battle Result & Reward** — the victory reward surface (animated essence payoff + Continue) and the defeat/draw result overlay.

### Battle developer surfaces (re-home to a dedicated developer screen)

47. **Card Context Menu (right-click)** *(developer)* — per-card debug/manual-play actions and card notes.
48. **Figment Creator** *(developer)* — synthesize a figment token onto the board.
49. **Card Note Editor** *(developer)* — attach an expiring note to a specific card.
