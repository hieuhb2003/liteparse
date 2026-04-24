/**
 * Layout detection engine interface and types.
 *
 * A layout engine analyzes page images to detect structural elements
 * (formulas, tables, titles, etc.) and returns their bounding boxes
 * with optional metadata like LaTeX for formulas.
 *
 * @see {@link HttpLayoutEngine} for the HTTP-based implementation.
 */

/** Supported layout element types from PaddleX PicoDet-L_layout_17cls. */
export type LayoutType =
  | "formula"
  | "table"
  | "text"
  | "title"
  | "figure"
  | "figure_title"
  | "table_title"
  | "header"
  | "footer"
  | "reference"
  | "abstract"
  | (string & {});

/** A single detected layout element on a page. */
export interface LayoutElement {
  /** Element type (e.g., "formula", "table", "text"). */
  type: LayoutType;
  /** Bounding box as [x1, y1, x2, y2] in pixels at the source DPI. */
  bbox: [number, number, number, number];
  /** Detection confidence from 0.0 to 1.0. */
  confidence: number;
  /** LaTeX string for formula elements. Undefined for non-formula types. */
  latex?: string;
}

/** Layout detection result for a single page image. */
export interface LayoutDetection {
  /** Width of the source image in pixels. */
  imageWidth: number;
  /** Height of the source image in pixels. */
  imageHeight: number;
  /** Detected layout elements. */
  elements: LayoutElement[];
}

/** Optional parameters for layout detection. */
export interface LayoutOptions {
  /** Minimum confidence threshold (0.0–1.0). Default determined by server. */
  threshold?: number;
}

/**
 * Layout detection engine interface.
 *
 * Implementations analyze page images and return detected structural elements.
 * Mirrors the {@link OcrEngine} pattern for consistency.
 */
export interface LayoutEngine {
  /** Engine name for logging. */
  name: string;
  /** Detect layout elements in an image. */
  detect(image: string | Buffer, options?: LayoutOptions): Promise<LayoutDetection>;
}
