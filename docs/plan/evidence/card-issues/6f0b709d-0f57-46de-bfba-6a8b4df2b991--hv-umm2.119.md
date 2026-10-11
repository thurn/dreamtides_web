# 6f0b709d-0f57-46de-bfba-6a8b4df2b991

- Problem: “If you reclaimed this card” is a past-tense play-method condition; the reclaimed zone-change replacement is independently removable, and a stack copy is not played.
- Implemented as: Check this physical source's latest actual committed play via Reclaim, independently of its mutable replacement flag; a fresh stack copy satisfies the normal branch (RD-hv-umm2.373-1, D15).
- Suggested fix: “Gain 3⍟. If this card was played using Reclaim, gain 6⍟ instead.” Apply the same clarification with 4⍟/8⍟ to amplified text. Printed catalog text is preserved.
