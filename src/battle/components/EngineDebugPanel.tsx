// The engine battle screen's debug panel (`?debug=1`, D4): development builds
// only (P7), loaded lazily by `EngineBattleScreen`. Every change it makes is
// an engine debug action (`src/engine/debug/debug-actions.ts`) written to the
// log as a `BATTLE_DEBUG` intent, so a reload replays it; revealing hidden
// zones only reads the committed state.
//
// It also publishes `window.__engineProbe` (the slice, its pending prompt,
// and the events each applied intent published) for the card sweep
// (`scripts/qa/card-sweep.mjs`).

import { useEffect, useRef, useState, type ReactElement } from "react";
import { DeveloperRail } from "../../cumulus/components/overlay/DeveloperRail";
import { GlassButton } from "../../cumulus/components/controls/GlassButton";
import { IconButton } from "../../cumulus/components/controls/IconButton";
import { NumberStepper } from "../../cumulus/components/controls/NumberStepper";
import { SegmentedControl } from "../../cumulus/components/controls/SegmentedControl";
import { Select } from "../../cumulus/components/controls/Select";
import { TextField } from "../../cumulus/components/controls/TextField";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import { token } from "../../cumulus/primitives/tokens";
import type { Decision, Engine, EngineEventKind, Prompt, Side } from "../../engine";
import type { BattleId, PromptId } from "../../types/identifiers";
import { DEBUG_ZONES, revealHiddenZones, type DebugOp, type DebugZone } from "../../engine/debug/debug-actions";
import type { BattleSlice, HistoryEntry } from "../../engine/fold/slice";
import { logEvent } from "../../logging";
import { pendingEnginePrompt } from "../../rules/battle/engine-battle";
import type { BattleFoldState } from "../../rules/battle/fold";
import { useActions } from "../../session/hooks";
import { useJourney } from "../../state/journey-context";
import { isCardId, parseCardId, type CardId } from "../../types/card-identity";
import { usePublishedEngineEvents } from "./battle-presentation";

/** Developer-tool labels: QA copy, not player copy. */
const COPY = {
  title: "Engine Debug",
  open: "Open engine debug panel",
  close: "Close engine debug panel",
  side: { player: "Player", enemy: "Enemy" },
  card: "Card UUID",
  cardError: "Not a card UUID",
  zone: "Zone",
  add: "Add Card",
  forceDraw: "Force Next Draw",
  energy: "Energy",
  score: "Score",
  decrease: "Decrease",
  increase: "Increase",
  reveal: "Reveal Hidden Zones",
  mark: "Start History",
  undo: "Undo to Here",
  zones: { hand: "Hand", deck: "Deck", void: "Void", banished: "Banished", play: "Play" } satisfies Record<DebugZone, string>,
} as const;

/** The rail's width on screen. */
const RAIL_WIDTH = 320;

interface EngineProbeEvent {
  readonly seq: number;
  readonly kind: EngineEventKind;
  readonly instance: string | null;
}

/** The development-only state the card sweep reads. */
interface EngineProbe {
  readonly battleId: BattleId;
  readonly slice: BattleSlice;
  /** The pending prompt, unredacted, with its id. */
  readonly pending: (Prompt & { readonly id: PromptId }) | null;
  readonly decision: Decision | null;
  readonly events: readonly EngineProbeEvent[];
}

function describeEntry(entry: Exclude<HistoryEntry, { attempt: number }>): string {
  if ("debug" in entry) return `debug ${JSON.stringify(entry.debug)}`;
  const { intent } = entry;
  if (intent.kind === "battleAction") return `${intent.side} ${JSON.stringify(intent.action)}`;
  return `${intent.side} ${intent.kind} ${intent.promptId}`;
}

export default function EngineDebugPanel({
  engine,
  battle,
  battleId,
}: {
  readonly engine: Engine;
  readonly battle: BattleFoldState;
  readonly battleId: BattleId;
}): ReactElement {
  const actions = useActions();
  const { cardDatabase } = useJourney();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("player");
  const [cardText, setCardText] = useState("");
  const [zone, setZone] = useState<DebugZone>("hand");
  const [revealed, setRevealed] = useState(false);
  const events = useRef<EngineProbeEvent[]>([]);
  const slice = battle.engine?.slice;
  if (slice === undefined) throw new Error("EngineDebugPanel requires an engine battle");

  usePublishedEngineEvents(engine, slice, ({ events: published, seq }) => {
    for (const event of published) {
      events.current.push({ seq, kind: event.kind, instance: "instance" in event ? String(event.instance) : null });
    }
  });
  useEffect(() => {
    const pending = pendingEnginePrompt(battle, engine);
    const probe: EngineProbe = {
      battleId,
      slice,
      pending: pending?.prompt ?? null,
      decision: slice.inFlight === null ? engine.decision(slice.committed) : null,
      events: events.current,
    };
    (window as { __engineProbe?: EngineProbe }).__engineProbe = probe;
  });

  const cardName = (id: CardId | null): string =>
    id === null ? "" : ([...cardDatabase.values()].find((card) => card.id === id)?.name ?? id);
  const card = isCardId(cardText.trim().toLowerCase()) ? parseCardId(cardText.trim().toLowerCase()) : null;
  const submit = (op: DebugOp): void => {
    logEvent("battle_engine_debug_requested", { battleId, op });
    void actions.battleDebug(op);
  };
  const sideState = slice.committed.sides[side];
  const entries = (slice.history?.entries ?? []).flatMap((entry, index) =>
    "attempt" in entry ? [] : [{ entry, index }],
  );

  if (!open) {
    return (
      <div style={{ position: "fixed", right: token("--space-m"), top: token("--space-m"), zIndex: 60 }}>
        <IconButton glyph={GLYPHS.bug} size="sm" label={COPY.open} onPress={() => setOpen(true)} testId="engine-debug-open" />
      </div>
    );
  }
  return (
    <div style={{ position: "fixed", right: 0, top: 0, width: RAIL_WIDTH, maxWidth: "100vw", zIndex: 60 }}>
      <DeveloperRail
        id="engine-debug-panel"
        side="right"
        title={COPY.title}
        subtitle={battleId}
        closeLabel={COPY.close}
        onClose={() => setOpen(false)}
        testId="engine-debug-panel"
      >
        <div style={{ display: "grid", gap: token("--space-m") }}>
          <SegmentedControl
            options={[
              { value: "player", label: COPY.side.player },
              { value: "enemy", label: COPY.side.enemy },
            ]}
            value={side}
            onChange={(value) => setSide(value === "enemy" ? "enemy" : "player")}
            size="sm"
            full
          />
          <TextField
            label={COPY.card}
            value={cardText}
            onChange={setCardText}
            {...(cardText !== "" && card === null ? { error: COPY.cardError } : {})}
            testId="engine-debug-card"
          />
          <Select
            options={DEBUG_ZONES.map((value) => ({ value, label: COPY.zones[value] }))}
            value={zone}
            onChange={setZone}
            size="sm"
            full
            ariaLabel={COPY.zone}
          />
          <GlassButton
            label={COPY.add}
            placement="onGlass"
            size="compact"
            disabled={card === null}
            onPress={() => card !== null && submit({ kind: "addCard", side, card, zone })}
          />
          <GlassButton
            label={COPY.forceDraw}
            placement="onGlass"
            size="compact"
            disabled={card === null}
            onPress={() => card !== null && submit({ kind: "forceDraw", side, card })}
          />
          <NumberStepper
            label={COPY.energy}
            value={sideState.currentEnergy}
            resource="energy"
            size="sm"
            decrementLabel={COPY.decrease}
            incrementLabel={COPY.increase}
            decrementDisabled={sideState.currentEnergy === 0}
            onDecrement={() => submit({ kind: "setEnergy", side, energy: sideState.currentEnergy - 1 })}
            onIncrement={() => submit({ kind: "setEnergy", side, energy: sideState.currentEnergy + 1 })}
          />
          <NumberStepper
            label={COPY.score}
            value={sideState.score}
            resource="points"
            size="sm"
            decrementLabel={COPY.decrease}
            incrementLabel={COPY.increase}
            decrementDisabled={sideState.score === 0}
            onDecrement={() => submit({ kind: "setScore", side, score: sideState.score - 1 })}
            onIncrement={() => submit({ kind: "setScore", side, score: sideState.score + 1 })}
          />
          <GlassButton
            label={COPY.reveal}
            placement="onGlass"
            size="compact"
            pressed={revealed}
            onPress={() => setRevealed(!revealed)}
          />
          {revealed
            ? revealHiddenZones(slice.committed).map((hidden) => (
                <div key={`${hidden.side}:${hidden.zone}`} style={{ font: token("--t-body-sm"), color: token("--text-on-glass") }}>
                  <div style={{ color: token("--text-on-glass-muted") }}>
                    {COPY.side[hidden.side]} · {COPY.zones[hidden.zone]}
                  </div>
                  {hidden.cards.map((entry) => (
                    <div key={entry.instance}>{cardName(entry.card)}</div>
                  ))}
                </div>
              ))
            : null}
          {slice.history === undefined ? (
            <GlassButton label={COPY.mark} placement="onGlass" size="compact" onPress={() => submit({ kind: "mark" })} />
          ) : (
            entries
              .slice()
              .reverse()
              .map(({ entry, index }) => (
                <div key={index} style={{ display: "grid", gap: token("--space-xs"), font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
                  <div style={{ overflowWrap: "anywhere" }}>{describeEntry(entry)}</div>
                  <GlassButton
                    label={COPY.undo}
                    placement="onGlass"
                    size="compact"
                    testId={`engine-debug-undo-${String(index)}`}
                    onPress={() => submit({ kind: "undo", keep: index })}
                  />
                </div>
              ))
          )}
        </div>
      </DeveloperRail>
    </div>
  );
}
