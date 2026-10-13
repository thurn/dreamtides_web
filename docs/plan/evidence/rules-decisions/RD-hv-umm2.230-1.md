# RD-hv-umm2.230-1 — Completion of a Foresee operation

- Ladder: 4 (Surveil 701.25c/d, adapted to Foresee)
- rules.md: § Keywords and Effects → Foresee N; privacy precedent RD-hv-umm2.299-1
- Affects: 39260dd5-cb43-47d5-a007-effbe13d6417 (base Dreamsign battle ability)
- Why: A positive instruction completes once; an instruction of zero does not.

## Question and outcome

For Dreamsign UUID `39260dd5-cb43-47d5-a007-effbe13d6417`, “when you foresee”
means once after a positive Foresee instruction completes. Keeping the same
order, sending every looked-at card to the void, or having an empty deck all
complete one operation. Foresee 0 performs no operation. Foresee itself does
not cause Fatigue or shuffle the void into the deck. A resulting draw uses the
ordinary draw rules, including their empty-deck behavior.

The normative paragraph appears under **Foresee N** in `docs/rules.md`.

## D10 ladder

1. The D/C/P entries contain no deciding clarification for this trigger's
   zero or empty-deck boundary. The Foresee rules define the card flow and
   privacy, as does RD-hv-umm2.299-1, without settling this boundary.
2. The prototype's actual Foresee helper implements arrangement, but supplies
   no when-Foresee trigger rule. Sandbox behavior supplies no authority.
3. The Rust rules retain matching Foresee keyword text. Its standard-effect
   path prompts only when cards exist; its deck helper realizes an empty deck
   by shuffling the void or panicking. No when-Foresee trigger was found.
   These differing deck rules do not decide the present trigger boundary.
4. The closest Magic analog is Surveil: **701.25c** distinguishes an instruction
   of zero, and **701.25d** completes a positive instruction even when some or
   all actions are impossible, triggering after completion. Scry's parallel
   zero/completion rules agree. Adapted to Dreamtides, the destination is the
   void and Foresee retains its own empty-deck and privacy rules. Source:
   [Magic Comprehensive Rules, June 19, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260619.pdf),
   independently verified by the parent executor before the implementation ACK.
5. This reading treats “when you foresee” as one operation rather than a
   count of inspected or voided cards, consistent with the printed Dreamsign.

The source-free audit is retained as a prior-session reference at
`/tmp/codex-01a130c8-foresee230/helper/stage1-audit.md`; its clocks are not this
implementation's clocks. The parent admitted the precise empty-completion
change before repository writes.

## Evidence

`when-foresee-trigger.contracts.ts` uses synthetic cards and emblems to cover
both relative players, unchanged/reversed/mixed/all-void arrangements,
positive empty-deck completion, zero and negative instructions on both empty
and populated decks, multiple operations, once-per-turn, and resumed queued
triggers. The existing `foresee.contracts.ts` pins the empty completion event
and the absence of a prompt, Fatigue, or shuffle caused by Foresee itself.
