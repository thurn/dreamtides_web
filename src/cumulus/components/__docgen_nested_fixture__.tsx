// Docgen fixture exercised ONLY by scripts/generate-cumulus-metadata.test.mjs to
// assert nested model-object expansion. The component takes a prop whose type is
// a named object interface (`NestedFixtureModel`) plus an array-of-model prop,
// so the generator's `buildNestedResolver` can be asserted structurally.
//
// The `__docgen_nested_fixture__` double-underscore prefix marks it as a
// fixture, so the generator's real-file glob skips it and it never leaks into
// the committed cumulus-metadata.json.

/** A nested model the fixture prop points at. */
export interface NestedFixtureModel {
  /** How the widget is labelled. */
  label: string;
  count?: number;
  tone: "calm" | "loud";
}

interface NestedFixtureProps {
  /** The single model object. */
  model: NestedFixtureModel;
  /** A list of models. */
  models: NestedFixtureModel[];
  /** A plain flag with no nested shape. */
  active: boolean;
}

/**
 * A throwaway component used purely to validate nested-model extraction.
 */
export function NestedFixture({ model, models, active }: NestedFixtureProps) {
  return (
    <div data-active={active} data-label={model.label}>
      {models.length}
    </div>
  );
}

export default NestedFixture;
