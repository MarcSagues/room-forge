/** What the panel shows about an item (the host maps its manifest entries to this). */
export interface CatalogPanelItem {
  id: string;
  /** Already in the language of the panel. */
  name: string;
  /** Colour of the box that stands in for the model, and of the card's swatch without a picture. */
  color: string;
  /** Bounding box in metres; the panel shows the footprint in centimetres. */
  size: { w: number; h: number; d: number };
  /** One of the panel's `categories`; an item without one is only listed under "All". */
  category?: string;
  /** Other words the search finds the item by: its name in other languages, its tags. */
  keywords?: readonly string[];
  /** URL of a square picture of the item (same origin, for the CSP's `img-src 'self'`). */
  thumbnail?: string;
}

/** A category of the filter, in the order the panel lists them. */
export interface CatalogCategoryOption {
  id: string;
  label: string;
}

/**
 * Dragging an item into the viewport, in page coordinates. The scene owns the 3D ghost; the panel
 * only forwards the pointer (pointer events, not native drag and drop, so the ghost can be 3D
 * and touch works).
 */
export interface CatalogPlacement {
  /** The item left the panel; false when the scene cannot take it (no room). */
  begin(id: string): boolean;
  move(clientX: number, clientY: number, free: boolean): void;
  /** Released: true when an object was created. */
  end(clientX: number, clientY: number): boolean;
  cancel(): void;
}
