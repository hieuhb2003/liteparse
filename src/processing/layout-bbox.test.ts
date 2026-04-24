import { describe, it, expect } from "vitest";
import { imageBboxToPdf, pointInRect, textItemCenter } from "./layout-bbox.js";

describe("imageBboxToPdf", () => {
  it("converts pixel bbox at 150 DPI to PDF points", () => {
    const result = imageBboxToPdf([150, 300, 450, 600], 150);
    expect(result.x).toBeCloseTo(72, 1);
    expect(result.y).toBeCloseTo(144, 1);
    expect(result.w).toBeCloseTo(144, 1);
    expect(result.h).toBeCloseTo(144, 1);
  });

  it("converts at 300 DPI with different scale", () => {
    const result = imageBboxToPdf([300, 600, 900, 1200], 300);
    expect(result.x).toBeCloseTo(72, 1);
    expect(result.y).toBeCloseTo(144, 1);
    expect(result.w).toBeCloseTo(144, 1);
    expect(result.h).toBeCloseTo(144, 1);
  });
});

describe("pointInRect", () => {
  const rect = { x: 10, y: 20, w: 100, h: 50 };

  it("returns true for point inside rect", () => {
    expect(pointInRect(50, 40, rect)).toBe(true);
  });

  it("returns true for point on rect edge (inclusive)", () => {
    expect(pointInRect(10, 20, rect)).toBe(true);
    expect(pointInRect(110, 70, rect)).toBe(true);
  });

  it("returns false for point outside rect", () => {
    expect(pointInRect(5, 10, rect)).toBe(false);
    expect(pointInRect(200, 40, rect)).toBe(false);
  });
});

describe("textItemCenter", () => {
  it("computes center from width/height", () => {
    const item = { str: "hi", x: 10, y: 20, width: 100, height: 50, w: 100, h: 50 };
    const center = textItemCenter(item);
    expect(center.x).toBe(60);
    expect(center.y).toBe(45);
  });
});
