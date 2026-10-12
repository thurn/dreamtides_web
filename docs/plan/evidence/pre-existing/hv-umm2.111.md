# Pre-existing issues found by hv-umm2.111

- `src/engine/testing/lab-solver.ts` / card-lab staging: the lab fixture stages no enemy character for a card whose only target is chosen by its ▸Materialized trigger, so `lab:preflight` and the card sweep resolve Signal Hijacker with `noLegalTarget` and never exercise the effect (judged QA stages its own board).
- `src/runtime/battle-prompt-messages.ts` (`effectStartedText`, `abilities`): the log line for a gain always reads "Has the abilities of another card", even when both sides can identify the gained card that the status badge names.
