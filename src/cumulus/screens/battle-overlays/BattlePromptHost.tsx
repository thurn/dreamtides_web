// The battle's prompt host: the one surface that presents the pending
// decision to the local player, whatever raised it. The board-integrated
// parts of a prompt (on-board targets, the card picker, choice buttons in
// the control row) render on the battle board from the same view model;
// this host renders the rest: the prompt's heading with its source and
// Cancel, the response window's heading, the arrangement editor, the loop
// shortcut, and brief notices. Its number picker sits in the control row,
// beside where the choice buttons go.
//
// Local state is presentation only and keyed by the prompt's id: a new id
// resets the number picker and the arrangement editor.

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { BattleForeseeEditor, type BattleForeseeEditorModel, type BattleForeseeResult } from "../../components/battle/BattleForeseeEditor";
import { GlassButton } from "../../components/controls/GlassButton";
import { NumberStepper } from "../../components/controls/NumberStepper";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { TransientStatusToast } from "../../components/status/TransientStatusToast";
import { motionTimeSeconds } from "../../primitives/motion-time";
import { SAFE_AREA_INSET_PROPERTIES } from "../../primitives/safe-area";
import { token } from "../../primitives/tokens";
import { ENGINE_NUMBER_PICKER_COPY } from "../../../runtime/battle-prompt-messages";
import { formatNumber } from "../../../runtime/format-number";
import type { PromptId } from "../../../types/identifiers";

/** The number picker of a chooseNumber prompt: its legal values, ascending. */
export interface BattlePromptNumberView {
  /** The variable the number sets, such as X. */
  readonly label: string;
  readonly values: readonly number[];
}

/** A brief notice about something done on the player's behalf. */
export interface BattlePromptNoticeView {
  /** Identifies one notice; a new key shows it again. */
  readonly key: string;
  readonly title: string;
  readonly message: string;
}

export interface BattlePromptHostView {
  /** The pending prompt's id; local selection resets when it changes. `null` outside a prompt. */
  readonly key: PromptId | null;
  /** What the player is asked, and the card that asks. */
  readonly heading: { readonly title: string; readonly detail: string | null } | null;
  /** The play or activation awaiting this prompt may still be cancelled. */
  readonly cancellable: boolean;
  readonly number: BattlePromptNumberView | null;
  readonly arrange: BattleForeseeEditorModel | null;
  /** The loop on offer, with the most repetitions one request may ask for. */
  readonly loopOffer: { readonly maxCount: number } | null;
  readonly notice: BattlePromptNoticeView | null;
}

export interface BattlePromptHostProps {
  readonly view: BattlePromptHostView;
  /** The player may take a top-level action now: repeating the loop on offer is one. */
  readonly canAct: boolean;
  readonly onCancel?: () => void;
  readonly onArrangeSubmit?: (result: BattleForeseeResult) => void;
  readonly onRepeatLoop?: (count: number | "untilVictory") => void;
  readonly onNoticeDismiss?: () => void;
}

const BANNER_MAX_WIDTH = 416;
// Above the gallery card picker, so a cancellable gallery prompt can still be cancelled.
const BANNER_Z_INDEX = 80;
/**
 * In the board's top row, over the opponent's hand and above the far side's
 * status display, so the banner never covers the opponent's energy and
 * points. The banner holds only its heading and one control; a number
 * picker sits in the control row with the choice buttons.
 */
const BANNER_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-xs")})`,
  width: "90vw",
  maxWidth: BANNER_MAX_WIDTH,
  transform: "translateX(-50%)",
  zIndex: BANNER_Z_INDEX,
};

export function BattlePromptHost({
  view,
  canAct,
  onCancel,
  onArrangeSubmit,
  onRepeatLoop,
  onNoticeDismiss,
}: BattlePromptHostProps): ReactElement {
  const accessory =
    view.cancellable && onCancel !== undefined
      ? { label: "Cancel", testId: "battle-prompt-cancel" as const, onPress: onCancel }
      : null;
  return (
    <>
      {view.heading === null ? null : (
        <div
          data-battle-prompt-banner=""
          data-battle-prompt-id={view.key ?? undefined}
          data-battle-prompt-cancellable={view.cancellable ? "true" : "false"}
          role="status"
          aria-live="polite"
          style={BANNER_STYLE}
        >
          <GlassPanel
            title={view.heading.title}
            {...(view.heading.detail === null ? {} : { subtitle: view.heading.detail })}
            headerSpacing="compact"
            headerDivider={false}
            radius="control"
            {...(accessory === null ? {} : { rightAccessory: { kind: "glassButton" as const, button: accessory } })}
          >
            <span />
          </GlassPanel>
        </div>
      )}
      {view.loopOffer === null || view.heading !== null ? null : (
        <BattleLoopOffer maxCount={view.loopOffer.maxCount} disabled={!canAct} onRepeat={onRepeatLoop} />
      )}
      {view.arrange === null || view.key === null ? null : (
        <BattleForeseeEditor
          key={view.key}
          model={view.arrange}
          onConfirm={(result) => onArrangeSubmit?.(result)}
        />
      )}
      {view.notice === null ? null : (
        <BattlePromptNotice key={view.notice.key} notice={view.notice} onDismiss={onNoticeDismiss} />
      )}
    </>
  );
}

/**
 * The number picker of a chooseNumber prompt, in the battle's control row:
 * it steps through the prompt's legal values from the lowest. Key it by the
 * prompt's id so a new prompt starts over.
 */
export function BattlePromptNumberPicker({
  label,
  values,
  disabled,
  onSubmit,
}: {
  readonly label: string;
  readonly values: readonly number[];
  readonly disabled: boolean;
  readonly onSubmit: (value: number) => void;
}): ReactElement {
  const [index, setIndex] = useState(0);
  const value = values[index];
  return (
    <div data-battle-number-picker="" style={{ display: "flex", alignItems: "center", gap: token("--space-s") }}>
      <NumberStepper
        label={label}
        value={value ?? 0}
        size="sm"
        decrementLabel={ENGINE_NUMBER_PICKER_COPY.decrement}
        incrementLabel={ENGINE_NUMBER_PICKER_COPY.increment}
        decrementDisabled={index <= 0}
        incrementDisabled={index >= values.length - 1}
        onDecrement={() => setIndex((current) => Math.max(0, current - 1))}
        onIncrement={() => setIndex((current) => Math.min(values.length - 1, current + 1))}
        testId="battle-number-picker-stepper"
      />
      <GlassButton
        label={ENGINE_NUMBER_PICKER_COPY.submit}
        variant="accent"
        disabled={disabled || value === undefined}
        testId="battle-number-picker-submit"
        onPress={() => {
          if (value !== undefined) onSubmit(value);
        }}
      />
    </div>
  );
}

/**
 * The loop shortcut: a banner while a loop is on offer, whose Repeat opens a
 * dialog to repeat it a chosen number of times, or until victory.
 */
function BattleLoopOffer({
  maxCount,
  disabled,
  onRepeat,
}: {
  readonly maxCount: number;
  readonly disabled: boolean;
  readonly onRepeat?: (count: number | "untilVictory") => void;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const repeatCount = Math.min(count, maxCount);
  const unavailable = disabled || onRepeat === undefined;
  const repeat = (value: number | "untilVictory") => {
    setOpen(false);
    onRepeat?.(value);
  };
  return (
    <>
      <div data-battle-loop-offer="" style={{ ...BANNER_STYLE, zIndex: BANNER_Z_INDEX - 1 }}>
        <GlassPanel
          title={"Repeat This Loop?"}
          headerSpacing="compact"
          headerDivider={false}
          radius="control"
          rightAccessory={{
            kind: "glassButton",
            button: { label: "Repeat", disabled: unavailable, testId: "battle-loop-open", onPress: () => setOpen(true) },
          }}
        >
          <span />
        </GlassPanel>
      </div>
      {open && !unavailable ? (
        <GlassDialog title={"Repeat This Loop?"} presentation="popup" desktopCenterTarget="battlefield" onClose={() => setOpen(false)} closeLabel={"Cancel"}>
          <div data-battle-loop-dialog="" style={{ display: "grid", gap: token("--space-m") }}>
            <NumberStepper
              label={"Repetitions"}
              value={repeatCount}
              size="sm"
              decrementLabel={"Fewer repetitions"}
              incrementLabel={"More repetitions"}
              decrementDisabled={repeatCount <= 1}
              incrementDisabled={repeatCount >= maxCount}
              onDecrement={() => setCount(Math.max(1, repeatCount - 1))}
              onIncrement={() => setCount(Math.min(maxCount, repeatCount + 1))}
            />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: token("--space-xs") }}>
              <GlassButton
                label={`Repeat ×${formatNumber(repeatCount)}`}
                placement="onGlass"
                testId="battle-loop-repeat-count"
                onPress={() => repeat(repeatCount)}
              />
              <GlassButton
                label={"Repeat Until Victory"}
                variant="accent"
                placement="onGlass"
                testId="battle-loop-repeat-until-victory"
                onPress={() => repeat("untilVictory")}
              />
            </div>
          </div>
        </GlassDialog>
      ) : null}
    </>
  );
}

/** How long a notice stays up before it dismisses itself, as long as the figment merge notice. */
const NOTICE_MS = motionTimeSeconds("--dur-slow") * 4 * 1_000;

function BattlePromptNotice({
  notice,
  onDismiss,
}: {
  readonly notice: BattlePromptNoticeView;
  readonly onDismiss?: () => void;
}) {
  useEffect(() => {
    if (onDismiss === undefined) return undefined;
    const timer = window.setTimeout(onDismiss, NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div data-battle-prompt-notice={notice.key}>
      <TransientStatusToast copy={{ title: notice.title, message: notice.message }} onDismiss={onDismiss} />
    </div>
  );
}
