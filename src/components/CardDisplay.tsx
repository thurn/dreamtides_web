import { CardView } from "./CardView";
import type { CardViewProps } from "./CardView";

/**
 * Compatibility wrapper for existing quest card surfaces.
 */
export function CardDisplay(props: CardViewProps) {
  return <CardView {...props} />;
}
