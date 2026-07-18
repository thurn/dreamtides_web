import CardBrowserToolbar from "./card-browser/CardBrowserToolbar";
import type {
  CardBrowserSearchScope,
  CardBrowserSortOption,
  CardBrowserToolbarValues,
} from "./card-browser/card-browser-types";
import { DEFAULT_DREAMCALLER_DISPLAY_STATE } from "./dreamcaller-editor-url-state";
import type { DreamcallerDisplayState } from "./dreamcaller-types";

interface DreamcallerEditorToolbarProps {
  displayState: DreamcallerDisplayState;
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: DreamcallerDisplayState) => void;
}

const DREAMCALLER_SORT_OPTIONS: ReadonlyArray<CardBrowserSortOption> = [
  { value: "sourceOrder", label: "Source Order" },
  { value: "name", label: "Name" },
  { value: "startingEssence", label: "Starting Essence" },
  { value: "rulesTextLength", label: "Ability Text Length" },
  { value: "facetCount", label: "Facet Count" },
];

const SEARCH_SCOPE_OPTIONS: ReadonlyArray<{
  value: CardBrowserSearchScope;
  label: string;
  placeholder: string;
}> = [
  { value: "name", label: "Dreamcaller name", placeholder: "Dreamcaller name" },
  { value: "all", label: "Ability text", placeholder: "Name or ability text" },
];

export default function DreamcallerEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onDisplayStateChange,
}: DreamcallerEditorToolbarProps) {
  const handlePatch = (patch: Partial<CardBrowserToolbarValues>) => {
    onDisplayStateChange({ ...displayState, ...patch } as DreamcallerDisplayState);
  };

  const clearFilters = () => {
    onDisplayStateChange({
      ...displayState,
      searchText: DEFAULT_DREAMCALLER_DISPLAY_STATE.searchText,
      searchScope: DEFAULT_DREAMCALLER_DISPLAY_STATE.searchScope,
      sort: DEFAULT_DREAMCALLER_DISPLAY_STATE.sort,
      dir: DEFAULT_DREAMCALLER_DISPLAY_STATE.dir,
    });
  };

  return (
    <CardBrowserToolbar
      ariaLabel="Dreamcaller editor controls"
      className="dreamcaller-editor-toolbar"
      values={displayState}
      onPatch={handlePatch}
      subtypeOptions={[]}
      visibleCount={visibleCount}
      totalCount={totalCount}
      sortOptions={DREAMCALLER_SORT_OPTIONS}
      searchScopeOptions={SEARCH_SCOPE_OPTIONS}
      itemLabelPlural="dreamcallers"
      searchAriaLabel="Search dreamcallers"
      showTypeFilter={false}
      showCostFilter={false}
      showSubtypeFilter={false}
      onClear={clearFilters}
    />
  );
}
