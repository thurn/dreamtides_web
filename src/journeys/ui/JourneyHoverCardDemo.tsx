/**
 * Standalone debug demo for the journey hover card. Renders the
 * `JourneyOptionCircle` with hardcoded data so the hover stack can be
 * exercised without progressing through a real quest. Wired into `main.tsx`
 * behind the `?demo=journey-hover` query param.
 *
 * Includes three demo circles whose effect text covers:
 *   1. no glossary terms (definition stack should be empty).
 *   2. one term (single definition panel beneath the prose).
 *   3. multiple terms incl. plurals (deduplicated stack in first-occurrence
 *      order).
 */

import { useState } from "react";

import { JourneyOptionCircle } from "./JourneyOptionCircle";

interface DemoCase {
  readonly dreamName: string;
  readonly text: string;
}

const DEMO_CASES: readonly DemoCase[] = [
  {
    dreamName: "Quiet Grove",
    text:
      "Gain 2 essence and one point. No special terminology appears in this prose.",
  },
  {
    dreamName: "Burning Pact",
    text: "Gain 1 essence. Add a Bane to your deck.",
  },
  {
    dreamName: "Twilight Trial",
    text:
      "Purge up to 2 chosen Banes from your deck, then Transfigure a card and Foresee 1.",
  },
];

export function JourneyHoverCardDemo() {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-12 px-4 py-12"
      style={{ background: "#05020a" }}
    >
      <h1
        className="text-3xl font-bold tracking-wide"
        style={{ color: "#c084fc" }}
      >
        Journey hover demo
      </h1>
      <div className="flex flex-wrap items-start justify-center gap-12">
        {DEMO_CASES.map((demo, index) => {
          const key = `demo-${String(index)}`;
          return (
            <JourneyOptionCircle
              key={key}
              imageUrl={`/journeys/${String(101 + index)}.jpg`}
              dreamName={demo.dreamName}
              text={demo.text}
              locked={false}
              hovered={hoveredKey === key}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() =>
                setHoveredKey((current) => (current === key ? null : current))
              }
              onEnterDream={() => {
                /* demo only */
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
