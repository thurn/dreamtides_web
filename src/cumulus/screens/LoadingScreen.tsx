import { motion, useReducedMotion } from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { LOADING_SCREEN_DURATION_MS } from "../../runtime/front-door-timing";
import { GlassButton } from "../components/controls/GlassButton";
import {
  CardFeatureCallout,
  type CardFeatureCalloutKind,
} from "../components/overlay/CardFeatureCallout";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { motionTimeSeconds } from "../primitives/motion-time";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import {
  buildLoadingCalloutLeaderLine,
  type LoadingCalloutLeaderLine,
} from "./loading-callout-geometry";
import { useIsDesktop } from "./use-is-desktop";

export interface LoadingView {
  readonly runeboundChampion: GameCardModel;
  readonly worldsAwait: GameCardModel;
}

export interface LoadingScreenProps {
  readonly view: LoadingView;
  /** Multiplier applied to the tutorial entry sequence's presentation timing. */
  readonly playbackSpeed?: number;
  /** Continues into the tutorial after the loading interval completes. */
  readonly onBegin: () => void;
}

interface AnnotationSpec {
  readonly feature: CardFeatureCalloutKind;
  readonly targetSelector: string;
  readonly targetMeasure: "element" | "contents";
  readonly side: "left" | "right";
  readonly vertical: "top" | "bottom";
}

interface MeasuredAnnotation extends LoadingCalloutLeaderLine {
  readonly feature: CardFeatureCalloutKind;
}

const SCREEN_FADE_SECONDS = motionTimeSeconds("--dur-loading-screen-fade");
const LOADING_DURATION_SECONDS = LOADING_SCREEN_DURATION_MS / 1_000;
const LOADING_SPINNER_SEGMENTS = 12;
const LOADING_SPINNER_SEGMENT_SECONDS =
  LOADING_DURATION_SECONDS / LOADING_SPINNER_SEGMENTS;

function SegmentedLoadingSpinner({
  playbackSpeed,
  reduceMotion,
}: {
  readonly playbackSpeed: number;
  readonly reduceMotion: boolean;
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      data-loading-spinner
      viewBox="0 0 32 32"
      width="32"
      height="32"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      {Array.from({ length: LOADING_SPINNER_SEGMENTS }, (_, index) => {
        const duration = reduceMotion
          ? 0
          : LOADING_SPINNER_SEGMENT_SECONDS / playbackSpeed;
        const delay = reduceMotion
          ? 0
          : (index * LOADING_SPINNER_SEGMENT_SECONDS) / playbackSpeed;
        return (
          <motion.rect
            key={index}
            data-loading-spinner-segment={index}
            x="14"
            y="2"
            width="4"
            height="8"
            rx="2"
            transform={`rotate(${String(index * (360 / LOADING_SPINNER_SEGMENTS))} 16 16)`}
            initial={{
              fill: reduceMotion
                ? token("--accent-bright")
                : token("--accent-tint"),
            }}
            animate={{ fill: token("--accent-bright") }}
            transition={{ duration, delay, ease: "linear" }}
          />
        );
      })}
    </svg>
  );
}

const RUNEBOUND_ANNOTATIONS: readonly AnnotationSpec[] = [
  {
    feature: "cost",
    targetSelector: '[data-card-stat="energy"]',
    targetMeasure: "element",
    side: "left",
    vertical: "top",
  },
  {
    feature: "spark",
    targetSelector: '[data-card-stat="spark"]',
    targetMeasure: "element",
    side: "right",
    vertical: "top",
  },
  {
    feature: "ability",
    targetSelector: "[data-card-rules-text]",
    targetMeasure: "contents",
    side: "left",
    vertical: "bottom",
  },
];

const WORLDS_AWAIT_ANNOTATIONS: readonly AnnotationSpec[] = [
  {
    feature: "cardType",
    targetSelector: "[data-card-type-line]",
    targetMeasure: "contents",
    side: "right",
    vertical: "bottom",
  },
];

function lineSetsMatch(
  first: readonly MeasuredAnnotation[],
  second: readonly MeasuredAnnotation[],
): boolean {
  return (
    first.length === second.length &&
    first.every((line, index) => {
      const candidate = second[index];
      return (
        candidate !== undefined &&
        line.feature === candidate.feature &&
        line.path === candidate.path
      );
    })
  );
}

function calloutPosition(
  annotation: AnnotationSpec,
  isDesktop: boolean,
): CSSProperties {
  const bottom =
    annotation.feature === "cardType"
      ? isDesktop
        ? "22%"
        : "14%"
      : isDesktop
        ? "18%"
        : "8%";
  return {
    position: "absolute",
    zIndex: 8,
    width: isDesktop ? "min(8vw, 108px)" : "min(20vw, 80px)",
    ...(annotation.side === "left"
      ? { left: token(isDesktop ? "--space-xs" : "--space-xxs") }
      : { right: token(isDesktop ? "--space-xs" : "--space-xxs") }),
    ...(annotation.vertical === "top"
      ? { top: isDesktop ? "18%" : "9%" }
      : { bottom }),
  };
}

function AnnotatedLoadingCard({
  groupId,
  cardTypeLabel,
  model,
  annotations,
  isDesktop,
}: {
  readonly groupId: "runeboundChampion" | "worldsAwait";
  readonly cardTypeLabel: "Character" | "Event";
  readonly model: GameCardModel;
  readonly annotations: readonly AnnotationSpec[];
  readonly isDesktop: boolean;
}): ReactElement {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const calloutRefs = useRef<
    Partial<Record<CardFeatureCalloutKind, HTMLDivElement | null>>
  >({});
  const [lines, setLines] = useState<readonly MeasuredAnnotation[]>([]);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const group = groupRef.current;
      if (group === null) return;
      const groupRect = group.getBoundingClientRect();
      if (groupRect.width <= 0 || groupRect.height <= 0) return;
      const next = annotations.flatMap((annotation) => {
        const bubble = calloutRefs.current[annotation.feature];
        const target = group.querySelector<HTMLElement>(
          annotation.targetSelector,
        );
        if (bubble === null || bubble === undefined || target === null)
          return [];
        const bubbleRect = bubble.getBoundingClientRect();
        const targetRange = document.createRange();
        targetRange.selectNodeContents(target);
        const contentRect =
          annotation.targetMeasure === "contents"
            ? targetRange.getBoundingClientRect()
            : null;
        const targetRect =
          contentRect !== null &&
          contentRect.width > 0 &&
          contentRect.height > 0
            ? contentRect
            : target.getBoundingClientRect();
        if (
          bubbleRect.width <= 0 ||
          bubbleRect.height <= 0 ||
          targetRect.width <= 0 ||
          targetRect.height <= 0
        ) {
          return [];
        }
        return [
          {
            feature: annotation.feature,
            ...buildLoadingCalloutLeaderLine(groupRect, bubbleRect, targetRect),
          },
        ];
      });
      setLines((current) => (lineSetsMatch(current, next) ? current : next));
    };
    const tick = () => {
      measure();
      frame = window.requestAnimationFrame(tick);
    };
    measure();
    if (typeof window.requestAnimationFrame === "function") {
      frame = window.requestAnimationFrame(tick);
    }
    return () => {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [annotations, isDesktop]);

  const cardWidth = isDesktop
    ? "min(26vw, 300px)"
    : `min(47vw, 200px, calc(35.7dvh - ${token("--space-6xl")} - ${token("--space-xs")}))`;
  const cardTypeTop = isDesktop
    ? `calc(50% + min(18.2vw, 210px) + ${token("--space-xs")})`
    : `calc(50% + min(35.7vw, 154px, calc(25dvh - ${token("--space-5xl")} - ${token("--space-xxs")})) + ${token("--space-xs")})`;

  return (
    <div
      ref={groupRef}
      data-loading-card-group={groupId}
      style={{
        position: "relative",
        flex: "0 0 auto",
        width: isDesktop ? "min(47vw, 560px)" : "100%",
        height: isDesktop
          ? "min(72dvh, 650px)"
          : `min(71.4vw, 308px, calc(50dvh - ${token("--space-6xl")} - ${token("--space-3xl")} - ${token("--space-xxs")}))`,
      }}
    >
      <div
        data-loading-card={groupId}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          zIndex: 2,
          width: cardWidth,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      >
        <GameCard model={model} unavailable />
      </div>

      <p
        data-loading-card-type-label={groupId}
        style={{
          position: "absolute",
          top: cardTypeTop,
          right: 0,
          left: 0,
          zIndex: 8,
          margin: 0,
          color: token("--text-on-accent"),
          font: token(isDesktop ? "--t-title-sm" : "--t-lead"),
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        {cardTypeLabel}
      </p>

      <svg
        aria-hidden="true"
        data-loading-callout-leaders={groupId}
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 7,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        {lines.map((line) => (
          <g key={line.feature} data-loading-callout-line={line.feature}>
            <path
              data-loading-callout-endpoint={line.feature}
              data-loading-callout-end-x={line.endX}
              data-loading-callout-end-y={line.endY}
              d={line.path}
              fill="none"
              stroke={token("--text-on-glass-muted")}
              strokeWidth="2"
              strokeLinecap="butt"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>

      {annotations.map((annotation) => (
        <div
          key={annotation.feature}
          ref={(node) => {
            calloutRefs.current[annotation.feature] = node;
          }}
          data-loading-callout={annotation.feature}
          style={calloutPosition(annotation, isDesktop)}
        >
          <CardFeatureCallout feature={annotation.feature} />
        </div>
      ))}
    </div>
  );
}

/** Cinematic card-anatomy loading presentation. */
export function LoadingScreen({
  view,
  playbackSpeed = 1,
  onBegin,
}: LoadingScreenProps): ReactElement {
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotion() === true;
  const [ready, setReady] = useState(false);
  const [titleTop, setTitleTop] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const titleBoundaryRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setReady(false);
    const timeout = window.setTimeout(
      () => setReady(true),
      LOADING_SCREEN_DURATION_MS / playbackSpeed,
    );
    return () => window.clearTimeout(timeout);
  }, [playbackSpeed]);

  useLayoutEffect(() => {
    const title = titleRef.current;
    const boundary = titleBoundaryRef.current;
    if (title === null || boundary === null) return;
    const screen = title.closest<HTMLElement>("[data-loading-screen]");
    if (screen === null) return;

    const content = [
      ...screen.querySelectorAll<HTMLElement>(
        "[data-loading-card], [data-loading-callout]",
      ),
    ];
    let frame = 0;
    const measure = () => {
      const screenRect = screen.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const boundaryRect = boundary.getBoundingClientRect();
      const contentRects = content
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      if (titleRect.height <= 0 || contentRects.length === 0) return;
      const contentTop = Math.min(...contentRects.map((rect) => rect.top));
      const nextTop =
        boundaryRect.top +
        (contentTop - boundaryRect.top - titleRect.height) / 2 -
        screenRect.top;
      setTitleTop((current) =>
        current !== null && Math.abs(current - nextTop) < 0.25
          ? current
          : nextTop,
      );
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(screen);
    observer.observe(title);
    content.forEach((element) => observer.observe(element));
    window.addEventListener("resize", scheduleMeasure);
    measure();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [isDesktop]);

  return (
    <motion.main
      className="cumulus"
      data-loading-screen
      aria-busy={!ready}
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion ? 0 : SCREEN_FADE_SECONDS / playbackSpeed,
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: token("--bg-loading"),
        color: token("--text-on-accent"),
      }}
    >
      <span
        ref={titleBoundaryRef}
        aria-hidden="true"
        data-loading-title-boundary
        style={{
          position: "absolute",
          top: `calc(${token(SAFE_AREA_INSET_PROPERTIES.top)} + ${token("--space-xs")})`,
          left: 0,
          width: 0,
          height: 0,
          pointerEvents: "none",
        }}
      />
      <h1
        ref={titleRef}
        data-loading-card-types-label
        style={{
          position: "absolute",
          top:
            titleTop ??
            `max(${token(SAFE_AREA_INSET_PROPERTIES.top)}, ${token("--space-xs")})`,
          right: 0,
          left: 0,
          zIndex: 10,
          margin: 0,
          color: token("--text-on-accent"),
          font: token(isDesktop ? "--t-title" : "--t-title-sm"),
          textAlign: "center",
        }}
      >
        Dreamtides Cards:
      </h1>
      <section
        aria-label="Card anatomy"
        data-loading-card-stage
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          gap: isDesktop ? token("--space-s") : token("--space-6xl"),
          paddingTop: `max(${token(SAFE_AREA_INSET_PROPERTIES.top)}, ${token("--space-xs")})`,
          paddingRight: token("--space-xs"),
          paddingBottom: isDesktop
            ? `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-xs")})`
            : `calc(max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-xs")}) + ${token("--space-6xl")})`,
          paddingLeft: token("--space-xs"),
        }}
      >
        <AnnotatedLoadingCard
          groupId="runeboundChampion"
          cardTypeLabel="Character"
          model={view.runeboundChampion}
          annotations={RUNEBOUND_ANNOTATIONS}
          isDesktop={isDesktop}
        />
        <AnnotatedLoadingCard
          groupId="worldsAwait"
          cardTypeLabel="Event"
          model={view.worldsAwait}
          annotations={WORLDS_AWAIT_ANNOTATIONS}
          isDesktop={isDesktop}
        />
      </section>
      <footer
        data-loading-footer
        style={{
          position: "absolute",
          right: 0,
          bottom: isDesktop
            ? "14%"
            : `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-xs")})`,
          left: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {ready ? (
          <motion.div
            data-loading-begin-entry
            initial={reduceMotion ? false : { opacity: 0, scale: 0.84 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion
                ? 0
                : motionTimeSeconds("--dur-slow") / playbackSpeed,
            }}
            style={{
              display: "grid",
              width: isDesktop ? "min(22vw, 280px)" : "min(72vw, 260px)",
            }}
          >
            <GlassButton
              label="Begin"
              onPress={onBegin}
              size="prominent"
              variant="accent"
              testId="loading-begin"
            />
          </motion.div>
        ) : (
          <div
            role="status"
            data-loading-indicator
            style={{
              display: "flex",
              alignItems: "center",
              gap: token("--space-xs"),
              color: token("--text-on-accent"),
              font: token("--t-title"),
            }}
          >
            <SegmentedLoadingSpinner
              playbackSpeed={playbackSpeed}
              reduceMotion={reduceMotion}
            />
            <span>Loading</span>
          </div>
        )}
      </footer>
    </motion.main>
  );
}
