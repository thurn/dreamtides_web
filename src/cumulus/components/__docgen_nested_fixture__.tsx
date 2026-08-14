// Docgen fixture exercised ONLY by scripts/generate-cumulus-metadata.test.mjs to
// assert nested model-object expansion. The component takes a prop whose type is
// a named object interface (`NestedFixtureModel`) plus an array-of-model prop,
// so the generator's `buildNestedResolver` can be asserted structurally.
//
// The `__docgen_nested_fixture__` double-underscore prefix marks it as a
// fixture, so the generator's real-file glob skips it and it never leaks into
// the committed cumulus-metadata.json.

import type { DocgenFixtureProps } from "./__docgen_fixture__";

declare const fixtureBrand: unique symbol;
type NestedFixtureBrand = string & {
  readonly [fixtureBrand]: "NestedFixtureBrand";
};

/** A nested model the fixture prop points at. */
export interface NestedFixtureModel {
  /** How the widget is labelled. */
  label: string;
  count?: number;
  tone: "calm" | "loud";
  imported?: DocgenFixtureProps;
}

interface NestedFixturePrimaryVariant {
  kind: "primary";
  label: string;
  count: number;
}

interface NestedFixtureSecondaryVariant {
  kind: "secondary";
  label: string;
  muted?: boolean;
}

type NestedFixtureVariant =
  NestedFixturePrimaryVariant | NestedFixtureSecondaryVariant;

interface NestedFixtureProps {
  /** The single model object. */
  model: NestedFixtureModel;
  /** A list of models. */
  models: NestedFixtureModel[];
  /** A plain flag with no nested shape. */
  active: boolean;
  /** A primitive-backed nominal value. */
  brandedValue: NestedFixtureBrand;
  /** A discriminated model union. */
  variant: NestedFixtureVariant;
}

/**
 * A throwaway component used purely to validate nested-model extraction.
 */
export function NestedFixture({
  model,
  models,
  active,
  brandedValue,
  variant,
}: NestedFixtureProps) {
  return (
    <div
      data-active={active}
      data-branded-value={brandedValue}
      data-label={model.label}
      data-variant={variant.kind}
    >
      {models.length}
    </div>
  );
}

export default NestedFixture;
