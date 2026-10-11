# RD-hv-umm2.112-1: Grant a full controller turn after the current turn

- Ladder: 1, C8 and RD-hv-7x4l.1-13.
- Entity: `a911ef71-799c-4240-ad13-8fabd3caeafa`.
- Rules: Turn Structure, Extra turns.

The resolving instruction queues a turn for its ability controller. Pending extra turns are consumed most recent first. After the queue is exhausted, normal turns continue with the opponent of the last normal-turn player. Each extra turn runs all eight phases, including Dreamwell and Draw, resets turn counters and once-per-turn uses, and reaches the ordinary duration boundaries. Its round remains unchanged, including at the round limit.

The primitive uses the existing turn queue and phase machinery. A public `extraTurnGranted` event announces the granted side and redacts an unidentifiable source. The host records its structured `engine.extraTurn` line. Printed card text needs only this primitive, so D20 adds no entity-specific scenario module.
