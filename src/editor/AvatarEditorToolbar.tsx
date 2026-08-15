import CardBrowserToolbar from "./card-browser/CardBrowserToolbar";
import type {
  CardBrowserSearchScope,
  CardBrowserSortOption,
  CardBrowserToolbarValues,
} from "./card-browser/card-browser-types";
import { DEFAULT_AVATAR_DISPLAY_STATE } from "./avatar-editor-url-state";
import type { AvatarDisplayState } from "./avatar-types";

interface AvatarEditorToolbarProps {
  displayState: AvatarDisplayState;
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: AvatarDisplayState) => void;
}

const AVATAR_SORT_OPTIONS: ReadonlyArray<CardBrowserSortOption> = [
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
  { value: "name", label: "Avatar name", placeholder: "Avatar name" },
  { value: "all", label: "Ability text", placeholder: "Name or ability text" },
];

export default function AvatarEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onDisplayStateChange,
}: AvatarEditorToolbarProps) {
  const handlePatch = (patch: Partial<CardBrowserToolbarValues>) => {
    onDisplayStateChange({ ...displayState, ...patch } as AvatarDisplayState);
  };

  const clearFilters = () => {
    onDisplayStateChange({
      ...displayState,
      searchText: DEFAULT_AVATAR_DISPLAY_STATE.searchText,
      searchScope: DEFAULT_AVATAR_DISPLAY_STATE.searchScope,
      sort: DEFAULT_AVATAR_DISPLAY_STATE.sort,
      dir: DEFAULT_AVATAR_DISPLAY_STATE.dir,
    });
  };

  return (
    <CardBrowserToolbar
      ariaLabel="Avatar editor controls"
      className="avatar-editor-toolbar"
      values={displayState}
      onPatch={handlePatch}
      subtypeOptions={[]}
      visibleCount={visibleCount}
      totalCount={totalCount}
      sortOptions={AVATAR_SORT_OPTIONS}
      searchScopeOptions={SEARCH_SCOPE_OPTIONS}
      itemLabelPlural="avatars"
      searchAriaLabel="Search avatars"
      showTypeFilter={false}
      showCostFilter={false}
      showSubtypeFilter={false}
      onClear={clearFilters}
    />
  );
}
