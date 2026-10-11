# Pre-existing issues found by hv-umm2.74

- `src/engine/testing/prompt-lab.ts` (`PROMPT_LAB_CARD_TEXT`): the synthetic events `SYNTHETIC.event0` and `SYNTHETIC.event1` have no QA label, so a card-lab battle log names them "Card" (seen as "Card was banished." in the Renounce Reality judged run). QA label only; player content is unaffected.
