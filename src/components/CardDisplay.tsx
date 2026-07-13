import { CardView } from "../cumulus/components/card/CardView";
import type { CardViewProps } from "../cumulus/components/card/CardView";

/**
 * Compatibility wrapper for existing quest card surfaces.
 */
export function CardDisplay(props: CardViewProps) {
  return <CardView {...props} />;
}
