import type { ReactElement } from "react";
import { SiteLayout, type SiteLayoutGuide } from "../layout/SiteLayout";
import type { BattleForeseeResult } from "../battle/BattleForeseeEditor";
import type { BattlefieldCardInteraction } from "../battle/BattlefieldCard";
import type { TransfigurationPickerState } from "../card/TransfigurationPickerPanel";
import type { ArtRef } from "../../primitives/art";
import { asSiteId } from "../../../types/identifiers";

declare const art: ArtRef;
declare const guide: SiteLayoutGuide;

const invalidLayout: ReactElement = (
  <SiteLayout
    siteId={asSiteId("fixture")}
    scene={art}
    moteTint="warm"
    guide={guide}
    // @ts-expect-error callers choose one supported responsive composition recipe.
    composition="custom-grid"
  >
    <div />
  </SiteLayout>
);

// @ts-expect-error ready picker states include presentation and cards together.
const incompletePicker: TransfigurationPickerState = {
  kind: "ready",
  cards: [],
};

// @ts-expect-error a complete Foresee result always partitions deck and Void IDs.
const incompleteForeseeResult: BattleForeseeResult = {
  viewedCardIds: [],
  orderedCardIds: [],
};

const passiveWithDrag: BattlefieldCardInteraction = {
  kind: "passive",
  // @ts-expect-error passive battlefield cards cannot receive drag callbacks.
  onDragStart: () => undefined,
};

void invalidLayout;
void incompletePicker;
void incompleteForeseeResult;
void passiveWithDrag;
