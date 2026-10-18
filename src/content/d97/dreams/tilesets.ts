// The D97 tileset catalog (Appendix B §B1): the art sets dreams are drawn in,
// each in one of four categories. A catalog dream names its tileset by UUID
// (`tilesetId` in `./schema.ts`), and its category is its tileset's. Act
// assembly reads both: no tileset repeats within an act, an act spans at
// least three categories, and doors prefer to join dreams of different
// categories (§B4). Labels are internal names for art sets and never appear
// in game (decision P10).

import { parseD97TilesetId, type D97TilesetId } from "../../../types/identifiers";

export type D97TilesetCategory = "fantasy" | "sciFi" | "historic" | "nature";

export interface D97Tileset {
  readonly id: D97TilesetId;
  readonly category: D97TilesetCategory;
  /** The art set's internal label, for authors and tools only. */
  readonly label: string;
}

const tileset = (id: D97TilesetId, category: D97TilesetCategory, label: string): D97Tileset => ({ id, category, label });
const uuid = parseD97TilesetId;

export const D97_TILESETS: readonly D97Tileset[] = [
  tileset(uuid("bc942d17-dc02-4e71-9b69-d7b4a43ca032"), "fantasy", "Dwarven dungeon (Frostforge)"),
  tileset(uuid("610a0045-09f5-4462-a507-c565f7e53a9a"), "fantasy", "Elven realm"),
  tileset(uuid("1a4773ab-988b-445f-8c77-3a483a575c34"), "fantasy", "Talking-animal village (Tumbleleaf Village)"),
  tileset(uuid("e08e3bc6-87e2-44ae-96ca-4ef6d09ff45a"), "fantasy", "Graveyard chapel (Hope's End)"),
  tileset(uuid("352ac103-fe35-4c7a-9c27-22f887554add"), "sciFi", "Space colony (Farpoint Station)"),
  tileset(uuid("9511be3d-b5dd-474d-a776-c271dd3e2696"), "sciFi", "Cyberpunk city (Grid City)"),
  tileset(uuid("da75f9d8-89d9-49c3-b4be-385370ccaab0"), "sciFi", "Post-apocalyptic wasteland (The Rust Expanse)"),
  tileset(uuid("ae87cbce-6c1e-488e-ba58-713ae5c0199d"), "historic", "Egypt (Pharaoh's Gate)"),
  tileset(uuid("68f572fc-2bb7-4fd3-8444-8a564ed0e86c"), "historic", "Viking (Winterwake Fjords)"),
  tileset(uuid("8371b413-c7ea-409d-af68-256d72f66e8a"), "historic", "Samurai Japan (Tsukiren)"),
  tileset(uuid("526f1f96-4b6e-4c21-8b36-74690475d758"), "historic", "Pirate island"),
  tileset(uuid("f09b454e-6c8d-4641-8c90-b6aaa579280d"), "nature", "Enchanted forest (Wilderveil)"),
  tileset(uuid("bcdfb114-3804-45a7-831f-ac4db852bf8c"), "nature", "Meadow"),
  tileset(uuid("a3669e43-2553-49c9-8306-df9b11532c0b"), "nature", "Snowfield"),
];
