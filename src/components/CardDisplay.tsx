import { CardView } from "../tango/components/CardView";
import type { CardViewProps } from "../tango/components/CardView";

/**
 * Compatibility wrapper for existing quest card surfaces.
 */
export function CardDisplay(props: CardViewProps) {
  return <CardView {...props} />;
}
