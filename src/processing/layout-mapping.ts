import type { TextItem } from "../core/types.js";
import type { PageData } from "../engines/pdf/interface.js";
import type { LayoutDetection, LayoutElement } from "../engines/layout/interface.js";
import { imageBboxToPdf, pointInRect, textItemCenter, type PdfRect } from "./layout-bbox.js";

/** Vertical offset for table markers so they land on their own grid line. */
const TABLE_MARKER_EPSILON = 0.5;
/** Height for synthetic markers — must exceed SMALL_FONT_SIZE_THRESHOLD (2) in grid projection. */
const MARKER_HEIGHT = 3;

/**
 * Apply all layout elements to a page's text items.
 * Formulas are processed first (text replacement), then tables (text wrapping).
 * Mutates `page.textItems` in place.
 */
export function applyLayoutElements(
  page: PageData,
  detection: LayoutDetection,
  dpi: number,
): void {
  if (!detection.elements.length || !detection.imageWidth) return;

  const formulas = detection.elements.filter(
    (e) => e.type === "formula" && e.latex,
  );
  const tables = detection.elements.filter((e) => e.type === "table");

  if (formulas.length) applyFormulaElements(page, formulas, dpi);
  if (tables.length) applyTableElements(page, tables, dpi);
}

/**
 * Replace text items inside formula bounding boxes with synthetic `<formula>` items.
 * Removes native text whose center falls inside the formula bbox, then injects
 * a single synthetic TextItem carrying the LaTeX string.
 */
function applyFormulaElements(
  page: PageData,
  elements: LayoutElement[],
  dpi: number,
): void {
  const injected: TextItem[] = [];

  for (const el of elements) {
    const rect = imageBboxToPdf(el.bbox, dpi);

    // Remove items whose center lies inside the formula bbox
    page.textItems = page.textItems.filter((item) => {
      const c = textItemCenter(item);
      return !pointInRect(c.x, c.y, rect);
    });

    injected.push(makeSynthetic(`<formula>${el.latex}</formula>`, rect, 0, rect.h, {
      isFormula: true,
      confidence: el.confidence,
    }));
  }

  page.textItems.push(...injected);
}

/**
 * Wrap text items inside table bounding boxes with `<table>` / `</table>` markers.
 * Does NOT remove or modify existing text — only adds opening and closing tags.
 */
function applyTableElements(
  page: PageData,
  elements: LayoutElement[],
  dpi: number,
): void {
  const markers: TextItem[] = [];

  for (const el of elements) {
    const rect = imageBboxToPdf(el.bbox, dpi);

    // Opening tag just above the table region
    markers.push(
      makeSynthetic("<table>", rect, -TABLE_MARKER_EPSILON, MARKER_HEIGHT, {
        isTableMarker: true,
      }),
    );

    // Closing tag just below the table region
    markers.push(
      makeSynthetic("</table>", rect, rect.h + TABLE_MARKER_EPSILON, MARKER_HEIGHT, {
        isTableMarker: true,
      }),
    );
  }

  page.textItems.push(...markers);
}

/** Create a synthetic TextItem for layout tags. */
function makeSynthetic(
  str: string,
  rect: PdfRect,
  yOffset: number,
  h: number,
  extras: Partial<TextItem>,
): TextItem {
  return {
    str,
    x: rect.x,
    y: rect.y + yOffset,
    width: rect.w,
    height: h,
    w: rect.w,
    h,
    fontName: "LAYOUT",
    ...extras,
  };
}
