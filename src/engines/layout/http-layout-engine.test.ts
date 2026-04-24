import { vi, describe, it, expect } from "vitest";

const mockLayoutItems = [
  { type: "formula", bbox: [100, 200, 500, 280], confidence: 0.95, latex: "E=mc^2" },
  { type: "table", bbox: [50, 400, 800, 700], confidence: 0.88 },
];

const mockResponse = {
  image_width: 1000,
  image_height: 1400,
  layout: mockLayoutItems,
};

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      post: vi.fn(async (url: string, _formData?: any, _config?: any) => {
        if (url === "http://localhost:9999") {
          throw new actual.AxiosError("Server Error", "500");
        }
        if (url === "http://localhost:9998") {
          return { data: { image_width: 100 } }; // missing layout array
        }
        return { data: mockResponse };
      }),
    },
  };
});

import { HttpLayoutEngine } from "./http-layout-engine.js";

describe("HttpLayoutEngine", () => {
  it("rejects non-http URLs in constructor", () => {
    expect(() => new HttpLayoutEngine("ftp://bad")).toThrow("must be http or https");
  });

  it("blocks private IPs (SSRF prevention)", () => {
    expect(() => new HttpLayoutEngine("http://127.0.0.1:8830/layout")).toThrow(/private.*not allowed/);
    expect(() => new HttpLayoutEngine("http://192.168.1.1:8830/layout")).toThrow(/private.*not allowed/);
    expect(() => new HttpLayoutEngine("http://10.0.0.1:8830/layout")).toThrow(/private.*not allowed/);
    expect(() => new HttpLayoutEngine("http://169.254.169.254/latest")).toThrow(/private.*not allowed/);
  });

  it("allows public URLs", () => {
    expect(() => new HttpLayoutEngine("http://localhost:8830/layout")).not.toThrow();
    expect(() => new HttpLayoutEngine("http://example.com:8830/layout")).not.toThrow();
  });

  it("returns typed LayoutDetection on success", async () => {
    const engine = new HttpLayoutEngine("http://localhost:8830/layout");
    const result = await engine.detect(Buffer.from("fake-png"));

    expect(result.imageWidth).toBe(1000);
    expect(result.imageHeight).toBe(1400);
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0]).toEqual({
      type: "formula",
      bbox: [100, 200, 500, 280],
      confidence: 0.95,
      latex: "E=mc^2",
    });
    expect(result.elements[1]).toEqual({
      type: "table",
      bbox: [50, 400, 800, 700],
      confidence: 0.88,
    });
  });

  it("returns empty elements on HTTP error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = new HttpLayoutEngine("http://localhost:9999");
    const result = await engine.detect(Buffer.from("fake"));

    expect(result.elements).toHaveLength(0);
    expect(result.imageWidth).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns empty on malformed response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = new HttpLayoutEngine("http://localhost:9998");
    const result = await engine.detect(Buffer.from("fake"));

    expect(result.elements).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
