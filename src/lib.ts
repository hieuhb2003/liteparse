/**
 * @packageDocumentation
 *
 * LiteParse — open-source PDF parsing with spatial text extraction, OCR, and bounding boxes.
 *
 * @example
 * ```typescript
 * import { LiteParse } from "@llamaindex/liteparse";
 *
 * const parser = new LiteParse({ ocrEnabled: true });
 * const result = await parser.parse("document.pdf");
 * console.log(result.text);
 * ```
 */
export { LiteParse } from "./core/parser.js";
export { searchItems } from "./processing/searchItems.js";
export type {
  LayoutType,
  LayoutElement,
  LayoutDetection,
  LayoutOptions,
  LayoutEngine,
} from "./engines/layout/interface.js";
export type {
  LiteParseConfig,
  LiteParseInput,
  OutputFormat,
  ParseResult,
  ParseResultJson,
  ParsedPage,
  BoundingBox,
  TextItem,
  JsonTextItem,
  SearchItemsOptions,
  ScreenshotResult,
  MarkupData,
} from "./core/types.js";
export type { GridDebugConfig } from "./processing/gridDebugLogger.js";
