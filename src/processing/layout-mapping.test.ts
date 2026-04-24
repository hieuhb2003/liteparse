import { describe, it, expect } from "vitest";
import type { TextItem } from "../core/types.js";
import type { PageData } from "../engines/pdf/interface.js";
import type { LayoutDetection, LayoutElement } from "../engines/layout/interface.js";
import { applyLayoutElements } from "./layout-mapping.js";

function makeItem(overrides: Partial<TextItem> & { str: string }): TextItem {
  return {
    x: 50,
    y: 50,
    width: 100,
    height: 15,
    w: 100,
    h: 15,
    ...overrides,
  };
}

function makePage(items: TextItem[] = []): PageData {
  return {
    pageNum: 1,
    width: 612,
    height: 792,
    textItems: items,
    images: [],
  };
}

function makeDetection(elements: LayoutElement[], w = 1000, h = 1400): LayoutDetection {
  return { imageWidth: w, imageHeight: h, elements };
}

describe("applyLayoutElements", () => {
  it("no-ops on empty detection", () => {
    const page = makePage([makeItem({ str: "hello" })]);
    const original = JSON.stringify(page.textItems);
    applyLayoutElements(page, makeDetection([]), 150);
    expect(JSON.stringify(page.textItems)).toBe(original);
  });

  it("no-ops when imageWidth is 0", () => {
    const page = makePage([makeItem({ str: "hello" })]);
    const det: LayoutDetection = { imageWidth: 0, imageHeight: 0, elements: [] };
    applyLayoutElements(page, det, 150);
    expect(page.textItems).toHaveLength(1);
  });

  it("replaces text inside formula bbox with synthetic formula tag", () => {
    // Formula bbox [150,300,450,600] at 150 DPI → PDF rect {x:72, y:144, w:144, h:144}
    // Item at x:100,y:200 → center (150, 207.5) → inside [72,144]-[216,288]
    // Item at x:10,y:10 → center (60, 17.5) → outside
    const page = makePage([
      makeItem({ str: "outside", x: 10, y: 10, width: 100, height: 15 }),
      makeItem({ str: "inside1", x: 80, y: 150, width: 60, height: 20 }),
      makeItem({ str: "inside2", x: 100, y: 200, width: 60, height: 20 }),
    ]);

    applyLayoutElements(
      page,
      makeDetection([
        { type: "formula", bbox: [150, 300, 450, 600], confidence: 0.9, latex: "E=mc^2" },
      ]),
      150,
    );

    expect(page.textItems.some((t) => t.str === "outside")).toBe(true);
    expect(page.textItems.some((t) => t.str === "inside1")).toBe(false);
    expect(page.textItems.some((t) => t.str === "inside2")).toBe(false);
    expect(page.textItems.some((t) => t.str === "<formula>E=mc^2</formula>")).toBe(true);

    const formula = page.textItems.find((t) => t.isFormula);
    expect(formula?.fontName).toBe("LAYOUT");
    expect(formula?.confidence).toBe(0.9);
  });

  it("skips formula with no latex", () => {
    const page = makePage([makeItem({ str: "keep", x: 50, y: 50 })]);

    applyLayoutElements(
      page,
      makeDetection([{ type: "formula", bbox: [0, 0, 2000, 2000], confidence: 0.9 }]),
      150,
    );

    expect(page.textItems.some((t) => t.str === "keep")).toBe(true);
    expect(page.textItems.some((t) => t.isFormula)).toBe(false);
  });

  it("wraps table region with open/close markers", () => {
    const page = makePage([makeItem({ str: "cell1", x: 100, y: 200, width: 50, height: 15 })]);

    applyLayoutElements(
      page,
      makeDetection([{ type: "table", bbox: [200, 400, 1000, 800], confidence: 0.88 }]),
      150,
    );

    expect(page.textItems.some((t) => t.str === "cell1")).toBe(true);
    const open = page.textItems.find((t) => t.str === "<table>");
    const close = page.textItems.find((t) => t.str === "</table>");
    expect(open).toBeDefined();
    expect(close).toBeDefined();
    expect(open?.isTableMarker).toBe(true);
    expect(close?.isTableMarker).toBe(true);
    expect(open?.fontName).toBe("LAYOUT");
  });

  it("handles nested formula inside table", () => {
    const page = makePage([makeItem({ str: "data", x: 100, y: 200, width: 50, height: 15 })]);

    applyLayoutElements(
      page,
      makeDetection([
        { type: "formula", bbox: [200, 400, 600, 460], confidence: 0.9, latex: "x^2" },
        { type: "table", bbox: [150, 350, 700, 600], confidence: 0.85 },
      ]),
      150,
    );

    expect(page.textItems.some((t) => t.str === "<formula>x^2</formula>")).toBe(true);
    expect(page.textItems.some((t) => t.str === "<table>")).toBe(true);
    expect(page.textItems.some((t) => t.str === "</table>")).toBe(true);
  });
});
