import { useLayoutEffect, type ReactElement, type RefObject } from "react";

export interface TutorialDialogueTweaks {
  readonly portraitSize: number;
  readonly speechBubbleSize: number;
  readonly horizontalPosition: number;
  readonly verticalPosition: number;
}

export const DEFAULT_TUTORIAL_DIALOGUE_TWEAKS: TutorialDialogueTweaks = {
  portraitSize: 64,
  speechBubbleSize: 100,
  horizontalPosition: 0,
  verticalPosition: 0,
};

interface TutorialDialogueTweaksPanelProps {
  readonly values: TutorialDialogueTweaks;
  readonly onChange: (values: TutorialDialogueTweaks) => void;
}

interface TweakSlider {
  readonly key: keyof TutorialDialogueTweaks;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}

const TWEAK_SLIDERS: readonly TweakSlider[] = [
  {
    key: "portraitSize",
    label: "Portrait size",
    min: 32,
    max: 160,
    step: 1,
    unit: "px",
  },
  {
    key: "speechBubbleSize",
    label: "Speech bubble size",
    min: 50,
    max: 200,
    step: 1,
    unit: "%",
  },
  {
    key: "horizontalPosition",
    label: "Horizontal position",
    min: -600,
    max: 600,
    step: 1,
    unit: "px",
  },
  {
    key: "verticalPosition",
    label: "Vertical position",
    min: -400,
    max: 400,
    step: 1,
    unit: "px",
  },
];

/** Temporary development controls used to settle tutorial dialogue geometry. */
export function TutorialDialogueTweaksPanel({
  values,
  onChange,
}: TutorialDialogueTweaksPanelProps): ReactElement {
  return (
    <section
      aria-label="Tutorial dialogue tweaks"
      data-tutorial-dialogue-tweaks=""
      style={{
        position: "fixed",
        zIndex: 100,
        top: 16,
        right: 16,
        boxSizing: "border-box",
        width: 280,
        maxWidth: "calc(100vw - 32px)",
        padding: 12,
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: 12,
        background: "rgba(25, 12, 33, 0.96)",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "auto",
      }}
    >
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: 16,
          lineHeight: 1.2,
        }}
      >
        Tweaks
      </h2>
      <div style={{ display: "grid", gap: 8 }}>
        {TWEAK_SLIDERS.map((slider) => (
          <label
            key={slider.key}
            style={{ display: "grid", gap: 4, fontSize: 12 }}
          >
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>{slider.label}</span>
              <output>{`${String(values[slider.key])}${slider.unit}`}</output>
            </span>
            <input
              aria-label={slider.label}
              data-tutorial-dialogue-tweak={slider.key}
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={values[slider.key]}
              onChange={(event) => {
                onChange({
                  ...values,
                  [slider.key]: Number(event.currentTarget.value),
                });
              }}
              style={{ width: "100%", accentColor: "#d9adff" }}
            />
          </label>
        ))}
      </div>
      <pre
        data-tutorial-dialogue-tweaks-json=""
        style={{
          margin: "10px 0 0",
          padding: 8,
          overflow: "auto",
          borderRadius: 8,
          background: "rgba(0, 0, 0, 0.3)",
          color: "#f5e9ff",
          fontSize: 11,
          lineHeight: 1.35,
          userSelect: "text",
        }}
      >
        {JSON.stringify(values, null, 2)}
      </pre>
    </section>
  );
}

/** Applies transient tuning values without widening the production component API. */
export function useApplyTutorialDialogueTweaks(
  hostRef: RefObject<HTMLElement | null>,
  values: TutorialDialogueTweaks,
): void {
  useLayoutEffect(() => {
    const host = hostRef.current;
    const dialogue = host?.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    const bubbleWrapper =
      dialogue?.querySelector<HTMLElement>("aside")?.parentElement;
    if (
      dialogue === null ||
      dialogue === undefined ||
      bubbleWrapper === null ||
      bubbleWrapper === undefined
    ) {
      return undefined;
    }

    const previousColumns = dialogue.style.gridTemplateColumns;
    const previousZoom = bubbleWrapper.style.getPropertyValue("zoom");
    dialogue.style.gridTemplateColumns = `${String(values.portraitSize)}px minmax(0, 1fr)`;
    bubbleWrapper.style.setProperty(
      "zoom",
      String(values.speechBubbleSize / 100),
    );

    return () => {
      dialogue.style.gridTemplateColumns = previousColumns;
      if (previousZoom === "") bubbleWrapper.style.removeProperty("zoom");
      else bubbleWrapper.style.setProperty("zoom", previousZoom);
    };
  }, [hostRef, values.portraitSize, values.speechBubbleSize]);
}
