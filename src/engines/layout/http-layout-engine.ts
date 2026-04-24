import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { LayoutDetection, LayoutElement, LayoutEngine, LayoutOptions } from "./interface.js";

interface LayoutResponseItem {
  type: string;
  bbox: [number, number, number, number];
  confidence: number;
  latex?: string;
}

interface LayoutResponse {
  image_width: number;
  image_height: number;
  layout: LayoutResponseItem[];
}

/** Hostname patterns that should never be used as layout server targets. */
const BLOCKED_HOST_PATTERNS = [
  /^169\.254\./, // link-local metadata (AWS, GCP, Azure)
  /^10\./, // private class A
  /^172\.(1[6-9]|2\d|3[01])\./, // private class B
  /^192\.168\./, // private class C
  /^127\./, // loopback
  /^0\./, // null route
];

/**
 * HTTP-based layout engine that calls a PaddleX layout/formula server.
 *
 * Server must implement the API defined in LAYOUT_API_SPEC.md:
 * - POST /layout endpoint
 * - Accepts multipart/form-data with 'file' and optional 'threshold' fields
 * - Returns JSON with image dimensions and detected layout elements
 */
export class HttpLayoutEngine implements LayoutEngine {
  name = "http-layout";
  private serverUrl: string;

  constructor(serverUrl: string) {
    if (!/^https?:\/\//.test(serverUrl)) {
      throw new Error(`layoutServerUrl must be http or https, got: ${serverUrl}`);
    }
    const parsed = new URL(serverUrl);
    const host = parsed.hostname;
    if (BLOCKED_HOST_PATTERNS.some((r) => r.test(host))) {
      throw new Error(`layoutServerUrl blocked: private/internal IP not allowed (${host})`);
    }
    this.serverUrl = serverUrl;
  }

  async detect(image: string | Buffer, options?: LayoutOptions): Promise<LayoutDetection> {
    try {
      const formData = new FormData();
      if (typeof image === "string") {
        formData.append("file", fs.createReadStream(image));
      } else {
        formData.append("file", image, { filename: "image.png", contentType: "image/png" });
      }

      if (options?.threshold !== undefined) {
        formData.append("threshold", String(options.threshold));
      }

      const response = await axios.post(this.serverUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 60000,
      });

      const data = response.data as LayoutResponse;

      if (!Array.isArray(data.layout)) {
        console.warn("Layout server response missing layout array (keys: %s)", Object.keys(response.data || {}).join(","));
        return { imageWidth: 0, imageHeight: 0, elements: [] };
      }

      const elements: LayoutElement[] = data.layout
        .filter(
          (item): item is LayoutResponseItem =>
            Array.isArray(item.bbox) &&
            item.bbox.length === 4 &&
            typeof item.type === "string" &&
            typeof item.confidence === "number",
        )
        .map((item) => ({
          type: item.type,
          bbox: item.bbox,
          confidence: item.confidence,
          ...(item.latex !== undefined && { latex: item.latex }),
        }));

      return {
        imageWidth: data.image_width ?? 0,
        imageHeight: data.image_height ?? 0,
        elements,
      };
    } catch (error) {
      const label = typeof image === "string" ? image : "<buffer>";
      if (axios.isAxiosError(error)) {
        console.warn(
          `Layout HTTP error for ${label}:`,
          error.response?.status,
          error.response?.data?.error || error.message,
        );
      } else {
        console.warn(`Layout error for ${label}:`, error);
      }
      return { imageWidth: 0, imageHeight: 0, elements: [] };
    }
  }
}
