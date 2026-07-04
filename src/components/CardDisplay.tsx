import { CardView } from "../tango/components/card/CardView";
import type { CardViewProps } from "../tango/components/card/CardView";

/**
 * Compatibility wrapper for existing quest card surfaces.
 */
export function CardDisplay(props: CardViewProps) {
  return <CardView {...props} />;
}
