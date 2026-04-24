import type { TextItem } from "../core/types.js";

/** Rectangle in PDF point space. */
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Convert a pixel-space bounding box to PDF points.
 * Layout server returns pixels at a given DPI; PDF uses 72 points/inch.
 */
export function imageBboxToPdf(
  bbox: [number, number, number, number],
  dpi: number,
): PdfRect {
  const scale = 72 / dpi;
  return {
    x: bbox[0] * scale,
    y: bbox[1] * scale,
    w: (bbox[2] - bbox[0]) * scale,
    h: (bbox[3] - bbox[1]) * scale,
  };
}

/** Check if a point lies inside a rectangle (inclusive). */
export function pointInRect(px: number, py: number, r: PdfRect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** Get the center point of a TextItem. */
export function textItemCenter(item: TextItem): { x: number; y: number } {
  return {
    x: item.x + (item.width ?? item.w) / 2,
    y: item.y + (item.height ?? item.h) / 2,
  };
}
