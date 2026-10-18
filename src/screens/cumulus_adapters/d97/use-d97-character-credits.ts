// Loads the generated character credits (src/d97/overworld/characters/credits.ts)
// from the art origin the first time `active` holds, once per page: the
// credits screen asks while it is open. Null until loaded, and when the file
// is absent or malformed.

import { useEffect, useState } from "react";
import { CHARACTER_CREDITS_PATH, parseCharacterCredits, type CharacterCredits } from "../../../d97/overworld/characters/credits";
import { assetUrl } from "../../../runtime/asset-url";

let loaded: Promise<CharacterCredits | null> | null = null;

function loadCharacterCredits(): Promise<CharacterCredits | null> {
  loaded ??= fetch(assetUrl(CHARACTER_CREDITS_PATH))
    .then(async (response) => (response.ok ? parseCharacterCredits(await response.json()) : null))
    .catch(() => null);
  return loaded;
}

export function useD97CharacterCredits(active: boolean): CharacterCredits | null {
  const [credits, setCredits] = useState<CharacterCredits | null>(null);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void loadCharacterCredits().then((value) => {
      if (current) setCredits(value);
    });
    return () => {
      current = false;
    };
  }, [active]);
  return credits;
}
